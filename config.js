/* =====================================================================
   إعدادات متجر LUNÉ — هذا هو الملف الوحيد الذي تحتاجين تعديله
   ===================================================================== */
window.LUNE_CONFIG = {
  
  
  SUPABASE_URL: "https://ogyihzatabmqhuaprsah.supabase.co", 
  SUPABASE_ANON_KEY: "sb_publishable_-UoErXSq0kL3zIWd58EXPw_cAb1pd88",   // مفتاح anon أو publishable (آمن للواجهة). لا تضعي service_role هنا أبداً

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
