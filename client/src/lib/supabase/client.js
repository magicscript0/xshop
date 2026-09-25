import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const createSupabaseClient = () => {
  if (!supabaseUrl || !supabasePublishableKey) {
    const missing = [
      !supabaseUrl && 'VITE_SUPABASE_URL',
      !supabasePublishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
    ].filter(Boolean).join(', ');
    // VITE_* values are inlined at build time: on Vercel they must be set in
    // Project Settings -> Environment Variables and the project redeployed.
    console.error(`[XSHOP] Supabase is not configured. Missing: ${missing}.`);
    return null;
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;

    return createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
      },
    });
  } catch (error) {
    console.error('[XSHOP] Supabase client could not be created. Check VITE_SUPABASE_URL.', error);
    return null;
  }
};

export const supabase = createSupabaseClient();
export const isSupabaseConfigured = Boolean(supabase);
