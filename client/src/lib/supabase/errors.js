// Developer-facing diagnostics for Supabase failures. Never logs secrets; the
// publishable key is not included in PostgREST/Auth error objects.
export const logSupabaseError = (context, error) => {
  if (!error) return;
  const details = {
    code: error.code ?? null,
    status: error.status ?? null,
    message: error.message ?? String(error),
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
  if (import.meta.env.DEV) {
    console.error(`[XSHOP] ${context}`, details, error);
  } else {
    // Keep a compact, non-sensitive trace in production so failures on Vercel
    // are diagnosable from the browser console instead of failing silently.
    console.error(`[XSHOP] ${context}: ${details.code ?? details.status ?? 'error'} ${details.message}`);
  }
};
