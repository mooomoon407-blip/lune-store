/* =====================================================================
   إعدادات متجر LUNÉ — هذا هو الملف الوحيد الذي تحتاجين تعديله
   ===================================================================== */
window.LUNE_CONFIG = {
  // من Supabase → Project Settings → API
  // اتركيهما فارغين = «وضع المعاينة» (البيانات تُحفظ في متصفحك فقط)
  SUPABASE_URL: "",        // مثال: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: "",   // مفتاح anon أو publishable (آمن للواجهة). لا تضعي service_role هنا أبداً

  STORE: {
    name: "LUNÉ",
    currency: "ر.س",
    whatsapp: "",   // مثال: 9665XXXXXXXX
    instagram: "",  // اسم الحساب بدون @
    email: ""
  },

  PAYMENT: {
    cod: true,      // الدفع عند الاستلام
    online: false   // مدى / Apple Pay — يُفعّل في خطوة بوابة الدفع
  }
};
