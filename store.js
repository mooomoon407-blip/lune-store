// واجهة متجر LUNÉ
import { api, LIVE } from './api.js';
import { PREVIEW_ALLOWED, notReadyPage } from './util.js';
if (!LIVE && !PREVIEW_ALLOWED) { notReadyPage(false); throw new Error('LUNÉ: config.js غير مربوط بقاعدة البيانات'); }
import { $, $$, esc, money, fmtDate, toast, debounce, icon, CFG, CITIES, STATUS, PAY_STATUS, PAY_METHOD } from './util.js';
import { heroArt, placeholder } from './art.js';

const main = $('#view');
const S = { cats: [], shipping: [], favs: new Set(), shop: { cat: '', q: '', sort: 'new' } };
const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const ss = { get(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { } } };

// ---------------- السلة ----------------
const lineKey = i => i.id + '|' + (i.size || '');
const cart = {
  items: () => ls.get('lune.cart', []),
  save(l) { ls.set('lune.cart', l); updateBadges(); },
  add(id, qty = 1, size = null) { const l = cart.items(); const k = lineKey({ id, size }); const x = l.find(i => lineKey(i) === k); x ? x.qty = Math.min(99, x.qty + qty) : l.push({ id, qty, size }); cart.save(l); },
  set(key, qty) { cart.save(cart.items().map(i => lineKey(i) === key ? { ...i, qty: Math.max(1, Math.min(99, qty)) } : i)); },
  remove(key) { cart.save(cart.items().filter(i => lineKey(i) !== key)); },
  qtyOf: id => cart.items().filter(i => i.id === id).reduce((s, i) => s + i.qty, 0),
  clear() { cart.save([]); },
  count: () => cart.items().reduce((s, i) => s + i.qty, 0)
};

// ---------------- المفضلة ----------------
async function loadFavs() {
  S.favs = new Set(api.user() ? await api.favIds().catch(() => []) : ls.get('lune.favs', []));
  updateBadges();
}
async function toggleFav(pid) {
  const on = !S.favs.has(pid);
  on ? S.favs.add(pid) : S.favs.delete(pid);
  updateBadges();
  $$(`.fav[data-fav="${CSS.escape(pid)}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  try {
    if (api.user()) await (on ? api.addFav(pid) : api.removeFav(pid));
    else ls.set('lune.favs', [...S.favs]);
    toast(on ? 'أُضيف للمفضلة' : 'أُزيل من المفضلة');
  } catch (e) { toast(e.message, 'bad'); }
}
async function mergeLocalFavs() {
  const local = ls.get('lune.favs', []);
  for (const pid of local) await api.addFav(pid).catch(() => { });
  ls.set('lune.favs', []);
}

function updateBadges() {
  const c = cart.count(); $('#cartN').textContent = c || ''; $('#cartN').dataset.n = c;
  const f = S.favs.size; $('#favN').textContent = f || ''; $('#favN').dataset.n = f;
}

// ---------------- عناصر العرض ----------------
const img = (p, i = 0, cls = '') => p.images?.[i] ? `<img src="${esc(p.images[i])}" alt="${esc(p.name)}" loading="lazy" class="${cls}">` : (i === 0 ? placeholder(p.id) : '');
const priceHtml = p => `<span class="price">${money(p.price)}${p.compare_at_price > p.price ? `<s>${money(p.compare_at_price)}</s>` : ''}</span>`;

function card(p) {
  const out = p.stock <= 0;
  const sale = p.compare_at_price > p.price;
  return `<article class="card">
    <a href="#p-${esc(p.slug)}" class="media" aria-label="${esc(p.name)}">
      ${img(p)}${p.images?.[1] ? img(p, 1, 'alt') : ''}
      ${out ? '<span class="tag">نفدت الكمية</span>' : sale ? '<span class="tag sale">تخفيض</span>' : ''}
    </a>
    <button class="icon-btn fav ${S.favs.has(p.id) ? 'on' : ''}" data-fav="${esc(p.id)}" aria-pressed="${S.favs.has(p.id)}" aria-label="أضيفي للمفضلة">${icon('heart')}</button>
    ${out ? '' : p.sizes?.length ? `<a class="btn sm light quick" href="#p-${esc(p.slug)}">اختاري المقاس</a>` : `<button class="btn sm light quick" data-add="${esc(p.id)}">أضيفي للسلة</button>`}
    <div class="meta"><a href="#p-${esc(p.slug)}" class="nm">${esc(p.name)}</a><div>${priceHtml(p)}</div></div>
  </article>`;
}

const emptyBox = (title, text, action = '') => `<div class="empty"><div class="ph">${placeholder('e').replace('<div class="ph">', '').replace(/<\/div>$/, '')}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;
const fail = (view, e) => { view.innerHTML = `<div class="wrap band">${emptyBox('حدث خطأ', esc(e.message || e), '<a class="btn ghost" href="#">العودة للرئيسية</a>')}</div>`; };

// ---------------- الصفحات ----------------
async function home(view) {
  const [feat, latest] = await Promise.all([api.products({ featured: true, limit: 8 }), api.products({ limit: 8 })]);
  const list = feat.length ? feat : latest;
  view.innerHTML = `
  <section class="hero"><div class="wrap hero-in">
    <div>
      <div class="eyebrow">LUNÉ · NAIL ATELIER</div>
      <h1>أظافر تليق <b>بضوء القمر</b></h1>
      <p class="lead">مجموعة مختارة من ألوان الطلاء وأدوات العناية، لإطلالة ناعمة ومتقنة في كل يوم.</p>
      <div class="row"><a href="#shop" class="btn">تسوّقي المجموعة</a>${S.cats.length ? '<a href="#cats" class="btn ghost">التصنيفات</a>' : ''}</div>
    </div>
    <div class="hero-art">${heroArt()}</div>
  </div></section>
  ${S.cats.length ? `<section class="band wrap" id="cats"><div class="sec-head"><h2>تسوّقي حسب التصنيف</h2></div>
    <div class="cats">${S.cats.map(c => `<a class="cat ${c.image_url ? '' : 'noimg'}" href="#cat-${esc(c.slug)}">${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : placeholder(c.id)}<span>${esc(c.name)}</span></a>`).join('')}</div></section>` : ''}
  <section class="band wrap" style="padding-top:${S.cats.length ? 0 : ''}">
    <div class="sec-head"><h2>${feat.length ? 'مختاراتنا لكِ' : 'وصل حديثاً'}</h2>${list.length ? '<a href="#shop" class="link-u">عرض الكل</a>' : ''}</div>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>`
      : emptyBox('مجموعتنا الأولى في الطريق', 'نجهّز المنتجات الآن، عودي قريباً.', LIVE ? '' : '<a class="btn" href="admin.html">أضيفي أول منتج من لوحة التحكم</a>')}
  </section>
  <section class="ritual band"><div class="wrap">
    <h2>طقوس العناية في ثلاث خطوات</h2>
    <div class="steps">
      <div><b>التحضير</b><span>نظّفي الأظافر وشكّليها بالمبرد، ثم ادفعي الجلد برفق.</span></div>
      <div><b>اللون</b><span>طبقة أساس، ثم طبقتان رقيقتان من اللون مع ترك وقت للجفاف بينهما.</span></div>
      <div><b>اللمعان</b><span>اختمي بطبقة علوية تحفظ اللون وتمنحه بريقاً يدوم.</span></div>
    </div>
  </div></section>`;
}

async function shop(view) {
  const f = S.shop;
  const cat = S.cats.find(c => c.slug === f.cat);
  view.innerHTML = `<section class="wrap band">
    <div class="sec-head"><div><h1 style="font-size:clamp(28px,4vw,42px)">${cat ? esc(cat.name) : 'كل المنتجات'}</h1>${cat?.description ? `<p class="muted">${esc(cat.description)}</p>` : ''}</div></div>
    <div class="toolbar">
      <input class="in q" id="shopQ" type="search" placeholder="ابحثي في المنتجات" value="${esc(f.q)}" aria-label="بحث">
      <select class="in" id="shopSort" aria-label="الترتيب">
        <option value="new">الأحدث</option><option value="price_asc">السعر: من الأقل</option><option value="price_desc">السعر: من الأعلى</option>
      </select>
      ${S.cats.length ? `<div class="chips"><button class="chip ${f.cat ? '' : 'on'}" data-cat="">الكل</button>${S.cats.map(c => `<button class="chip ${f.cat === c.slug ? 'on' : ''}" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`).join('')}</div>` : ''}
    </div>
    <div id="shopGrid"><div class="loading"><div class="spin"></div></div></div>
  </section>`;
  $('#shopSort', view).value = f.sort;
  const load = async () => {
    const list = await api.products({ category: cat?.id, q: f.q, sort: f.sort });
    $('#shopGrid', view).innerHTML = list.length ? `<p class="muted small">${list.length} منتج</p><div class="grid">${list.map(card).join('')}</div>`
      : emptyBox(f.q ? 'لا توجد نتائج' : 'لا توجد منتجات هنا بعد', f.q ? 'جرّبي كلمة بحث أخرى.' : 'عودي قريباً لاكتشاف الجديد.');
  };
  $('#shopQ', view).addEventListener('input', debounce(e => { f.q = e.target.value; load().catch(e => fail(view, e)); }, 300));
  $('#shopSort', view).addEventListener('change', e => { f.sort = e.target.value; load().catch(e => fail(view, e)); });
  $$('.chip', view).forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.cat ? 'cat-' + b.dataset.cat : 'shop'; }));
  await load();
}

async function productPage(view, slug) {
  const p = await api.product(slug);
  if (!p) return view.innerHTML = `<div class="wrap band">${emptyBox('المنتج غير متوفر', 'ربما أُزيل أو تغيّر رابطه.', '<a class="btn" href="#shop">تصفّحي المتجر</a>')}</div>`;
  document.title = `${p.name} — LUNÉ`;
  const cat = S.cats.find(c => c.id === p.category_id);
  const imgs = p.images?.length ? p.images : [null];
  const out = p.stock <= 0;
  view.innerHTML = `<section class="wrap band"><div class="pd">
    <div class="gallery">
      <div class="g-main" id="gMain">${imgs.map((u, i) => `<div>${u ? `<img src="${esc(u)}" alt="${esc(p.name)} ${i + 1}" ${i ? 'loading="lazy"' : ''}>` : placeholder(p.id)}</div>`).join('')}</div>
      ${imgs.length > 1 ? `<div class="g-thumbs">${imgs.map((u, i) => `<button class="${i ? '' : 'on'}" data-i="${i}" aria-label="صورة ${i + 1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
    </div>
    <div>
      <div class="crumb"><a href="#shop">المتجر</a>${cat ? ` / <a href="#cat-${esc(cat.slug)}">${esc(cat.name)}</a>` : ''}</div>
      <h1 style="font-size:clamp(28px,3.6vw,40px)">${esc(p.name)}</h1>
      ${priceHtml(p)}
      <div class="stock ${out ? 's-out' : p.stock <= 5 ? 's-low' : 's-in'}">${out ? 'نفدت الكمية حالياً' : p.stock <= 5 ? `متبقٍ ${p.stock} فقط` : 'متوفر'}</div>
      ${p.sizes?.length && !out ? `<div class="sizes"><div class="sz-l">المقاس: <b id="szSel">لم يُختر بعد</b></div>
        <div class="sz-opts" role="radiogroup" aria-label="اختاري المقاس">${p.sizes.map(z => `<button type="button" class="sz" role="radio" aria-checked="false" data-sz="${esc(z)}">${esc(z)}</button>`).join('')}</div>
        <div class="err" id="szErr" role="alert"></div></div>` : ''}
      <div class="buy">
        ${out ? '' : `<div class="qty"><button data-q="1" aria-label="زيادة">${icon('plus')}</button><input id="pQty" type="number" min="1" max="${Math.min(99, p.stock)}" value="1" aria-label="الكمية"><button data-q="-1" aria-label="إنقاص">${icon('minus')}</button></div>`}
        <button class="btn" id="pAdd" ${out ? 'disabled' : ''}>${out ? 'غير متوفر' : 'أضيفي للسلة'}</button>
        <button class="icon-btn fav ${S.favs.has(p.id) ? 'on' : ''}" data-fav="${esc(p.id)}" aria-pressed="${S.favs.has(p.id)}" aria-label="المفضلة" style="border:1px solid var(--line);width:48px;height:48px">${icon('heart')}</button>
      </div>
      ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ''}
      ${p.sku ? `<p class="muted small" style="margin-top:16px">رمز المنتج: ${esc(p.sku)}</p>` : ''}
    </div>
  </div>
  <div id="related"></div></section>`;
  const qIn = $('#pQty', view);
  $$('[data-q]', view).forEach(b => b.addEventListener('click', () => { qIn.value = Math.max(1, Math.min(+qIn.max, (+qIn.value || 1) + +b.dataset.q)); }));
  let size = null;
  $$('.sz', view).forEach(b => b.addEventListener('click', () => {
    size = b.dataset.sz;
    $$('.sz', view).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    $('#szSel', view).textContent = size; $('#szErr', view).textContent = '';
  }));
  $('#pAdd', view).addEventListener('click', () => {
    if (p.sizes?.length && !size) { $('#szErr', view).textContent = 'يرجى اختيار المقاس أولاً'; $('.sz', view).focus(); return; }
    const q = Math.max(1, Math.min(+qIn.max, +qIn.value || 1));
    if (cart.qtyOf(p.id) + q > p.stock) return toast(`الكمية المتوفرة ${p.stock} فقط`, 'bad');
    cart.add(p.id, q, size); toast(size ? `أُضيف إلى السلة (المقاس ${size})` : 'أُضيف إلى السلة');
  });
  const gm = $('#gMain', view);
  $$('.g-thumbs button', view).forEach(b => b.addEventListener('click', () => { gm.children[b.dataset.i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); $$('.g-thumbs button', view).forEach(x => x.classList.toggle('on', x === b)); }));
  if (cat) {
    const rel = (await api.products({ category: cat.id, limit: 5 })).filter(x => x.id !== p.id).slice(0, 4);
    if (rel.length) $('#related', view).innerHTML = `<div class="sec-head" style="margin-top:70px"><h2>قد يعجبكِ أيضاً</h2></div><div class="grid">${rel.map(card).join('')}</div>`;
  }
}

async function cartPage(view) {
  const items = cart.items();
  if (!items.length) return view.innerHTML = `<div class="wrap band">${emptyBox('سلتكِ فارغة', 'اكتشفي مجموعتنا وأضيفي ما يعجبكِ.', '<a class="btn" href="#shop">تسوّقي الآن</a>')}</div>`;
  const prods = await api.products({ ids: items.map(i => i.id) });
  const byId = Object.fromEntries(prods.map(p => [p.id, p]));
  const gone = items.filter(i => !byId[i.id]);
  if (gone.length) { cart.save(items.filter(i => byId[i.id])); toast('أُزيل منتج لم يعد متوفراً من السلة', 'bad'); return cartPage(view); }
  const lines = items.map(i => ({ ...i, key: lineKey(i), p: byId[i.id] }));
  const sub = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const coupon = ss.get('lune.coupon', '');
  view.innerHTML = `<section class="wrap band"><h1 style="font-size:clamp(28px,4vw,42px)">السلة</h1><div class="two">
    <div>${lines.map(l => `<div class="line" data-id="${esc(l.key)}">
      <a href="#p-${esc(l.p.slug)}" class="th">${img(l.p)}</a>
      <div><a href="#p-${esc(l.p.slug)}">${esc(l.p.name)}</a><div class="muted small">${l.size ? `المقاس: <b dir="ltr">${esc(l.size)}</b> · ` : ''}${money(l.p.price)}</div>
        ${l.p.sizes?.length && !l.size ? `<div class="err">يرجى اختيار المقاس: احذفي هذا السطر وأضيفيه من <a class="link-u" href="#p-${esc(l.p.slug)}">صفحة المنتج</a></div>` : ''}
        ${cart.qtyOf(l.id) > l.p.stock ? `<div class="err">المتوفر ${l.p.stock} فقط</div>` : ''}
        <div class="qty"><button data-d="1" aria-label="زيادة">${icon('plus')}</button><input type="number" value="${l.qty}" min="1" max="${Math.min(99, l.p.stock)}" aria-label="الكمية"><button data-d="-1" aria-label="إنقاص">${icon('minus')}</button></div></div>
      <div style="text-align:end"><div class="price">${money(l.p.price * l.qty)}</div><button class="icon-btn" data-rm aria-label="حذف">${icon('trash')}</button></div>
    </div>`).join('')}</div>
    <aside class="sum-box"><h3>ملخص الطلب</h3>
      <div class="coupon"><input class="in" id="cpIn" placeholder="كود الخصم" value="${esc(coupon)}" aria-label="كود الخصم" style="text-transform:uppercase"><button class="btn ghost sm" id="cpBtn">تطبيق</button></div>
      <div class="err" id="cpErr"></div>
      <div class="sum-row"><span>المجموع الفرعي</span><span>${money(sub)}</span></div>
      <div class="sum-row" id="discRow" style="display:none"><span>الخصم</span><span class="disc" id="discV"></span></div>
      <div class="sum-row"><span>الشحن</span><span class="muted">يُحدد في الخطوة التالية</span></div>
      <div class="sum-row total"><span>الإجمالي</span><span id="totV">${money(sub)}</span></div>
      <a href="#checkout" class="btn block" style="margin-top:16px">إتمام الطلب</a>
      <a href="#shop" class="btn ghost block" style="margin-top:10px">متابعة التسوق</a>
    </aside></div></section>`;
  $$('.line', view).forEach(row => {
    const id = row.dataset.id, inp = $('input', row);
    $$('[data-d]', row).forEach(b => b.addEventListener('click', () => { cart.set(id, (+inp.value || 1) + +b.dataset.d); cartPage(view); }));
    inp.addEventListener('change', () => { cart.set(id, +inp.value || 1); cartPage(view); });
    $('[data-rm]', row).addEventListener('click', () => { cart.remove(id); cartPage(view); });
  });
  const applyCoupon = async (silent) => {
    const code = $('#cpIn', view).value.trim().toUpperCase(); $('#cpErr', view).textContent = '';
    if (!code) { ss.set('lune.coupon', ''); $('#discRow', view).style.display = 'none'; $('#totV', view).textContent = money(sub); return; }
    try {
      const q = await api.quote({ items: items.map(i => ({ product_id: i.id, quantity: i.qty, size: i.size || null })), coupon_code: code });
      ss.set('lune.coupon', code);
      $('#discRow', view).style.display = ''; $('#discV', view).textContent = '− ' + money(q.discount); $('#totV', view).textContent = money(q.total);
      if (!silent) toast('تم تطبيق كود الخصم');
    } catch (e) { ss.set('lune.coupon', ''); $('#cpErr', view).textContent = e.message; }
  };
  $('#cpBtn', view).addEventListener('click', () => applyCoupon(false));
  if (coupon) applyCoupon(true);
}

async function checkout(view) {
  const items = cart.items();
  if (!items.length) return location.hash = 'cart';
  const user = api.user();
  const [prof, prods] = await Promise.all([user ? api.profile().catch(() => null) : null, api.products({ ids: items.map(i => i.id) })]);
  const pf = prof || {}, byId = Object.fromEntries(prods.map(p => [p.id, p]));
  const pay = CFG.PAYMENT || { cod: true, online: false };
  const ship = S.shipping;
  view.innerHTML = `<section class="wrap band"><h1 style="font-size:clamp(28px,4vw,42px)">إتمام الطلب</h1>
  ${user ? '' : '<p class="muted">لديكِ حساب؟ <a class="link-u" href="#account">سجّلي الدخول</a> لمتابعة طلباتكِ بسهولة. أو أكملي كزائرة.</p>'}
  <form id="coForm" class="two" novalidate>
    <div>
      <div class="panel"><div class="step-t"><i>1</i>بيانات التوصيل</div>
        <div class="grid2">
          <label class="f"><span>الاسم الكامل *</span><input class="in" name="name" required maxlength="100" autocomplete="name" value="${esc(pf.full_name || user?.user_metadata?.full_name || '')}"></label>
          <label class="f"><span>رقم الجوال *</span><input class="in" name="phone" required inputmode="tel" autocomplete="tel" placeholder="05xxxxxxxx" dir="ltr" style="text-align:right" value="${esc(pf.phone || '')}"></label>
          <label class="f"><span>البريد الإلكتروني</span><input class="in" name="email" type="email" autocomplete="email" dir="ltr" style="text-align:right" value="${esc(user?.email || '')}"></label>
          <label class="f"><span>المدينة *</span><input class="in" name="city" required list="cityList" autocomplete="address-level2" value="${esc(pf.city || '')}"><datalist id="cityList">${CITIES.map(c => `<option value="${c}">`).join('')}</datalist></label>
          <label class="f"><span>الحي</span><input class="in" name="district" maxlength="60" value="${esc(pf.district || '')}"></label>
          <label class="f"><span>العنوان بالتفصيل *</span><input class="in" name="address" required maxlength="300" autocomplete="street-address" placeholder="الشارع، رقم المبنى، العنوان الوطني" value="${esc(pf.address || '')}"></label>
        </div>
        <label class="f"><span>ملاحظات للطلب</span><textarea class="in" name="notes" maxlength="500" rows="2"></textarea></label>
        ${user ? '<label class="check"><input type="checkbox" name="saveProf" checked> حفظ البيانات لطلباتي القادمة</label>' : ''}
      </div>
      <div class="panel" style="margin-top:16px"><div class="step-t"><i>2</i>طريقة الشحن</div>
        ${ship.length ? ship.map((s, i) => `<label class="opt"><input type="radio" name="ship" value="${esc(s.id)}" ${i ? '' : 'checked'}><div><b>${esc(s.name)}</b>${s.eta ? `<div class="muted small">${esc(s.eta)}</div>` : ''}${s.free_over != null ? `<div class="muted small">مجاني للطلبات فوق ${money(s.free_over)}</div>` : ''}</div><span class="spacer"></span><b>${s.price > 0 ? money(s.price) : 'مجاني'}</b></label>`).join('')
      : '<p class="err">لا تتوفر خيارات شحن حالياً. يرجى المحاولة لاحقاً.</p>'}
      </div>
      <div class="panel" style="margin-top:16px"><div class="step-t"><i>3</i>طريقة الدفع</div>
        <label class="opt ${pay.online ? '' : 'disabled'}"><input type="radio" name="pay" value="online" ${pay.online ? '' : 'disabled'}><div><b>بطاقة مدى / Apple Pay / بطاقة ائتمانية</b><div class="muted small">${pay.online ? 'دفع آمن' : 'سيتوفر قريباً'}</div></div></label>
        ${pay.cod ? '<label class="opt"><input type="radio" name="pay" value="cod" checked><div><b>الدفع عند الاستلام</b><div class="muted small">ادفعي عند وصول طلبك</div></div></label>' : ''}
      </div>
    </div>
    <aside class="sum-box"><h3>طلبكِ</h3>
      ${items.map(i => byId[i.id] ? `<div class="mini-line"><div class="th">${img(byId[i.id])}</div><span style="flex:1">${esc(byId[i.id].name)}${i.size ? ` <span class="muted">(المقاس <bdi>${esc(i.size)}</bdi>)</span>` : ''} × ${i.qty}</span><span class="price">${money(byId[i.id].price * i.qty)}</span></div>` : '').join('')}
      <div class="coupon"><input class="in" id="cpIn" placeholder="كود الخصم" value="${esc(ss.get('lune.coupon', ''))}" style="text-transform:uppercase" aria-label="كود الخصم"><button type="button" class="btn ghost sm" id="cpBtn">تطبيق</button></div>
      <div id="sum"></div>
      <div class="err" id="coErr" role="alert"></div>
      <button class="btn block" id="coBtn" ${ship.length && (pay.cod || pay.online) ? '' : 'disabled'}>تأكيد الطلب</button>
      <p class="muted small" style="margin-top:10px">بالضغط على تأكيد الطلب توافقين على سياسة المتجر.</p>
    </aside>
  </form></section>`;
  const form = $('#coForm', view);
  const payload = () => {
    const fd = new FormData(form);
    return {
      customer: { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), city: fd.get('city'), district: fd.get('district'), address: fd.get('address'), notes: fd.get('notes') },
      items: cart.items().map(i => ({ product_id: i.id, quantity: i.qty, size: i.size || null })),
      shipping_method_id: fd.get('ship') || null, coupon_code: $('#cpIn', view).value.trim().toUpperCase() || null,
      payment_method: fd.get('pay') || null
    };
  };
  const requote = async () => {
    const p = payload();
    try {
      const q = await api.quote({ items: p.items, shipping_method_id: p.shipping_method_id, coupon_code: p.coupon_code });
      ss.set('lune.coupon', q.coupon_code || '');
      $('#sum', view).innerHTML = `<div class="sum-row"><span>المجموع الفرعي</span><span>${money(q.subtotal)}</span></div>
        ${q.discount > 0 ? `<div class="sum-row"><span>الخصم (<bdi>${esc(q.coupon_code)}</bdi>)</span><span class="disc">− ${money(q.discount)}</span></div>` : ''}
        <div class="sum-row"><span>الشحن</span><span>${q.shipping_method_id ? (q.shipping_fee > 0 ? money(q.shipping_fee) : 'مجاني') : '—'}</span></div>
        <div class="sum-row total"><span>الإجمالي</span><span>${money(q.total)}</span></div>`;
      $('#coErr', view).textContent = '';
      return true;
    } catch (e) {
      if (p.coupon_code && /الخصم/.test(e.message)) { $('#cpIn', view).value = ''; ss.set('lune.coupon', ''); toast(e.message, 'bad'); return requote(); }
      $('#coErr', view).textContent = e.message; return false;
    }
  };
  form.addEventListener('change', e => { if (e.target.name === 'ship') requote(); });
  $('#cpBtn', view).addEventListener('click', async () => { if (await requote() && $('#cpIn', view).value.trim()) toast('تم تطبيق كود الخصم'); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#coBtn', view), p = payload();
    if (!p.payment_method) return $('#coErr', view).textContent = 'يرجى اختيار طريقة الدفع';
    btn.disabled = true; btn.textContent = 'جارٍ إرسال الطلب…'; $('#coErr', view).textContent = '';
    try {
      const r = await api.placeOrder(p);
      if (user && new FormData(form).get('saveProf')) api.saveProfile({ full_name: p.customer.name, phone: p.customer.phone, city: p.customer.city, district: p.customer.district, address: p.customer.address }).catch(() => { });
      ss.set('lune.lastOrder', { id: r.order_id, token: r.access_token });
      ss.set('lune.coupon', '');
      cart.clear();
      location.hash = 'done';
    } catch (err) {
      $('#coErr', view).textContent = err.message; btn.disabled = false; btn.textContent = 'تأكيد الطلب';
    }
  });
  await requote();
}

async function donePage(view) {
  const last = ss.get('lune.lastOrder', null);
  const o = last && await api.orderPublic(last.id, last.token);
  if (!o) return view.innerHTML = `<div class="wrap band">${emptyBox('لا يوجد طلب لعرضه', 'يمكنكِ متابعة طلباتكِ من حسابكِ.', '<a class="btn" href="#account">حسابي</a>')}</div>`;
  view.innerHTML = `<section class="wrap band"><div class="done">
    <div class="tick">${icon('check')}</div>
    <h1 style="font-size:clamp(28px,4vw,40px)">شكراً ${esc(o.customer_name)}، وصلنا طلبكِ</h1>
    <p class="muted">رقم الطلب <b style="color:var(--ink)">#${esc(o.order_number)}</b> · سنتواصل معكِ لتأكيد التوصيل</p>
    <div class="panel">
      ${o.items.map(i => `<div class="mini-line"><div class="th">${i.image ? `<img src="${esc(i.image)}" alt="">` : placeholder(i.name)}</div><span style="flex:1">${esc(i.name)}${i.size ? ` <span class="muted">(المقاس <bdi>${esc(i.size)}</bdi>)</span>` : ''} × ${i.quantity}</span><span class="price">${money(i.line_total)}</span></div>`).join('')}
      <div class="sum-row" style="margin-top:8px"><span>المجموع الفرعي</span><span>${money(o.subtotal)}</span></div>
      ${o.discount > 0 ? `<div class="sum-row"><span>الخصم</span><span class="disc">− ${money(o.discount)}</span></div>` : ''}
      <div class="sum-row"><span>الشحن (${esc(o.shipping_name)})</span><span>${o.shipping_fee > 0 ? money(o.shipping_fee) : 'مجاني'}</span></div>
      <div class="sum-row total"><span>الإجمالي</span><span>${money(o.total)}</span></div>
      <div class="sum-row"><span>طريقة الدفع</span><span>${esc(PAY_METHOD[o.payment_method] || o.payment_method)}</span></div>
      <div class="sum-row"><span>الحالة</span><span class="st ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span></div>
    </div>
    <div class="row" style="justify-content:center;margin-top:22px"><a class="btn" href="#shop">متابعة التسوق</a>${api.user() ? '<a class="btn ghost" href="#account">طلباتي</a>' : ''}</div>
  </div></section>`;
}

async function accountPage(view) {
  const user = api.user();
  if (!user) return authForms(view);
  const [prof, orders] = await Promise.all([api.profile().catch(() => null), api.myOrders()]);
  const pf = prof || {};
  view.innerHTML = `<section class="wrap band"><div class="sec-head"><h1 style="font-size:clamp(28px,4vw,42px);margin:0">أهلاً ${esc(pf.full_name || user.user_metadata?.full_name || '')}</h1><button class="btn ghost sm" id="outBtn">${icon('out')} تسجيل الخروج</button></div>
  <div class="two">
    <div><h3>طلباتي</h3>
      ${orders.length ? orders.map(o => `<div class="order-card"><div class="row"><b>#${esc(o.order_number)}</b><span class="st ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span><span class="spacer"></span><span class="price">${money(o.total)}</span></div>
        <div class="muted small">${fmtDate(o.created_at)} · ${esc(PAY_METHOD[o.payment_method] || '')}</div>
        <div class="small" style="margin-top:6px">${o.items.map(i => `${esc(i.product_name)}${i.size ? ` (<bdi>${esc(i.size)}</bdi>)` : ''} × ${i.quantity}`).join('، ')}</div></div>`).join('')
      : '<p class="muted">لا توجد طلبات بعد. <a class="link-u" href="#shop">ابدئي التسوق</a></p>'}
    </div>
    <form class="panel" id="profForm"><h3>بياناتي</h3>
      <p class="muted small">${esc(user.email)}</p>
      <label class="f"><span>الاسم</span><input class="in" name="full_name" maxlength="100" value="${esc(pf.full_name || '')}"></label>
      <label class="f"><span>الجوال</span><input class="in" name="phone" inputmode="tel" dir="ltr" style="text-align:right" value="${esc(pf.phone || '')}"></label>
      <label class="f"><span>المدينة</span><input class="in" name="city" list="cityList2" value="${esc(pf.city || '')}"><datalist id="cityList2">${CITIES.map(c => `<option value="${c}">`).join('')}</datalist></label>
      <label class="f"><span>الحي</span><input class="in" name="district" value="${esc(pf.district || '')}"></label>
      <label class="f"><span>العنوان</span><input class="in" name="address" value="${esc(pf.address || '')}"></label>
      <button class="btn block">حفظ</button>
    </form>
  </div></section>`;
  $('#outBtn', view).addEventListener('click', async () => { await api.signOut(); await loadFavs(); toast('تم تسجيل الخروج'); route(); });
  $('#profForm', view).addEventListener('submit', async e => {
    e.preventDefault();
    try { await api.saveProfile(Object.fromEntries(new FormData(e.target))); toast('تم حفظ بياناتكِ'); } catch (err) { toast(err.message, 'bad'); }
  });
}

function authForms(view, mode = 'in', recovery = false) {
  view.innerHTML = `<section class="wrap band"><div class="auth">
    <h1 style="font-size:clamp(28px,4vw,40px);text-align:center">${recovery ? 'كلمة مرور جديدة' : 'حسابي'}</h1>
    ${recovery ? '' : `<div class="tabs"><button data-t="in" class="${mode === 'in' ? 'on' : ''}">تسجيل الدخول</button><button data-t="up" class="${mode === 'up' ? 'on' : ''}">حساب جديد</button></div>`}
    <form id="authForm" class="panel" novalidate>
      ${mode === 'up' ? '<label class="f"><span>الاسم</span><input class="in" name="name" required maxlength="100" autocomplete="name"></label>' : ''}
      ${recovery ? '' : `<label class="f"><span>البريد الإلكتروني</span><input class="in" name="email" type="email" required autocomplete="email" dir="ltr" style="text-align:right"></label>`}
      ${mode === 'forgot' ? '' : `<label class="f"><span>كلمة المرور</span><input class="in" name="password" type="password" required minlength="6" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" dir="ltr" style="text-align:right"></label>`}
      <div class="err" id="authErr" role="alert"></div>
      <button class="btn block">${{ in: 'دخول', up: 'إنشاء الحساب', forgot: 'إرسال رابط الاستعادة' }[mode] || 'حفظ'}</button>
      ${mode === 'in' && !recovery ? '<p class="small" style="text-align:center;margin:14px 0 0"><a href="#" id="forgot" class="link-u">نسيتِ كلمة المرور؟</a></p>' : ''}
    </form></div></section>`;
  $$('.tabs button', view).forEach(b => b.addEventListener('click', () => authForms(view, b.dataset.t)));
  $('#forgot', view)?.addEventListener('click', e => { e.preventDefault(); authForms(view, 'forgot'); });
  $('#authForm', view).addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const err = $('#authErr', view); err.textContent = '';
    const b = e.target.querySelector('button.btn'); b.disabled = true;
    try {
      if (recovery) { await api.updatePassword(fd.password); toast('تم تغيير كلمة المرور'); return route(); }
      if (mode === 'forgot') { await api.resetPassword(fd.email); err.style.color = 'var(--ok)'; err.textContent = 'إن كان البريد مسجّلاً فستصلكِ رسالة بها رابط الاستعادة.'; return; }
      if (mode === 'up') {
        if ((fd.name || '').trim().length < 2) throw new Error('يرجى إدخال الاسم');
        const r = await api.signUp(fd.email, fd.password, fd.name.trim());
        if (r.needsConfirm) { err.style.color = 'var(--ok)'; err.textContent = 'أرسلنا رسالة تأكيد إلى بريدك، افتحيها ثم سجّلي الدخول.'; return; }
        toast('أهلاً بكِ في LUNÉ');
      } else { await api.signIn(fd.email, fd.password); toast('تم تسجيل الدخول'); }
      await mergeLocalFavs(); await loadFavs(); route();
    } catch (x) { err.style.color = ''; err.textContent = x.message; }
    finally { b.disabled = false; }
  });
}

async function favoritesPage(view) {
  const ids = [...S.favs];
  const list = ids.length ? await api.products({ ids }) : [];
  view.innerHTML = `<section class="wrap band"><h1 style="font-size:clamp(28px,4vw,42px)">المفضلة</h1>
    ${api.user() ? '' : (list.length ? '<p class="muted small">المفضلة محفوظة في هذا الجهاز. <a class="link-u" href="#account">سجّلي الدخول</a> لحفظها في حسابك.</p>' : '')}
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : emptyBox('لا توجد منتجات في المفضلة', 'اضغطي على القلب بجانب أي منتج لحفظه هنا.', '<a class="btn" href="#shop">تصفّحي المتجر</a>')}</section>`;
}

// ---------------- البحث ----------------
function setupSearch() {
  const pop = $('#searchPop'), inp = $('#searchIn'), res = $('#searchRes');
  const open = () => { pop.classList.add('open'); inp.value = ''; res.innerHTML = ''; setTimeout(() => inp.focus(), 30); };
  const close = () => pop.classList.remove('open');
  $('#searchBtn').addEventListener('click', open);
  $('#searchClose').addEventListener('click', close);
  pop.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  pop.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  inp.addEventListener('input', debounce(async () => {
    const q = inp.value.trim();
    if (!q) return res.innerHTML = '';
    try {
      const l = await api.products({ q, limit: 6 });
      res.innerHTML = l.length ? l.map(p => `<a href="#p-${esc(p.slug)}"><div class="th" style="position:relative">${img(p)}</div><div><div>${esc(p.name)}</div>${priceHtml(p)}</div></a>`).join('') + `<a href="#shop" data-all class="link-u" style="justify-content:center">عرض كل النتائج</a>` : '<p class="muted">لا توجد نتائج.</p>';
      $('[data-all]', res)?.addEventListener('click', () => { S.shop = { cat: '', q, sort: 'new' }; });
    } catch (e) { res.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }, 250));
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); S.shop = { cat: '', q: inp.value.trim(), sort: 'new' }; close(); location.hash === '#shop' ? route() : location.hash = 'shop'; });
}

// ---------------- التوجيه ----------------
let lastHash = null;
async function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h !== lastHash) window.scrollTo(0, 0);
  lastHash = h;
  document.title = 'LUNÉ — متجر الأظافر';
  $('#drawer').classList.remove('open'); $('#drawerBack').classList.remove('open');
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (h.startsWith('cat-') ? 'shop' : h)));
  // كل صفحة تُرسم في حاوية خاصة بها حتى لا تكتب صفحة بطيئة فوق صفحة أحدث
  const view = document.createElement('div');
  view.innerHTML = '<div class="loading"><div class="spin"></div></div>';
  main.replaceChildren(view);
  try {
    if (h.startsWith('p-')) await productPage(view, h.slice(2));
    else if (h.startsWith('cat-')) { S.shop.cat = h.slice(4); await shop(view); }
    else if (h === 'shop') { S.shop.cat = ''; await shop(view); }
    else if (h === 'cart') await cartPage(view);
    else if (h === 'checkout') await checkout(view);
    else if (h === 'done') await donePage(view);
    else if (h === 'account') await accountPage(view);
    else if (h === 'favorites') await favoritesPage(view);
    else await home(view);
  } catch (e) { console.error(e); if (view.isConnected) fail(view, e); }
}

// كل الأزرار داخل الصفحات (إضافة للسلة / المفضلة)
main.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]'); if (f) { e.preventDefault(); return toggleFav(f.dataset.fav); }
  const a = e.target.closest('[data-add]'); if (a) { e.preventDefault(); cart.add(a.dataset.add, 1); toast('أُضيف إلى السلة'); }
});

async function init() {
  $('#menuBtn').innerHTML = icon('menu'); $('#searchBtn').innerHTML = icon('search'); $('#searchClose').innerHTML = icon('close'); $('#drawerClose').innerHTML = icon('close');
  $('#favLink').insertAdjacentHTML('afterbegin', icon('heart')); $('#userLink').innerHTML = icon('user'); $('#cartLink').insertAdjacentHTML('afterbegin', icon('bag'));
  $('#yr').textContent = new Date().getFullYear();
  if (!LIVE) $('#previewBar').classList.remove('hidden');
  const openD = () => { $('#drawer').classList.add('open'); $('#drawerBack').classList.add('open'); };
  const closeD = () => { $('#drawer').classList.remove('open'); $('#drawerBack').classList.remove('open'); };
  $('#menuBtn').addEventListener('click', openD); $('#drawerClose').addEventListener('click', closeD); $('#drawerBack').addEventListener('click', closeD);
  setupSearch();

  const st = CFG.STORE || {};
  const contact = [st.whatsapp && `<a href="https://wa.me/${esc(st.whatsapp.replace(/\D/g, ''))}">واتساب: <span dir="ltr">${esc(st.whatsapp)}</span></a>`, st.instagram && `<a href="https://instagram.com/${esc(st.instagram)}">إنستغرام: <span dir="ltr">@${esc(st.instagram)}</span></a>`, st.email && `<a href="mailto:${esc(st.email)}">${esc(st.email)}</a>`].filter(Boolean);
  if (contact.length) $('#footContact').insertAdjacentHTML('beforeend', '<h4 style="margin-top:18px">تواصلي معنا</h4>' + contact.join(''));

  const urlType = await api.consumeUrlSession().catch(() => null);
  try { [S.cats, S.shipping] = await Promise.all([api.categories(), api.shipping()]); } catch (e) { console.error(e); }
  const catLinks = S.cats.map(c => `<a href="#cat-${esc(c.slug)}">${esc(c.name)}</a>`).join('');
  $('#drawerCats').innerHTML = catLinks; $('#footCats').innerHTML = catLinks;
  const free = S.shipping.filter(s => s.free_over != null).map(s => s.free_over);
  if (free.length) { $('#announce').textContent = `شحن مجاني للطلبات فوق ${money(Math.min(...free))}`; $('#announce').classList.remove('hidden'); }
  await loadFavs();
  api.onAuth(() => loadFavs());
  window.addEventListener('hashchange', route);
  if (urlType === 'recovery') { const v = document.createElement('div'); main.replaceChildren(v); return authForms(v, 'in', true); }
  await route();
}
init();
