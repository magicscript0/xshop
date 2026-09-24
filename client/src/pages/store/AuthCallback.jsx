import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import StorePageShell from '../../components/store/StorePageShell';
import useAuth from '../../hooks/useAuth';
import { authService } from '../../services/authService';

const AuthCallback = () => {
  const { status, isConfigured } = useAuth();
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get('token_hash');
  const tokenType = searchParams.get('type');
  const hasProviderError = searchParams.has('error') || searchParams.has('error_code');
  const [verifying, setVerifying] = useState(Boolean(tokenHash));
  const [verificationSucceeded, setVerificationSucceeded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tokenHash) return undefined;
    let active = true;
    setVerifying(true);
    authService.verifyEmailLink(tokenHash, tokenType)
      .then(() => {
        if (!active) return;
        setVerificationSucceeded(true);
        setVerifying(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setVerifying(false);
      });
    return () => { active = false; };
  }, [tokenHash, tokenType]);

  if (status === 'authenticated') return <Navigate to="/account" replace />;

  const loading = status === 'loading' || verifying;
  const error = failed || hasProviderError || !isConfigured;

  return (
    <StorePageShell
      eyebrow="XSHOP / SIGN IN"
      title={loading ? 'Finishing secure sign-in' : error ? 'Sign-in could not be completed' : verificationSucceeded ? 'Email verified' : 'Checking your sign-in'}
      description={loading ? 'Please wait while we confirm your session.' : undefined}
    >
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-gray-900/70 p-6 text-center shadow-2xl shadow-purple-950/10 sm:p-8">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 text-sm text-gray-300">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" aria-hidden="true" />
            Verifying with Supabase Auth…
          </div>
        ) : error ? (
          <>
            <ShieldCheck className="mx-auto h-8 w-8 text-amber-200" aria-hidden="true" />
            <p role="alert" className="mt-4 text-sm leading-relaxed text-gray-300">This link may have expired, or the provider sign-in was cancelled. No authentication details are shown here.</p>
            <Link to="/login" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
              Return to sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        ) : verificationSucceeded ? (
          <>
            <ShieldCheck className="mx-auto h-8 w-8 text-emerald-200" aria-hidden="true" />
            <p role="status" className="mt-4 text-sm leading-relaxed text-emerald-100">Your email link was verified. Sign in to continue.</p>
            <Link to="/login" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400/20">
              Continue to sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <>
            <ShieldCheck className="mx-auto h-8 w-8 text-purple-200" aria-hidden="true" />
            <p className="mt-4 text-sm leading-relaxed text-gray-300">The sign-in session was not established. Restart sign-in and try again.</p>
            <Link to="/login" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
              Return to sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </StorePageShell>
  );
};

export default AuthCallback;
