// أدوات مشتركة بين المتجر ولوحة التحكم
export const CFG = window.LUNE_CONFIG || {};
export const CUR = (CFG.STORE && CFG.STORE.currency) || 'ر.س';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function money(n) {
  const v = Number(n || 0);
  const s = v % 1 === 0 ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} ${CUR}`;
}

export function fmtDate(d) {
  try { return new Date(d).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return String(d); }
}

export function randSlug(prefix = 'p') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let toastBox;
export function toast(msg, type = 'ok') {
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; toastBox.setAttribute('role', 'status'); document.body.append(toastBox); }
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  toastBox.append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

// نافذة تأكيد مخصصة (المتصفح المضمَّن يمنع confirm)
export function confirmBox(text, okLabel = 'تأكيد', danger = true) {
  return new Promise(res => {
    const d = document.createElement('div');
    d.className = 'modal-back';
    d.innerHTML = `<div class="modal small" role="dialog" aria-modal="true"><p class="confirm-text"></p>
      <div class="row-end"><button class="btn ghost" data-a="no">إلغاء</button>
      <button class="btn ${danger ? 'danger' : ''}" data-a="yes"></button></div></div>`;
    d.querySelector('.confirm-text').textContent = text;
    d.querySelector('[data-a=yes]').textContent = okLabel;
    d.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a || e.target === d) { d.remove(); res(a === 'yes'); }
    });
    document.body.append(d);
    d.querySelector('[data-a=yes]').focus();
  });
}

// تصغير الصورة قبل الرفع (أسرع للعميلات وأوفر للتخزين)
export async function resizeImage(file, max = 1600, quality = 0.86) {
  if (!file.type.startsWith('image/')) throw new Error('الملف ليس صورة');
  if (file.size > 15 * 1024 * 1024) throw new Error('حجم الصورة كبير جداً (الحد 15MB)');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('تعذّر قراءة الصورة')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(ok => c.toBlob(ok, 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}

export const blobToDataURL = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });

export const STATUS = {
  pending: 'بانتظار التأكيد',
  confirmed: 'مؤكد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي'
};
export const PAY_STATUS = { unpaid: 'غير مدفوع', paid: 'مدفوع', failed: 'فشل الدفع', refunded: 'مسترجع' };
export const PAY_METHOD = { online: 'دفع إلكتروني', cod: 'الدفع عند الاستلام' };

export const CITIES = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الظهران', 'الأحساء', 'القطيف', 'الطائف', 'تبوك', 'بريدة', 'عنيزة', 'حائل', 'أبها', 'خميس مشيط', 'جازان', 'نجران', 'الباحة', 'الجبيل', 'ينبع', 'سكاكا', 'عرعر', 'القريات', 'حفر الباطن'];

// أيقونات خطية
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  back: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  img: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>',
  out: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>',
  store: '<path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>',
  star: '<path d="M12 3v18M3 12h18"/>'
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

// وضع المعاينة مسموح فقط داخل نافذة المعاينة أو على جهاز المطوّر، وليس على موقع منشور
export const PREVIEW_ALLOWED = (() => {
  try { if (window.self !== window.top) return true; } catch { return true; }
  return ['localhost', '127.0.0.1', '', '[::1]'].includes(location.hostname) || location.protocol === 'file:';
})();
export function notReadyPage(admin = false) {
  document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center;background:#FFFCFA;color:#2B1F23;font-family:'IBM Plex Sans Arabic',system-ui,sans-serif" dir="rtl">
    <div><div style="font-family:'Bodoni Moda',Georgia,serif;font-size:40px;letter-spacing:.14em">LUNÉ</div>
    <h1 style="font-weight:300;font-size:26px;margin:18px 0 8px">${admin ? 'لوحة التحكم غير جاهزة' : 'المتجر قيد التجهيز'}</h1>
    <p style="color:#7E6C70;max-width:30em">${admin ? 'لم يُربط الموقع بقاعدة البيانات بعد: أضيفي SUPABASE_URL وSUPABASE_ANON_KEY في ملف config.js ثم ارفعيه مجدداً.' : 'نعمل على تجهيز مجموعتنا، عودي قريباً.'}</p></div></div>`;
}
