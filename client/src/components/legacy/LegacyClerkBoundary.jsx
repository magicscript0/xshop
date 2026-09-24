import { ClerkProvider } from '@clerk/clerk-react';

const legacyClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

const LegacyClerkBoundary = ({ children }) => {
  if (!legacyClerkKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <section className="max-w-xl rounded-2xl border border-white/10 bg-gray-900/80 p-7 text-center shadow-2xl shadow-purple-950/20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Legacy GenAxis</p>
          <h1 className="mt-3 text-2xl font-bold">The AI workspace needs its existing sign-in configuration.</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            XSHOP customer authentication is separate and uses Supabase. The preserved GenAxis AI tools still rely on their legacy Clerk configuration.
          </p>
          <a href="/" className="mt-6 inline-flex rounded-xl border border-purple-300/30 bg-purple-500/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500/20">
            Return to XSHOP
          </a>
        </section>
      </main>
    );
  }

  return (
    <ClerkProvider publishableKey={legacyClerkKey} afterSignOutUrl="/genaxis">
      {children}
    </ClerkProvider>
  );
};

export default LegacyClerkBoundary;
