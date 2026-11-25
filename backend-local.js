// وضع المعاينة: نفس واجهة Supabase لكن البيانات في متصفحك فقط (IndexedDB)
// يطبّق نفس قواعد الطلب (حساب الأسعار، المخزون، الكوبونات) لتجربة المتجر قبل الربط
import { blobToDataURL } from './util.js';

export class ApiError extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const fail = m => { throw new ApiError(m); };
const now = () => new Date().toISOString();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const r2 = n => Math.round(n * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));

const EMPTY = () => ({ v: 1, seq: 1001, users: [], admins: [], profiles: {}, favorites: [], categories: [], products: [], shipping_methods: [], coupons: [], orders: [], order_items: [], order_notes: {} });

function idb() {
  return new Promise((ok, bad) => {
    try {
      const r = indexedDB.open('lune-preview', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
    } catch (e) { bad(e); }
  });
}

async function hash(pw) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lune:' + pw));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch { return 'plain:' + pw; }
}

export async function createBackend() {
  let db = EMPTY(), store = null, persistent = true;
  try {
    store = await idb();
    const saved = await new Promise(ok => { const t = store.transaction('kv').objectStore('kv').get('db'); t.onsuccess = () => ok(t.result); t.onerror = () => ok(null); });
    if (saved) db = { ...EMPTY(), ...saved };
  } catch { persistent = false; }

  const save = () => new Promise(ok => {
    if (!store) return ok();
    try { const t = store.transaction('kv', 'readwrite'); t.objectStore('kv').put(db, 'db'); t.oncomplete = ok; t.onerror = ok; } catch { ok(); }
  });

  const SKEY = 'lune.preview.session';
  let me = null;
  try { const s = JSON.parse(sessionStorage.getItem(SKEY) || localStorage.getItem(SKEY) || 'null'); me = s && db.users.find(u => u.id === s.id) ? s : null; } catch { }
  const listeners = new Set();
  const setMe = u => {
    me = u ? { id: u.id, email: u.email, user_metadata: { full_name: u.name } } : null;
    try { me ? localStorage.setItem(SKEY, JSON.stringify(me)) : localStorage.removeItem(SKEY); } catch { }
    listeners.forEach(f => f(me));
  };
  const isAdmin = () => !!me && db.admins.includes(me.id);
  const needAdmin = () => { if (!isAdmin()) fail('ليست لديك صلاحية لهذا الإجراء'); };
  const tick = () => new Promise(r => setTimeout(r, 60));

  function compute(p) {
    const items = Array.isArray(p.items) ? p.items : fail('السلة فارغة');
    if (!items.length) fail('السلة فارغة');
    // تجميع حسب (المنتج، المقاس)، والمخزون يُقارن بمجموع كميات المنتج
    const agg = {}, tot = {};
    for (const it of items) {
      const sz = String(it.size || '').trim() || null, k = it.product_id + '|' + (sz || '');
      agg[k] ||= { pid: it.product_id, sz, qty: 0 }; agg[k].qty += Number(it.quantity);
      tot[it.product_id] = (tot[it.product_id] || 0) + Number(it.quantity);
    }
    let subtotal = 0; const lines = [];
    for (const { pid, sz: rawSz, qty } of Object.values(agg)) {
      const pr = db.products.find(x => x.id === pid);
      if (!pr || !pr.is_active) fail('أحد المنتجات لم يعد متوفراً');
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) fail(`كمية غير صالحة للمنتج: ${pr.name}`);
      let sz = rawSz;
      if ((pr.sizes || []).length) {
        if (!sz) fail(`يرجى اختيار المقاس للمنتج «${pr.name}»`);
        if (!pr.sizes.includes(sz)) fail(`المقاس ${sz} غير متوفر للمنتج «${pr.name}»`);
      } else sz = null;
      if (pr.stock === 0) fail(`نفدت كمية «${pr.name}»`);
      if (pr.stock < tot[pid]) fail(`الكمية المتوفرة من «${pr.name}» هي ${pr.stock} فقط`);
      subtotal = r2(subtotal + pr.price * qty);
      lines.push({ product_id: pid, name: pr.name, image: pr.images[0] || null, size: sz, unit_price: pr.price, quantity: qty, line_total: r2(pr.price * qty) });
    }
    let fee = 0, ship = null;
    if (p.shipping_method_id) {
      ship = db.shipping_methods.find(s => s.id === p.shipping_method_id && s.is_active) || fail('طريقة الشحن غير متاحة');
      fee = ship.free_over != null && subtotal >= ship.free_over ? 0 : ship.price;
    }
    let discount = 0, coupon = null;
    const code = String(p.coupon_code || '').trim().toUpperCase();
    if (code) {
      const t = Date.now();
      coupon = db.coupons.find(c => c.code.toUpperCase() === code && c.is_active
        && (!c.starts_at || Date.parse(c.starts_at) <= t) && (!c.expires_at || Date.parse(c.expires_at) > t)
        && (c.max_uses == null || c.used_count < c.max_uses));
      if (!coupon) fail('كود الخصم غير صالح أو منتهي');
      if (subtotal < coupon.min_order) fail(`كود الخصم يتطلب طلباً بقيمة ${coupon.min_order.toFixed(2)} ر.س على الأقل`);
      discount = coupon.type === 'percent' ? r2(subtotal * coupon.value / 100) : Math.min(coupon.value, subtotal);
      if (coupon.type === 'percent' && coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
    }
    return { items: lines, subtotal, discount, shipping_fee: fee, shipping_method_id: ship?.id || null, shipping_name: ship?.name || null, coupon_code: coupon?.code || null, total: r2(subtotal - discount + fee) };
  }

  const NUM = { products: ['price', 'compare_at_price', 'stock'], shipping_methods: ['price', 'free_over', 'sort_order'], coupons: ['value', 'max_discount', 'min_order', 'max_uses'], categories: ['sort_order'] };
  function normalize(table, row) {
    const o = { ...row };
    for (const k of NUM[table] || []) if (k in o) o[k] = o[k] === null || o[k] === '' ? null : Number(o[k]);
    if ('slug' in o && !/^[a-z0-9-]+$/.test(o.slug || '')) fail('الرابط المختصر يقبل أحرفاً إنجليزية صغيرة وأرقاماً و - فقط');
    if (table === 'coupons' && 'code' in o) { if (!/^[A-Z0-9_-]{2,30}$/.test(o.code)) fail('كود الخصم: أحرف إنجليزية كبيرة وأرقام فقط (2-30)'); }
    if (table === 'products' && 'stock' in o && (o.stock < 0 || !Number.isInteger(o.stock))) fail('إحدى القيم غير صالحة');
    if ('price' in o && (o.price == null || o.price < 0)) fail('إحدى القيم غير صالحة');
    return o;
  }
  function unique(table, row, selfId) {
    const checks = { products: ['slug', 'sku'], categories: ['slug'], coupons: ['code'] }[table] || [];
    for (const k of checks) if (row[k] && db[table].some(x => x.id !== selfId && String(x[k]).toUpperCase() === String(row[k]).toUpperCase()))
      fail({ slug: 'الرابط المختصر (slug) مستخدم مسبقاً', sku: 'رمز المنتج (SKU) مستخدم مسبقاً', code: 'كود الخصم موجود مسبقاً' }[k]);
  }
  const DEFAULTS = {
    products: { category_id: null, description: '', compare_at_price: null, stock: 0, sku: null, images: [], sizes: [], is_active: true, is_featured: false },
    categories: { description: '', image_url: null, sort_order: 0, is_active: true },
    shipping_methods: { description: '', free_over: null, eta: '', is_active: true, sort_order: 0 },
    coupons: { max_discount: null, min_order: 0, max_uses: null, used_count: 0, starts_at: null, expires_at: null, is_active: true }
  };

  const restoreOrder = o => {
    for (const it of db.order_items.filter(i => i.order_id === o.id)) {
      const p = db.products.find(x => x.id === it.product_id); if (p) p.stock += it.quantity;
    }
    if (o.coupon_code) { const c = db.coupons.find(x => x.code.toUpperCase() === o.coupon_code.toUpperCase()); if (c) c.used_count = Math.max(0, c.used_count - 1); }
  };

  return {
    mode: 'preview', persistent, ApiError,

    async categories() { return clone(db.categories.filter(c => c.is_active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))); },
    async shipping() { return clone(db.shipping_methods.filter(s => s.is_active).sort((a, b) => a.sort_order - b.sort_order || a.price - b.price)); },
    async products({ category, q, sort = 'new', featured, ids, limit } = {}) {
      let l = db.products.filter(p => p.is_active);
      if (category) l = l.filter(p => p.category_id === category);
      if (featured) l = l.filter(p => p.is_featured);
      if (ids) l = l.filter(p => ids.includes(p.id));
      const s = String(q || '').trim().toLowerCase();
      if (s) l = l.filter(p => (p.name + ' ' + (p.description || '')).toLowerCase().includes(s));
      l.sort(sort === 'price_asc' ? (a, b) => a.price - b.price : sort === 'price_desc' ? (a, b) => b.price - a.price : (a, b) => b.created_at.localeCompare(a.created_at));
      return clone(limit ? l.slice(0, limit) : l);
    },
    async product(slug) { return clone(db.products.find(p => p.slug === slug && p.is_active) || null); },
    async quote(p) { return compute(p); },
    async placeOrder(p) {
      await tick();
      const c = p.customer || {};
      const name = String(c.name || '').trim(); let phone = String(c.phone || '').replace(/[\s-]/g, '').replace(/^(\+?966)/, '0');
      if (name.length < 2 || name.length > 100) fail('يرجى إدخال الاسم');
      if (!/^05\d{8}$/.test(phone)) fail('رقم الجوال غير صحيح (مثال: 05xxxxxxxx)');
      const email = String(c.email || '').trim().toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('البريد الإلكتروني غير صحيح');
      if (String(c.city || '').trim().length < 2) fail('يرجى اختيار المدينة');
      if (String(c.address || '').trim().length < 5) fail('يرجى إدخال العنوان بالتفصيل');
      if (!['online', 'cod'].includes(p.payment_method || 'online')) fail('طريقة الدفع غير صالحة');
      if (!p.shipping_method_id) fail('يرجى اختيار طريقة الشحن');
      const q = compute(p);
      const o = { id: id(), order_number: db.seq++, access_token: id(), user_id: me?.id || null, customer_name: name, phone, email: email || null, city: c.city.trim(), district: c.district || null, address: c.address.trim(), notes: c.notes || null, shipping_method_id: q.shipping_method_id, shipping_name: q.shipping_name, subtotal: q.subtotal, discount: q.discount, shipping_fee: q.shipping_fee, total: q.total, coupon_code: q.coupon_code, payment_method: p.payment_method || 'online', payment_status: 'unpaid', payment_id: null, status: 'pending', created_at: now(), updated_at: now() };
      db.orders.push(o);
      for (const it of q.items) {
        db.order_items.push({ id: id(), order_id: o.id, product_id: it.product_id, product_name: it.name, product_image: it.image, size: it.size, unit_price: it.unit_price, quantity: it.quantity, line_total: it.line_total });
        db.products.find(x => x.id === it.product_id).stock -= it.quantity;
      }
      if (q.coupon_code) db.coupons.find(x => x.code === q.coupon_code).used_count++;
      await save();
      return { order_id: o.id, order_number: o.order_number, access_token: o.access_token, total: o.total, payment_method: o.payment_method };
    },
    async orderPublic(oid, token) {
      const o = db.orders.find(x => x.id === oid && x.access_token === token); if (!o) return null;
      return clone({ ...o, items: db.order_items.filter(i => i.order_id === o.id).map(i => ({ name: i.product_name, image: i.product_image, size: i.size || null, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total })) });
    },

    user: () => me,
    onAuth(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async consumeUrlSession() { return null; },
    async signUp(email, password, name) {
      await tick(); email = String(email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('البريد الإلكتروني غير صحيح');
      if (String(password).length < 6) fail('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      if (db.users.some(u => u.email === email)) fail('هذا البريد مسجّل مسبقاً، سجّلي الدخول بدلاً من ذلك');
      const u = { id: id(), email, name, pw: await hash(password) };
      db.users.push(u); db.profiles[u.id] = { id: u.id, full_name: name || '' };
      await save(); setMe(u); return { ok: true };
    },
    async signIn(email, password) {
      await tick(); email = String(email).trim().toLowerCase();
      const u = db.users.find(x => x.email === email);
      if (!u || u.pw !== await hash(password)) fail('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      setMe(u);
    },
    async signOut() { setMe(null); },
    async resetPassword() { fail('استعادة كلمة المرور تعمل بعد ربط المتجر بـ Supabase'); },
    async updatePassword() { fail('غير متاح في وضع المعاينة'); },
    async isAdmin() { return isAdmin(); },
    // خاص بالمعاينة: إنشاء أول حساب مدير
    adminSetupNeeded: () => db.admins.length === 0,
    async setupAdmin(email, password, name) {
      if (db.admins.length) fail('يوجد مدير مسبقاً');
      await this.signUp(email, password, name);
      db.admins.push(me.id); await save();
    },
    async resetPreview() { db = EMPTY(); await save(); setMe(null); },

    async profile() { return me ? clone(db.profiles[me.id] || { id: me.id }) : null; },
    async saveProfile(p) { if (!me) fail('سجّلي الدخول أولاً'); db.profiles[me.id] = { ...(db.profiles[me.id] || { id: me.id }), ...p }; await save(); },
    async myOrders() {
      if (!me) return [];
      return clone(db.orders.filter(o => o.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(o => ({ ...o, items: db.order_items.filter(i => i.order_id === o.id) })));
    },
    async favIds() { return me ? db.favorites.filter(f => f.user_id === me.id).map(f => f.product_id) : []; },
    async addFav(pid) { if (me && !db.favorites.some(f => f.user_id === me.id && f.product_id === pid)) { db.favorites.push({ user_id: me.id, product_id: pid }); await save(); } },
    async removeFav(pid) { db.favorites = db.favorites.filter(f => !(me && f.user_id === me.id && f.product_id === pid)); await save(); },

    admin: {
      async list(table) { needAdmin(); return clone([...db[table]].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))); },
      async save(table, row, rid) {
        needAdmin(); await tick();
        const o = normalize(table, row); unique(table, o, rid);
        if (rid) { const x = db[table].find(r => r.id === rid); Object.assign(x, o, { updated_at: now() }); await save(); return clone(x); }
        const n = { id: id(), ...DEFAULTS[table], ...o, created_at: now(), updated_at: now() };
        db[table].push(n); await save(); return clone(n);
      },
      async remove(table, rid) {
        needAdmin(); db[table] = db[table].filter(r => r.id !== rid);
        if (table === 'products') { db.favorites = db.favorites.filter(f => f.product_id !== rid); db.order_items.forEach(i => { if (i.product_id === rid) i.product_id = null; }); }
        if (table === 'categories') db.products.forEach(p => { if (p.category_id === rid) p.category_id = null; });
        await save();
      },
      async uploadImage(blob) { needAdmin(); return await blobToDataURL(blob); },
      async deleteImages() { },
      async orders({ status, q } = {}) {
        needAdmin();
        let l = [...db.orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (status) l = l.filter(o => o.status === status);
        const s = String(q || '').trim();
        if (s) l = l.filter(o => /^\d+$/.test(s) ? (String(o.order_number) === s || o.phone.includes(s)) : (o.customer_name.includes(s) || o.city.includes(s)));
        return clone(l);
      },
      async order(oid) { needAdmin(); const o = db.orders.find(x => x.id === oid); return clone({ ...o, items: db.order_items.filter(i => i.order_id === oid), admin_note: db.order_notes[oid] || '' }); },
      async updateOrder(oid, p) {
        needAdmin(); const o = db.orders.find(x => x.id === oid);
        if (p.status && o.status === 'cancelled' && p.status !== 'cancelled') fail('لا يمكن إعادة تفعيل طلب ملغي، أنشئي طلباً جديداً');
        if (p.status === 'cancelled' && o.status !== 'cancelled') restoreOrder(o);
        Object.assign(o, p, { updated_at: now() }); await save(); return clone(o);
      },
      async saveNote(oid, notes) { needAdmin(); db.order_notes[oid] = notes; await save(); },
      async stats(days = 30) {
        needAdmin();
        const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
        const os = db.orders.filter(o => new Date(o.created_at) >= since);
        const live = os.filter(o => o.status !== 'cancelled');
        const daily = [];
        for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
          const k = d.toDateString(); const dd = live.filter(o => new Date(o.created_at).toDateString() === k);
          daily.push({ day: d.toISOString().slice(0, 10), revenue: r2(dd.reduce((s, o) => s + o.total, 0)), orders: dd.length });
        }
        const by_status = {}; os.forEach(o => by_status[o.status] = (by_status[o.status] || 0) + 1);
        const tp = {}; db.order_items.filter(i => live.some(o => o.id === i.order_id)).forEach(i => { tp[i.product_name] ||= { name: i.product_name, qty: 0, revenue: 0 }; tp[i.product_name].qty += i.quantity; tp[i.product_name].revenue = r2(tp[i.product_name].revenue + i.line_total); });
        return {
          revenue: r2(live.filter(o => o.payment_status === 'paid' || o.status === 'delivered').reduce((s, o) => s + o.total, 0)),
          orders_count: live.length,
          pending_count: db.orders.filter(o => ['pending', 'confirmed', 'processing'].includes(o.status)).length,
          by_status, daily,
          top_products: Object.values(tp).sort((a, b) => b.qty - a.qty).slice(0, 5),
          low_stock: db.products.filter(p => p.is_active && p.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 10).map(p => ({ id: p.id, name: p.name, stock: p.stock }))
        };
      }
    }
  };
}
