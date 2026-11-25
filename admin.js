// لوحة تحكم LUNÉ — لا تظهر أي بيانات إلا بعد التحقق أن الحساب مدير (والحماية الفعلية في قاعدة البيانات)
import { api, LIVE } from './api.js';
import { PREVIEW_ALLOWED, notReadyPage } from './util.js';
if (!LIVE && !PREVIEW_ALLOWED) { notReadyPage(true); throw new Error('LUNÉ: config.js غير مربوط بقاعدة البيانات'); }
import { $, $$, esc, money, fmtDate, toast, confirmBox, resizeImage, randSlug, debounce, icon, STATUS, PAY_STATUS, PAY_METHOD } from './util.js';
import { placeholder } from './art.js';

const SIZES = ['XS', 'S', 'M', 'L'];

const app = $('#app');
if (!LIVE) $('#previewBar').classList.remove('hidden');
const NAV = [['overview', 'نظرة عامة', 'star'], ['orders', 'الطلبات', 'bag'], ['products', 'المنتجات', 'store'], ['categories', 'التصنيفات', 'menu'], ['shipping', 'الشحن', 'back'], ['coupons', 'أكواد الخصم', 'heart']];
let cats = [];

// ---------------- الدخول ----------------
async function boot() {
  if (!api.user()) return loginScreen();
  if (!(await api.isAdmin())) return denied();
  shell(); route();
}

function loginScreen() {
  const setup = !LIVE && api.adminSetupNeeded();
  app.innerHTML = `<div class="login"><form class="panel" id="lf" novalidate>
    <span class="logo">LUNÉ</span><p class="muted small" style="text-align:center">${setup ? 'إنشاء حساب المدير (للمعاينة)' : 'لوحة التحكم — دخول المدير'}</p>
    ${setup ? '<label class="f"><span>الاسم</span><input class="in" name="name" required></label>' : ''}
    <label class="f"><span>البريد الإلكتروني</span><input class="in" name="email" type="email" required autocomplete="username" dir="ltr" style="text-align:right"></label>
    <label class="f"><span>كلمة المرور</span><input class="in" name="password" type="password" required minlength="6" autocomplete="${setup ? 'new-password' : 'current-password'}" dir="ltr" style="text-align:right"></label>
    <div class="err" id="le" role="alert"></div>
    <button class="btn block">${setup ? 'إنشاء ودخول' : 'دخول'}</button>
    <p class="small muted" style="text-align:center;margin:14px 0 0"><a href="index.html" class="link-u">العودة للمتجر</a></p>
  </form></div>`;
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), b = $('button', e.target);
    b.disabled = true; $('#le').textContent = '';
    try {
      if (setup) await api.setupAdmin(f.email, f.password, f.name || 'المدير');
      else await api.signIn(f.email, f.password);
      await boot();
    } catch (x) { $('#le').textContent = x.message; b.disabled = false; }
  });
}

function denied() {
  app.innerHTML = `<div class="denied"><span class="logo">LUNÉ</span><h2 style="margin-top:20px">لا تملكين صلاحية الدخول</h2>
    <p class="muted">هذا الحساب (${esc(api.user()?.email)}) ليس حساب مدير.</p>
    <div class="row" style="justify-content:center"><button class="btn" id="so">تسجيل الخروج</button><a class="btn ghost" href="index.html">العودة للمتجر</a></div></div>`;
  $('#so').addEventListener('click', async () => { await api.signOut(); boot(); });
}

function shell() {
  const links = NAV.map(([k, t, i]) => `<a href="#${k}" data-k="${k}">${icon(i)}${t}</a>`).join('');
  app.innerHTML = `<div class="mtop"><span class="logo">LUNÉ</span><div class="row" style="gap:4px"><a class="icon-btn" href="index.html" style="color:#fff" aria-label="المتجر">${icon('store')}</a><button class="icon-btn" id="so2" aria-label="خروج">${icon('out')}</button></div></div>
  <nav class="mtabs">${NAV.map(([k, t]) => `<a href="#${k}" data-k="${k}">${t}</a>`).join('')}</nav>
  <div class="shell"><aside class="side"><span class="logo">LUNÉ<small>لوحة التحكم</small></span>${links}
    <a href="index.html" target="_blank" rel="noopener">${icon('store')}فتح المتجر</a>
    <div class="foot"><div style="padding:0 12px 6px">${esc(api.user()?.email)}</div><button id="so">${icon('out')}تسجيل الخروج</button></div></aside>
    <main class="pane" id="pane"></main></div>`;
  const out = async () => { await api.signOut(); location.hash = ''; boot(); };
  $('#so').addEventListener('click', out); $('#so2').addEventListener('click', out);
}

async function route() {
  if (!$('#pane')) return;
  const k = location.hash.slice(1) || 'overview';
  $$('[data-k]').forEach(a => a.classList.toggle('on', a.dataset.k === k));
  const pane = document.createElement('div');
  pane.innerHTML = '<div class="loading"><div class="spin"></div></div>';
  $('#pane').replaceChildren(pane);
  try {
    cats = await api.admin.list('categories', 'sort_order.asc');
    await ({ overview, orders, products, categories: p => crud(p, SCHEMAS.categories), shipping: p => crud(p, SCHEMAS.shipping), coupons: p => crud(p, SCHEMAS.coupons) }[k] || overview)(pane);
  } catch (e) {
    console.error(e);
    if (e.status === 401) { await api.signOut(); return boot(); }
    if (pane.isConnected) pane.innerHTML = `<div class="empty"><h3>تعذّر التحميل</h3><p>${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------------- نظرة عامة ----------------
async function overview(pane) {
  const [s, recent] = await Promise.all([api.admin.stats(30), api.admin.orders({})]);
  const max = Math.max(1, ...s.daily.map(d => d.revenue));
  pane.innerHTML = `<div class="pane-h"><h1>نظرة عامة</h1><span class="muted small">آخر 30 يوماً</span></div>
  <div class="stats">
    <div class="stat"><div class="k">المبيعات المحصّلة</div><div class="v">${money(s.revenue)}</div></div>
    <div class="stat"><div class="k">عدد الطلبات</div><div class="v">${s.orders_count}</div></div>
    <div class="stat"><div class="k">طلبات تحتاج متابعة</div><div class="v">${s.pending_count}</div></div>
    <div class="stat"><div class="k">متوسط قيمة الطلب</div><div class="v">${money(s.orders_count ? s.daily.reduce((a, d) => a + d.revenue, 0) / s.orders_count : 0)}</div></div>
  </div>
  <div class="panel"><h3>قيمة الطلبات اليومية</h3><div class="chart">${s.daily.map(d => `<div class="b" style="height:${(d.revenue / max * 100).toFixed(1)}%"><span>${d.day.slice(5)} · ${money(d.revenue)} · ${d.orders} طلب</span></div>`).join('')}</div>
    <p class="muted small" style="margin:8px 0 0">«المبيعات المحصّلة» تشمل الطلبات المدفوعة أو المسلَّمة فقط، والرسم يشمل كل الطلبات غير الملغاة.</p></div>
  <div class="dash2">
    <div class="panel"><h3>أحدث الطلبات</h3>${recent.slice(0, 6).map(o => `<a class="kv" href="#orders" data-open="${esc(o.id)}"><span>#${o.order_number} · ${esc(o.customer_name)}</span><span><span class="st ${esc(o.status)}">${STATUS[o.status]}</span> <b class="num">${money(o.total)}</b></span></a>`).join('') || '<p class="muted">لا توجد طلبات بعد.</p>'}</div>
    <div class="panel"><h3>الأكثر مبيعاً</h3>${s.top_products.map(t => `<div class="kv"><span>${esc(t.name)}</span><span class="num">${t.qty} قطعة · ${money(t.revenue)}</span></div>`).join('') || '<p class="muted">لا توجد مبيعات بعد.</p>'}
      <h3 style="margin-top:18px">مخزون منخفض (5 أو أقل)</h3>${s.low_stock.map(l => `<div class="kv"><span>${esc(l.name)}</span><span class="pill ${l.stock ? 'low' : 'out'}">${l.stock ? l.stock + ' متبقٍ' : 'نفد'}</span></div>`).join('') || '<p class="muted">لا يوجد.</p>'}</div>
  </div>`;
  $$('[data-open]', pane).forEach(a => a.addEventListener('click', () => sessionStorage.setItem('lune.openOrder', a.dataset.open)));
}

// ---------------- المنتجات ----------------
async function products(pane) {
  let all = await api.admin.list('products');
  let q = '', filt = 'all';
  pane.innerHTML = `<div class="pane-h"><h1>المنتجات</h1><button class="btn" id="newP">${icon('plus')} منتج جديد</button></div>
    <div class="toolbar"><input class="in q" id="pq" type="search" placeholder="بحث بالاسم أو الرمز" aria-label="بحث">
      <select class="in" id="pf" aria-label="تصفية"><option value="all">كل المنتجات</option><option value="on">المعروضة</option><option value="off">المخفية</option><option value="low">مخزون منخفض</option></select></div>
    <div id="plist"></div>`;
  const catName = id => cats.find(c => c.id === id)?.name || '—';
  const draw = () => {
    const l = all.filter(p => (!q || (p.name + ' ' + (p.sku || '')).toLowerCase().includes(q.toLowerCase()))
      && (filt === 'all' || (filt === 'on' && p.is_active) || (filt === 'off' && !p.is_active) || (filt === 'low' && p.stock <= 5)));
    $('#plist', pane).innerHTML = all.length ? `<div class="tbl"><div class="tr head t-prod"><span></span><span>المنتج</span><span>السعر</span><span>المخزون</span><span>الحالة</span><span></span></div>
      ${l.map(p => `<div class="tr t-prod" data-id="${esc(p.id)}">
        <div class="thumb">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : placeholder(p.id)}</div>
        <div><b style="font-weight:500">${esc(p.name)}</b><div class="muted small">${esc(catName(p.category_id))}${p.is_featured ? ' · مميز' : ''}${p.sizes?.length ? ` · المقاسات: <span dir="ltr">${p.sizes.map(esc).join(' ')}</span>` : ''}</div></div>
        <div class="num">${money(p.price)}${p.compare_at_price ? `<div class="muted small"><s>${money(p.compare_at_price)}</s></div>` : ''}</div>
        <div><span class="pill ${p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : ''}"><span class="lbl-m">المخزون: </span>${p.stock}</span></div>
        <div><span class="pill ${p.is_active ? 'on' : 'off'}">${p.is_active ? 'معروض' : 'مخفي'}</span></div>
        <div class="acts"><button class="icon-btn" data-e aria-label="تعديل ${esc(p.name)}">${icon('edit')}</button><button class="icon-btn" data-d aria-label="حذف ${esc(p.name)}">${icon('trash')}</button></div>
      </div>`).join('') || '<div class="tr"><span class="muted">لا توجد نتائج</span></div>'}</div>`
      : `<div class="empty"><h3>لا توجد منتجات بعد</h3><p>ابدئي بإضافة أول منتج مع صوره وسعره وكميته.</p></div>`;
    $$('#plist [data-id]', pane).forEach(r => {
      const p = all.find(x => x.id === r.dataset.id);
      $('[data-e]', r).addEventListener('click', () => productEditor(p, save));
      $('[data-d]', r).addEventListener('click', async () => {
        if (!await confirmBox(`حذف «${p.name}» نهائياً؟ لن يتأثر سجل الطلبات السابقة.`, 'حذف')) return;
        try { await api.admin.remove('products', p.id); await api.admin.deleteImages(p.images || []); all = all.filter(x => x.id !== p.id); draw(); toast('تم حذف المنتج'); }
        catch (e) { toast(e.message, 'bad'); }
      });
    });
  };
  const save = row => { const i = all.findIndex(x => x.id === row.id); i >= 0 ? all[i] = row : all.unshift(row); draw(); };
  $('#pq', pane).addEventListener('input', debounce(e => { q = e.target.value.trim(); draw(); }, 200));
  $('#pf', pane).addEventListener('change', e => { filt = e.target.value; draw(); });
  $('#newP', pane).addEventListener('click', () => productEditor(null, save));
  draw();
}

function productEditor(p, onSaved) {
  const isNew = !p;
  p = p || { name: '', slug: randSlug('p'), price: '', compare_at_price: '', stock: 0, sku: '', description: '', images: [], sizes: [], is_active: true, is_featured: false, category_id: null };
  let images = [...(p.images || [])];
  const uploaded = [], removed = [];
  const d = document.createElement('div'); d.className = 'modal-back';
  d.innerHTML = `<form class="modal" id="pe" novalidate>
    <div class="modal-h"><h3>${isNew ? 'منتج جديد' : 'تعديل المنتج'}</h3><button type="button" class="icon-btn" data-x aria-label="إغلاق">${icon('close')}</button></div>
    <label class="f"><span>اسم المنتج *</span><input class="in" name="name" required maxlength="150" value="${esc(p.name)}"></label>
    <div class="grid2">
      <label class="f"><span>السعر (${'ر.س'}) *</span><input class="in" name="price" required inputmode="decimal" value="${esc(p.price)}" dir="ltr" style="text-align:right"></label>
      <label class="f"><span>السعر قبل الخصم (اختياري)</span><input class="in" name="compare_at_price" inputmode="decimal" value="${esc(p.compare_at_price ?? '')}" dir="ltr" style="text-align:right"></label>
      <label class="f"><span>الكمية في المخزون *</span><input class="in" name="stock" required inputmode="numeric" value="${esc(p.stock)}" dir="ltr" style="text-align:right"></label>
      <label class="f"><span>التصنيف</span><select class="in" name="category_id"><option value="">بدون تصنيف</option>${cats.map(c => `<option value="${esc(c.id)}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="f"><span>رمز المنتج SKU (اختياري)</span><input class="in" name="sku" maxlength="60" value="${esc(p.sku || '')}" dir="ltr" style="text-align:right"></label>
      <label class="f"><span>الرابط المختصر (بالإنجليزية)</span><input class="in" name="slug" required pattern="[a-z0-9\\-]+" value="${esc(p.slug)}" dir="ltr" style="text-align:right"></label>
    </div>
    <label class="f"><span>الوصف</span><textarea class="in" name="description" rows="4">${esc(p.description || '')}</textarea></label>
    <fieldset class="f" style="border:0;padding:0;margin:0 0 14px"><legend style="font-size:14px;font-weight:500;margin-bottom:6px">المقاسات المتاحة</legend>
      <div class="row" style="gap:6px 18px">${[...new Set([...SIZES, ...(p.sizes || [])])].map(z => `<label class="check"><input type="checkbox" name="sizes" value="${esc(z)}" ${(p.sizes || []).includes(z) ? 'checked' : ''}> <span dir="ltr">${esc(z)}</span></label>`).join('')}</div>
      <p class="muted small" style="margin:4px 0 0">عند اختيار مقاس واحد أو أكثر يصبح اختيار المقاس إجبارياً للعميلة قبل الإضافة للسلة. اتركيها كلها فارغة إن كان المنتج بلا مقاسات.</p></fieldset>
    <span style="display:block;font-size:14px;font-weight:500;margin-bottom:8px">الصور (الأولى هي الصورة الرئيسية)</span>
    <div class="imgs" id="imgs"></div>
    <label class="upload">${icon('img')}<span>اختاري صوراً للرفع (يمكن اختيار أكثر من صورة)</span><input type="file" accept="image/*" multiple id="up"></label>
    <div class="row" style="margin-top:14px"><label class="check"><input type="checkbox" name="is_active" ${p.is_active ? 'checked' : ''}> معروض في المتجر</label><label class="check"><input type="checkbox" name="is_featured" ${p.is_featured ? 'checked' : ''}> منتج مميز (يظهر في الرئيسية)</label></div>
    <div class="err" id="pe-err" role="alert"></div>
    <div class="row-end"><button type="button" class="btn ghost" data-x>إلغاء</button><button class="btn" id="pe-save">${isNew ? 'إضافة المنتج' : 'حفظ التعديلات'}</button></div>
  </form>`;
  document.body.append(d);
  const drawImgs = () => {
    $('#imgs', d).innerHTML = images.map((u, i) => `<div class="it ${i ? '' : 'main'}"><img src="${esc(u)}" alt="صورة ${i + 1}"><button type="button" class="x" data-rm="${i}" aria-label="حذف الصورة">${icon('close')}</button><button type="button" class="mk" data-mk="${i}" ${i ? '' : 'disabled'}>${i ? 'اجعليها الرئيسية' : 'الرئيسية'}</button></div>`).join('');
  };
  drawImgs();
  $('#imgs', d).addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]'), mk = e.target.closest('[data-mk]');
    if (rm) { removed.push(...images.splice(+rm.dataset.rm, 1)); drawImgs(); }
    if (mk) { const [x] = images.splice(+mk.dataset.mk, 1); images.unshift(x); drawImgs(); }
  });
  $('#up', d).addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    const lab = $('.upload span', d);
    for (const [i, f] of files.entries()) {
      lab.textContent = `جارٍ رفع ${i + 1} من ${files.length}…`;
      try { const url = await api.admin.uploadImage(await resizeImage(f)); images.push(url); uploaded.push(url); drawImgs(); }
      catch (x) { toast(`${f.name}: ${x.message}`, 'bad'); }
    }
    lab.textContent = 'اختاري صوراً للرفع (يمكن اختيار أكثر من صورة)';
  });
  const close = async (saved) => {
    if (!saved) await api.admin.deleteImages(uploaded);   // صور رُفعت ولم يُحفظ المنتج
    d.remove();
  };
  $$('[data-x]', d).forEach(b => b.addEventListener('click', () => close(false)));
  $('#pe', d).addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target), err = $('#pe-err', d), btn = $('#pe-save', d);
    const num = k => { const v = String(f.get(k) || '').trim().replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace('٫', '.'); return v === '' ? null : Number(v); };
    const row = {
      name: f.get('name').trim(), slug: f.get('slug').trim().toLowerCase(), price: num('price'), compare_at_price: num('compare_at_price'),
      stock: num('stock'), sku: f.get('sku').trim() || null, description: f.get('description').trim(), category_id: f.get('category_id') || null,
      images, is_active: !!f.get('is_active'), is_featured: !!f.get('is_featured'),
      sizes: f.getAll('sizes')
    };
    err.textContent = '';
    if (!row.name) return err.textContent = 'يرجى إدخال اسم المنتج';
    if (row.price == null || isNaN(row.price) || row.price < 0) return err.textContent = 'السعر غير صحيح';
    if (row.compare_at_price != null && (isNaN(row.compare_at_price) || row.compare_at_price < 0)) return err.textContent = 'السعر قبل الخصم غير صحيح';
    if (row.stock == null || !Number.isInteger(row.stock) || row.stock < 0) return err.textContent = 'الكمية يجب أن تكون رقماً صحيحاً (0 أو أكثر)';
    if (!/^[a-z0-9-]+$/.test(row.slug)) return err.textContent = 'الرابط المختصر: أحرف إنجليزية صغيرة وأرقام و - فقط';
    btn.disabled = true;
    try {
      const saved = await api.admin.save('products', row, isNew ? null : p.id);
      await api.admin.deleteImages(removed.filter(u => !images.includes(u)));
      onSaved(saved); toast(isNew ? 'تمت إضافة المنتج' : 'تم حفظ التعديلات'); close(true);
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
  $('[name=name]', d).focus();
}

// ---------------- الطلبات ----------------
async function orders(pane) {
  const f = { status: '', q: '' };
  pane.innerHTML = `<div class="pane-h"><h1>الطلبات</h1></div>
    <div class="toolbar"><input class="in q" id="oq" type="search" placeholder="رقم الطلب، الجوال، الاسم أو المدينة" aria-label="بحث">
      <div class="chips"><button class="chip on" data-s="">الكل</button>${Object.entries(STATUS).map(([k, v]) => `<button class="chip" data-s="${k}">${v}</button>`).join('')}</div></div>
    <div id="olist"><div class="loading"><div class="spin"></div></div></div>`;
  const load = async () => {
    const l = await api.admin.orders(f);
    $('#olist', pane).innerHTML = l.length ? `<div class="tbl"><div class="tr head t-ord"><span>رقم</span><span>العميلة</span><span>التاريخ</span><span>الإجمالي</span><span>الدفع</span><span>الحالة</span></div>
      ${l.map(o => `<div class="tr t-ord click" data-id="${esc(o.id)}" tabindex="0" role="button">
        <b class="num">#${o.order_number}</b>
        <div>${esc(o.customer_name)}<div class="muted small">${esc(o.city)} · <span dir="ltr">${esc(o.phone)}</span></div></div>
        <div class="small muted">${fmtDate(o.created_at)}</div>
        <div class="num"><b>${money(o.total)}</b></div>
        <div class="small">${PAY_METHOD[o.payment_method]}<div class="muted">${PAY_STATUS[o.payment_status]}</div></div>
        <div><span class="st ${esc(o.status)}">${STATUS[o.status]}</span></div>
      </div>`).join('')}</div>` : `<div class="empty"><h3>لا توجد طلبات</h3><p>${f.status || f.q ? 'لا توجد طلبات تطابق التصفية.' : 'ستظهر طلبات العملاء هنا فور وصولها.'}</p></div>`;
    $$('#olist [data-id]', pane).forEach(r => { const open = () => orderDetail(r.dataset.id, load); r.addEventListener('click', open); r.addEventListener('keydown', e => { if (e.key === 'Enter') open(); }); });
  };
  $('#oq', pane).addEventListener('input', debounce(e => { f.q = e.target.value.trim(); load(); }, 300));
  $$('.chip[data-s]', pane).forEach(b => b.addEventListener('click', () => { f.status = b.dataset.s; $$('.chip[data-s]', pane).forEach(x => x.classList.toggle('on', x === b)); load(); }));
  await load();
  const pend = sessionStorage.getItem('lune.openOrder');
  if (pend) { sessionStorage.removeItem('lune.openOrder'); orderDetail(pend, load); }
}

async function orderDetail(id, reload) {
  const o = await api.admin.order(id);
  const d = document.createElement('div'); d.className = 'modal-back';
  const wa = o.phone.replace(/^0/, '966');
  d.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-h"><h3>طلب #${o.order_number}</h3><button class="icon-btn" data-x aria-label="إغلاق">${icon('close')}</button></div>
    <p class="muted small" style="margin-top:-8px">${fmtDate(o.created_at)}</p>
    <div class="dash2" style="margin-top:0">
      <div class="panel"><h3>العميلة</h3>
        <div class="kv"><span>الاسم</span><b>${esc(o.customer_name)}</b></div>
        <div class="kv"><span>الجوال</span><span dir="ltr">${esc(o.phone)}</span></div>
        ${o.email ? `<div class="kv"><span>البريد</span><span>${esc(o.email)}</span></div>` : ''}
        <div class="kv"><span>العنوان</span><span style="text-align:end">${esc(o.city)}${o.district ? ' · ' + esc(o.district) : ''}<br>${esc(o.address)}</span></div>
        ${o.notes ? `<div class="kv"><span>ملاحظات العميلة</span><span>${esc(o.notes)}</span></div>` : ''}
        <div class="row" style="margin-top:10px"><a class="btn sm ghost" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">واتساب</a><a class="btn sm ghost" href="tel:${esc(o.phone)}">اتصال</a></div>
      </div>
      <div class="panel"><h3>الحالة</h3>
        <label class="f"><span>حالة الطلب</span><select class="in sel-status" id="os">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f"><span>حالة الدفع (${PAY_METHOD[o.payment_method]})</span><select class="in sel-status" id="ops">${Object.entries(PAY_STATUS).map(([k, v]) => `<option value="${k}" ${k === o.payment_status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <p class="muted small">إلغاء الطلب يعيد كمياته للمخزون تلقائياً، ولا يمكن التراجع عنه.</p>
        <button class="btn block" id="osave">حفظ الحالة</button>
      </div>
    </div>
    <div class="panel" style="margin-top:14px"><h3>المنتجات</h3>
      ${o.items.map(i => `<div class="mini-line"><div class="th">${i.product_image ? `<img src="${esc(i.product_image)}" alt="">` : placeholder(i.product_name)}</div><span style="flex:1">${esc(i.product_name)}${i.size ? ` <span class="pill" style="margin-inline-start:6px">المقاس <b dir="ltr">${esc(i.size)}</b></span>` : ''}<div class="muted small">${money(i.unit_price)} × ${i.quantity}</div></span><b class="num">${money(i.line_total)}</b></div>`).join('')}
      <div class="sum-row" style="margin-top:8px"><span>المجموع الفرعي</span><span class="num">${money(o.subtotal)}</span></div>
      ${o.discount > 0 ? `<div class="sum-row"><span>الخصم ${o.coupon_code ? `(<bdi>${esc(o.coupon_code)}</bdi>)` : ''}</span><span class="disc num">− ${money(o.discount)}</span></div>` : ''}
      <div class="sum-row"><span>الشحن (${esc(o.shipping_name)})</span><span class="num">${money(o.shipping_fee)}</span></div>
      <div class="sum-row total"><span>الإجمالي</span><span class="num">${money(o.total)}</span></div>
    </div>
    <div class="panel" style="margin-top:14px"><h3>ملاحظات داخلية (لا تراها العميلة)</h3>
      <textarea class="in" id="onote" rows="3" maxlength="2000">${esc(o.admin_note || '')}</textarea>
      <div class="row-end" style="margin-top:10px"><button class="btn ghost sm" id="nsave">حفظ الملاحظة</button></div></div>
  </div>`;
  document.body.append(d);
  const close = () => d.remove();
  $('[data-x]', d).addEventListener('click', close);
  d.addEventListener('click', e => { if (e.target === d) close(); });
  $('#osave', d).addEventListener('click', async () => {
    const status = $('#os', d).value, payment_status = $('#ops', d).value;
    if (status === 'cancelled' && o.status !== 'cancelled' && !await confirmBox('إلغاء الطلب وإرجاع الكميات للمخزون؟', 'إلغاء الطلب')) return;
    try { await api.admin.updateOrder(o.id, { status, payment_status }); o.status = status; toast('تم تحديث الطلب'); reload && reload(); }
    catch (e) { toast(e.message, 'bad'); }
  });
  $('#nsave', d).addEventListener('click', async () => {
    try { await api.admin.saveNote(o.id, $('#onote', d).value); toast('تم حفظ الملاحظة'); } catch (e) { toast(e.message, 'bad'); }
  });
}

// ---------------- التصنيفات / الشحن / الأكواد ----------------
const SCHEMAS = {
  categories: {
    table: 'categories', title: 'التصنيفات', one: 'تصنيف', order: 'sort_order.asc',
    cols: [['name', 'الاسم'], ['slug', 'الرابط', r => `<span dir="ltr">${esc(r.slug)}</span>`], ['is_active', 'الحالة', r => `<span class="pill ${r.is_active ? 'on' : 'off'}">${r.is_active ? 'ظاهر' : 'مخفي'}</span>`]],
    fields: [['name', 'الاسم *', 'text', true], ['slug', 'الرابط المختصر (بالإنجليزية) *', 'slug', true], ['description', 'وصف قصير', 'textarea'], ['image_url', 'صورة التصنيف', 'image'], ['sort_order', 'الترتيب (الأصغر أولاً)', 'int'], ['is_active', 'ظاهر في المتجر', 'check']],
    blank: () => ({ slug: randSlug('c'), sort_order: 0, is_active: true })
  },
  shipping: {
    table: 'shipping_methods', title: 'خيارات الشحن', one: 'خيار شحن', order: 'sort_order.asc',
    cols: [['name', 'الاسم'], ['price', 'السعر', r => `<span class="num">${money(r.price)}</span>`], ['free_over', 'مجاني فوق', r => r.free_over != null ? `<span class="num">${money(r.free_over)}</span>` : '—'], ['is_active', 'الحالة', r => `<span class="pill ${r.is_active ? 'on' : 'off'}">${r.is_active ? 'مفعّل' : 'معطّل'}</span>`]],
    fields: [['name', 'الاسم * (مثال: شحن عادي)', 'text', true], ['price', 'السعر (ر.س) *', 'num', true], ['free_over', 'شحن مجاني للطلبات فوق (اختياري)', 'num'], ['eta', 'مدة التوصيل (مثال: 2-4 أيام عمل)', 'text'], ['description', 'وصف', 'textarea'], ['sort_order', 'الترتيب', 'int'], ['is_active', 'مفعّل', 'check']],
    blank: () => ({ sort_order: 0, is_active: true })
  },
  coupons: {
    table: 'coupons', title: 'أكواد الخصم', one: 'كود خصم', order: 'created_at.desc',
    cols: [['code', 'الكود', r => `<b dir="ltr">${esc(r.code)}</b>`], ['value', 'الخصم', r => r.type === 'percent' ? `${r.value}%` : money(r.value)], ['used_count', 'الاستخدام', r => `${r.used_count}${r.max_uses ? ' / ' + r.max_uses : ''}`], ['is_active', 'الحالة', r => { const exp = r.expires_at && new Date(r.expires_at) < new Date(); return `<span class="pill ${r.is_active && !exp ? 'on' : 'off'}">${exp ? 'منتهي' : r.is_active ? 'مفعّل' : 'معطّل'}</span>`; }]],
    fields: [['code', 'الكود * (أحرف إنجليزية وأرقام)', 'code', true], ['type', 'نوع الخصم', 'select', true, [['percent', 'نسبة مئوية %'], ['fixed', 'مبلغ ثابت (ر.س)']]], ['value', 'قيمة الخصم *', 'num', true], ['max_discount', 'أقصى خصم بالريال (للنسبة، اختياري)', 'num'], ['min_order', 'أقل قيمة للطلب', 'num'], ['max_uses', 'عدد مرات الاستخدام (فارغ = بلا حد)', 'int'], ['starts_at', 'يبدأ في (اختياري)', 'datetime'], ['expires_at', 'ينتهي في (اختياري)', 'datetime'], ['is_active', 'مفعّل', 'check']],
    blank: () => ({ type: 'percent', min_order: 0, is_active: true })
  }
};

async function crud(pane, S) {
  let rows = await api.admin.list(S.table, S.order);
  const draw = () => {
    pane.innerHTML = `<div class="pane-h"><h1>${S.title}</h1><button class="btn" id="newR">${icon('plus')} إضافة ${S.one}</button></div>
    ${rows.length ? `<div class="tbl"><div class="tr head" style="grid-template-columns:repeat(${S.cols.length},minmax(0,1fr)) 96px">${S.cols.map(c => `<span>${c[1]}</span>`).join('')}<span></span></div>
      ${rows.map(r => `<div class="tr" style="grid-template-columns:repeat(${S.cols.length},minmax(0,1fr)) 96px" data-id="${esc(r.id)}">${S.cols.map(c => `<div>${c[2] ? c[2](r) : esc(r[c[0]])}</div>`).join('')}
        <div class="acts"><button class="icon-btn" data-e aria-label="تعديل">${icon('edit')}</button><button class="icon-btn" data-d aria-label="حذف">${icon('trash')}</button></div></div>`).join('')}</div>`
      : `<div class="empty"><h3>لا يوجد ${S.title} بعد</h3>${S.table === 'shipping_methods' ? '<p>أضيفي خيار شحن واحداً على الأقل حتى تستطيع العميلات إتمام الطلب.</p>' : ''}</div>`}`;
    $('#newR', pane).addEventListener('click', () => crudEditor(S, null, done));
    $$('[data-id]', pane).forEach(el => {
      const r = rows.find(x => x.id === el.dataset.id);
      $('[data-e]', el).addEventListener('click', () => crudEditor(S, r, done));
      $('[data-d]', el).addEventListener('click', async () => {
        if (!await confirmBox(`حذف «${r.name || r.code}»؟`, 'حذف')) return;
        try { await api.admin.remove(S.table, r.id); if (r.image_url) await api.admin.deleteImages([r.image_url]); rows = rows.filter(x => x.id !== r.id); draw(); toast('تم الحذف'); }
        catch (e) { toast(e.message, 'bad'); }
      });
    });
  };
  const done = saved => { const i = rows.findIndex(x => x.id === saved.id); i >= 0 ? rows[i] = saved : rows.unshift(saved); draw(); };
  draw();
}

function crudEditor(S, r, onSaved) {
  const isNew = !r; const v = r || S.blank();
  const toLocal = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  let imgUrl = v.image_url || null; const uploaded = [];
  const field = ([k, label, t, req, opts]) => {
    const val = v[k] ?? '';
    if (t === 'check') return `<label class="check"><input type="checkbox" name="${k}" ${v[k] ? 'checked' : ''}> ${label}</label>`;
    if (t === 'textarea') return `<label class="f"><span>${label}</span><textarea class="in" name="${k}" rows="2">${esc(val)}</textarea></label>`;
    if (t === 'select') return `<label class="f"><span>${label}</span><select class="in" name="${k}">${opts.map(([a, b]) => `<option value="${a}" ${a === val ? 'selected' : ''}>${b}</option>`).join('')}</select></label>`;
    if (t === 'image') return `<div class="f"><span style="display:block;font-size:14px;font-weight:500;margin-bottom:6px">${label}</span><div class="imgs" id="cimg"></div><label class="upload">${icon('img')}<span>اختاري صورة</span><input type="file" accept="image/*" id="cup"></label></div>`;
    const ltr = ['slug', 'code', 'num', 'int'].includes(t);
    return `<label class="f"><span>${label}</span><input class="in" name="${k}" ${req ? 'required' : ''} ${t === 'num' ? 'inputmode="decimal"' : t === 'int' ? 'inputmode="numeric"' : ''} type="${t === 'datetime' ? 'datetime-local' : 'text'}" value="${esc(t === 'datetime' ? toLocal(val) : val)}" ${ltr ? 'dir="ltr" style="text-align:right"' : ''} ${t === 'code' ? 'style="text-transform:uppercase;text-align:right" dir="ltr"' : ''}></label>`;
  };
  const d = document.createElement('div'); d.className = 'modal-back';
  d.innerHTML = `<form class="modal" novalidate><div class="modal-h"><h3>${isNew ? 'إضافة' : 'تعديل'} ${S.one}</h3><button type="button" class="icon-btn" data-x aria-label="إغلاق">${icon('close')}</button></div>
    ${S.fields.map(field).join('')}<div class="err" role="alert"></div>
    <div class="row-end"><button type="button" class="btn ghost" data-x>إلغاء</button><button class="btn">حفظ</button></div></form>`;
  document.body.append(d);
  const drawImg = () => { const c = $('#cimg', d); if (c) c.innerHTML = imgUrl ? `<div class="it main"><img src="${esc(imgUrl)}" alt=""><button type="button" class="x" aria-label="إزالة الصورة">${icon('close')}</button></div>` : ''; };
  drawImg();
  $('#cimg', d)?.addEventListener('click', e => { if (e.target.closest('.x')) { imgUrl = null; drawImg(); } });
  $('#cup', d)?.addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { imgUrl = await api.admin.uploadImage(await resizeImage(f, 1200)); uploaded.push(imgUrl); drawImg(); } catch (x) { toast(x.message, 'bad'); }
  });
  const close = saved => { if (!saved) api.admin.deleteImages(uploaded.filter(u => u !== v.image_url)); d.remove(); };
  $$('[data-x]', d).forEach(b => b.addEventListener('click', () => close(false)));
  $('form', d).addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target), err = $('.err', d), row = {};
    err.textContent = '';
    for (const [k, label, t, req] of S.fields) {
      if (t === 'image') { row[k] = imgUrl; continue; }
      if (t === 'check') { row[k] = !!fd.get(k); continue; }
      let x = String(fd.get(k) ?? '').trim();
      if (t === 'code') x = x.toUpperCase();
      if (t === 'slug') x = x.toLowerCase();
      if (req && !x) return err.textContent = `يرجى تعبئة: ${label.replace(' *', '').split(' (')[0]}`;
      if (t === 'num' || t === 'int') {
        if (x === '') { row[k] = k === 'min_order' || k === 'sort_order' ? 0 : null; continue; }
        const n = Number(x.replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
        if (isNaN(n) || n < 0 || (t === 'int' && !Number.isInteger(n))) return err.textContent = `قيمة غير صحيحة: ${label.split(' (')[0]}`;
        row[k] = n; continue;
      }
      if (t === 'datetime') { row[k] = x ? new Date(x).toISOString() : null; continue; }
      if (t === 'slug' && !/^[a-z0-9-]+$/.test(x)) return err.textContent = 'الرابط المختصر: أحرف إنجليزية صغيرة وأرقام و - فقط';
      if (t === 'code' && !/^[A-Z0-9_-]{2,30}$/.test(x)) return err.textContent = 'الكود: أحرف إنجليزية وأرقام فقط (2-30 حرفاً)';
      row[k] = x || (t === 'textarea' ? '' : null);
    }
    if (S.table === 'coupons' && row.type === 'percent' && row.value > 100) return err.textContent = 'النسبة لا تتجاوز 100%';
    const b = $('button.btn:not(.ghost)', d); b.disabled = true;
    try {
      const saved = await api.admin.save(S.table, row, isNew ? null : r.id);
      if (r?.image_url && r.image_url !== imgUrl) api.admin.deleteImages([r.image_url]);
      onSaved(saved); toast('تم الحفظ'); close(true);
    } catch (x) { err.textContent = x.message; b.disabled = false; }
  });
}

api.onAuth(u => { if (!u && $('#pane')) boot(); });
boot();
