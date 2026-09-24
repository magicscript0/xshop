import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const createSupabaseClient = () => {
  if (!supabaseUrl || !supabasePublishableKey) return null;

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
  } catch {
    return null;
  }
};

export const supabase = createSupabaseClient();
export const isSupabaseConfigured = Boolean(supabase);
