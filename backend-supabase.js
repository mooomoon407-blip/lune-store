// الاتصال الحقيقي بـ Supabase عبر REST — بدون مكتبات خارجية
const BUCKET = 'product-images';

const AR = [
  [/Invalid login credentials/i, 'البريد الإلكتروني أو كلمة المرور غير صحيحة'],
  [/already registered|already exists/i, 'هذا البريد مسجّل مسبقاً، سجّلي الدخول بدلاً من ذلك'],
  [/Password should be at least/i, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
  [/Email not confirmed/i, 'يرجى تأكيد بريدك الإلكتروني أولاً من الرسالة المرسلة إليك'],
  [/invalid format|validate email/i, 'البريد الإلكتروني غير صحيح'],
  [/rate limit|too many/i, 'محاولات كثيرة، حاولي بعد قليل'],
  [/duplicate key.*slug/i, 'الرابط المختصر (slug) مستخدم مسبقاً'],
  [/duplicate key.*sku/i, 'رمز المنتج (SKU) مستخدم مسبقاً'],
  [/duplicate key.*code/i, 'كود الخصم موجود مسبقاً'],
  [/duplicate key/i, 'القيمة مستخدمة مسبقاً'],
  [/row-level security|permission denied/i, 'ليست لديك صلاحية لهذا الإجراء'],
  [/violates check constraint.*slug/i, 'الرابط المختصر يقبل أحرفاً إنجليزية صغيرة وأرقاماً و - فقط'],
  [/violates check constraint.*code/i, 'كود الخصم: أحرف إنجليزية كبيرة وأرقام فقط (2-30)'],
  [/violates check constraint/i, 'إحدى القيم غير صالحة'],
  [/JWT|bad_jwt/i, 'انتهت الجلسة، سجّلي الدخول مجدداً']
];

export class ApiError extends Error {
  constructor(msg, status, code) { super(msg); this.status = status; this.code = code; }
}
function toArabic(m) {
  for (const [re, ar] of AR) if (re.test(m)) return ar;
  return m;
}
function msgOf(d, status) {
  const m = (d && (d.message || d.msg || d.error_description || d.error)) || `خطأ (${status})`;
  return toArabic(String(m));
}

export function createBackend(cfg) {
  const base = cfg.SUPABASE_URL.replace(/\/+$/, '');
  const key = cfg.SUPABASE_ANON_KEY;
  const SKEY = 'lune.session';
  const listeners = new Set();
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { }

  function setSession(s) {
    session = s && s.access_token ? s : null;
    try { session ? localStorage.setItem(SKEY, JSON.stringify(session)) : localStorage.removeItem(SKEY); } catch { }
    listeners.forEach(f => { try { f(session?.user || null); } catch { } });
  }

  async function raw(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    const h = { apikey: key, ...headers };
    if (auth && session) h.Authorization = 'Bearer ' + session.access_token;
    let b = body;
    if (b !== undefined && !(b instanceof Blob)) { h['Content-Type'] = 'application/json'; b = JSON.stringify(b); }
    let r;
    try { r = await fetch(base + path, { method, headers: h, body: b }); }
    catch { throw new ApiError('تعذّر الاتصال بالخادم، تحققي من الإنترنت', 0); }
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { r, data };
  }

  let refreshing = null;
  async function refresh() {
    if (!session?.refresh_token) return setSession(null);
    const { r, data } = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false });
    setSession(r.ok ? data : null);
  }
  async function ensureFresh(force) {
    if (!session) return;
    if (!force && (session.expires_at || 0) * 1000 - Date.now() > 60000) return;
    refreshing ||= refresh().finally(() => { refreshing = null; });
    await refreshing;
  }

  async function req(path, opts = {}) {
    await ensureFresh(false);
    let { r, data } = await raw(path, opts);
    if (r.status === 401 && session && opts.auth !== false) {
      await ensureFresh(true);
      ({ r, data } = await raw(path, opts));
    }
    if (!r.ok) throw new ApiError(msgOf(data, r.status), r.status, data && data.code);
    return data;
  }

  const qs = o => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') u.append(k, v); return u.toString(); };
  const clean = s => String(s || '').replace(/[,()*%\\.:]/g, ' ').trim();
  const get = (t, q) => req(`/rest/v1/${t}?${qs(q)}`);
  const insert = (t, row, extra = {}) => req(`/rest/v1/${t}?${qs(extra.q || {})}`, { method: 'POST', body: row, headers: { Prefer: extra.prefer || 'return=representation' } });
  const patch = (t, q, row) => req(`/rest/v1/${t}?${qs(q)}`, { method: 'PATCH', body: row, headers: { Prefer: 'return=representation' } });
  const del = (t, q) => req(`/rest/v1/${t}?${qs(q)}`, { method: 'DELETE' });
  const rpc = (fn, args = {}) => req(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
  const uid = () => session?.user?.id;

  // روابط تأكيد البريد/استعادة كلمة المرور تعود بـ #access_token=...
  async function consumeUrlSession() {
    const h = location.hash.slice(1);
    if (!h.includes('access_token=')) return null;
    const p = new URLSearchParams(h);
    const s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600) };
    history.replaceState(null, '', location.pathname + location.search);
    session = s;
    try { s.user = await req('/auth/v1/user'); setSession(s); } catch { setSession(null); }
    return p.get('type');
  }

  const publicUrl = path => `${base}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

  return {
    mode: 'live',
    ApiError,

    // ---------- المتجر ----------
    categories: () => get('categories', { select: '*', is_active: 'eq.true', order: 'sort_order.asc,name.asc' }),
    shipping: () => get('shipping_methods', { select: '*', is_active: 'eq.true', order: 'sort_order.asc,price.asc' }),
    products({ category, q, sort = 'new', featured, ids, limit } = {}) {
      const o = { select: '*', is_active: 'eq.true', limit };
      if (category) o.category_id = 'eq.' + category;
      if (featured) o.is_featured = 'eq.true';
      if (ids) { if (!ids.length) return Promise.resolve([]); o.id = `in.(${ids.join(',')})`; }
      const c = clean(q); if (c) o.or = `(name.ilike.*${c}*,description.ilike.*${c}*)`;
      o.order = { new: 'created_at.desc', price_asc: 'price.asc', price_desc: 'price.desc' }[sort] || 'created_at.desc';
      return get('products', o);
    },
    async product(slug) { return (await get('products', { select: '*', slug: 'eq.' + slug, is_active: 'eq.true' }))[0] || null; },
    quote: p => rpc('quote_cart', { p }),
    placeOrder: p => rpc('place_order', { p }),
    orderPublic: (id, token) => rpc('get_order_public', { p_order_id: id, p_token: token }),

    // ---------- الحسابات ----------
    user: () => session?.user || null,
    onAuth(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    consumeUrlSession,
    async signUp(email, password, name) {
      const d = await req('/auth/v1/signup', { method: 'POST', body: { email, password, data: { full_name: name } }, auth: false });
      if (d && d.access_token) { setSession(d); return { ok: true }; }
      return { needsConfirm: true };
    },
    async signIn(email, password) {
      setSession(await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false }));
    },
    async signOut() { try { await raw('/auth/v1/logout', { method: 'POST' }); } catch { } setSession(null); },
    resetPassword: email => req('/auth/v1/recover', { method: 'POST', body: { email }, auth: false }),
    updatePassword: password => req('/auth/v1/user', { method: 'PUT', body: { password } }),
    async isAdmin() { if (!session) return false; try { return (await rpc('is_admin')) === true; } catch { return false; } },

    async profile() { return (await get('profiles', { select: '*', id: 'eq.' + uid() }))[0] || null; },
    async saveProfile(p) {
      const rows = await patch('profiles', { id: 'eq.' + uid() }, p);
      if (!rows.length) await insert('profiles', { id: uid(), ...p });
    },
    async myOrders() {
      const orders = await get('orders', { select: 'id,order_number,status,payment_status,payment_method,total,created_at,shipping_name', order: 'created_at.desc', limit: 50 });
      if (!orders.length) return [];
      const items = await get('order_items', { select: 'order_id,product_name,size,quantity,line_total,product_image', order_id: `in.(${orders.map(o => o.id).join(',')})` });
      return orders.map(o => ({ ...o, items: items.filter(i => i.order_id === o.id) }));
    },
    async favIds() { return (await get('favorites', { select: 'product_id' })).map(f => f.product_id); },
    async addFav(pid) { try { await insert('favorites', { product_id: pid }, { prefer: 'return=minimal' }); } catch (e) { if (e.status !== 409) throw e; } },
    removeFav: pid => del('favorites', { product_id: 'eq.' + pid }),

    // ---------- لوحة التحكم ----------
    admin: {
      list(table, order = 'created_at.desc') { return get(table, { select: '*', order }); },
      async save(table, row, id) { return id ? (await patch(table, { id: 'eq.' + id }, row))[0] : (await insert(table, row))[0]; },
      remove: (table, id) => del(table, { id: 'eq.' + id }),
      async uploadImage(blob) {
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        await req(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' } });
        return publicUrl(path);
      },
      async deleteImages(urls) {
        const pre = `${base}/storage/v1/object/public/${BUCKET}/`;
        const paths = urls.filter(u => u && u.startsWith(pre)).map(u => decodeURIComponent(u.slice(pre.length)));
        if (paths.length) try { await req(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: { prefixes: paths } }); } catch { }
      },
      orders({ status, q } = {}) {
        const o = { select: '*', order: 'created_at.desc', limit: 300 };
        if (status) o.status = 'eq.' + status;
        const c = clean(q);
        if (c) o.or = /^\d+$/.test(c) ? `(order_number.eq.${c},phone.ilike.*${c}*)` : `(customer_name.ilike.*${c}*,city.ilike.*${c}*)`;
        return get('orders', o);
      },
      async order(id) {
        const [o] = await get('orders', { select: '*', id: 'eq.' + id });
        const items = await get('order_items', { select: '*', order_id: 'eq.' + id });
        const [n] = await get('order_notes', { select: 'notes', order_id: 'eq.' + id });
        return { ...o, items, admin_note: n?.notes || '' };
      },
      updateOrder: async (id, p) => (await patch('orders', { id: 'eq.' + id }, p))[0],
      saveNote: (id, notes) => insert('order_notes', { order_id: id, notes, updated_at: new Date().toISOString() }, { prefer: 'resolution=merge-duplicates,return=minimal', q: { on_conflict: 'order_id' } }),
      stats: days => rpc('admin_sales_summary', { p_days: days })
    }
  };
}
