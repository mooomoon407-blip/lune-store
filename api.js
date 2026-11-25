// يختار الاتصال الحقيقي (Supabase) أو وضع المعاينة حسب config.js
import { CFG } from './util.js';

export const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const mod = LIVE ? await import('./backend-supabase.js') : await import('./backend-local.js');
export const api = await mod.createBackend(CFG);
