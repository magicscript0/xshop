import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import StorePageShell from '../../components/store/StorePageShell';
import useAuth from '../../hooks/useAuth';

const getSafeDestination = (value) => (
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/account'
);

const AuthPage = ({ mode = 'sign-in' }) => {
  const {
    status,
    user,
    isConfigured,
    signUp,
    signInWithPassword,
    signInWithGoogle,
    resendVerification,
    requestPasswordReset,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [canResendVerification, setCanResendVerification] = useState(false);
  const destination = getSafeDestination(location.state?.from);
  const isSignUp = mode === 'sign-up';
  const isForgotPassword = mode === 'forgot-password';
  const heading = isSignUp ? 'Create your account' : isForgotPassword ? 'Reset your password' : 'Welcome back';
  const eyebrow = isSignUp ? 'XSHOP / JOIN' : isForgotPassword ? 'XSHOP / RECOVERY' : 'XSHOP / SIGN IN';

  if (status === 'authenticated' && user) {
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice(null);
    setCanResendVerification(false);

    if (!isConfigured) {
      setNotice({ type: 'error', message: 'XSHOP authentication is not configured yet. Please try again later.' });
      return;
    }

    setBusy('form');
    try {
      if (isForgotPassword) {
        await requestPasswordReset(email);
        setNotice({
          type: 'success',
          message: 'If an account can receive recovery mail at this address, instructions are on the way.',
        });
      } else if (isSignUp) {
        if (!displayName.trim()) {
          setNotice({ type: 'error', message: 'Enter a display name to create your account.' });
          return;
        }
        if (password.length < 8) {
          setNotice({ type: 'error', message: 'Use a password with at least 8 characters.' });
          return;
        }
        if (password !== confirmPassword) {
          setNotice({ type: 'error', message: 'The passwords do not match.' });
          return;
        }
        const result = await signUp({ email, password, displayName });
        if (result.emailConfirmationRequired) {
          setCanResendVerification(true);
          setNotice({ type: 'success', message: 'Check your inbox for a verification link before signing in.' });
        } else {
          navigate(destination, { replace: true });
        }
      } else {
        await signInWithPassword({ email, password });
        navigate(destination, { replace: true });
      }
    } catch (error) {
      setCanResendVerification(error.code === 'email_not_confirmed');
      setNotice({ type: 'error', message: error.message || 'We could not complete that request. Please try again.' });
    } finally {
      setBusy('');
    }
  };

  const handleGoogleSignIn = async () => {
    setNotice(null);
    if (!isConfigured) {
      setNotice({ type: 'error', message: 'XSHOP authentication is not configured yet. Please try again later.' });
      return;
    }

    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Google sign-in could not be started. Please try again.' });
      setBusy('');
    }
  };

  const handleResendVerification = async () => {
    setNotice(null);
    setBusy('resend');
    try {
      await resendVerification(email);
      setNotice({ type: 'success', message: 'If this address has an unverified account, a new verification email is on the way.' });
      setCanResendVerification(false);
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'We could not send a verification email. Please try again.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <StorePageShell
      eyebrow={eyebrow}
      title={heading}
      description={isForgotPassword
        ? 'We will send a secure recovery link if the address can receive account email.'
        : isSignUp
          ? 'A single XSHOP account for your customer details, orders, wishlist, and private digital delivery.'
          : 'Sign in to continue to your private XSHOP account.'}
      className="pb-24"
    >
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-black/90 shadow-2xl shadow-purple-950/20 backdrop-blur-2xl lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden border-r border-white/10 bg-gradient-to-br from-purple-950/55 via-gray-950 to-blue-950/25 p-8 lg:flex">
          <div className="pointer-events-none absolute -left-16 top-16 h-64 w-64 rounded-full bg-purple-500/15 blur-[90px]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-16 -right-12 h-72 w-72 rounded-full bg-blue-500/15 blur-[100px]" aria-hidden="true" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-300/25 bg-white/[0.05] text-purple-200 shadow-[0_0_32px_rgba(168,85,247,0.15)]">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">A more considered storefront</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight text-white">Your account stays yours.</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-300">Your sign-in is handled by Supabase Auth. XSHOP never stores your password in its application database.</p>
          </div>
          <div className="relative rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
            <p className="text-sm font-medium text-white">Private by design</p>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">Customer account data is scoped to the signed-in account at the database layer.</p>
          </div>
        </aside>

        <div className="p-5 sm:p-8 lg:p-10">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-300/25 bg-purple-500/10 text-purple-200">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">XSHOP account</p>
              <p className="text-xs text-gray-400">Secure sign-in</p>
            </div>
          </div>

          {!isConfigured && (
            <div role="status" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.07] p-3 text-sm leading-relaxed text-amber-100">
              Authentication is not connected in this environment. Configure the public Supabase URL and publishable key to enable sign-in.
            </div>
          )}
          {status === 'loading' && (
            <div role="status" aria-live="polite" className="mb-5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-gray-300">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" aria-hidden="true" />
              Restoring your secure session…
            </div>
          )}

          {notice && (
            <div
              role={notice.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`mb-5 rounded-xl border p-3 text-sm leading-relaxed ${notice.type === 'error' ? 'border-red-300/20 bg-red-400/[0.07] text-red-100' : 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100'}`}
            >
              {notice.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-200">Display name</span>
                <span className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3.5 transition focus-within:border-purple-300/50">
                  <UserRound className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
                  <input
                    autoComplete="name"
                    maxLength={120}
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Your name"
                    className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-gray-600"
                  />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-200">Email</span>
              <span className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3.5 transition focus-within:border-purple-300/50">
                <Mail className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-gray-600"
                />
              </span>
            </label>

            {!isForgotPassword && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-200">Password</span>
                <span className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3.5 transition focus-within:border-purple-300/50">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    minLength={isSignUp ? 8 : undefined}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={isSignUp ? 'At least 8 characters' : 'Enter your password'}
                    className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-gray-600"
                  />
                  <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'} className="rounded-md p-1 text-gray-400 transition hover:text-white">
                    {passwordVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </span>
              </label>
            )}

            {isSignUp && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-200">Confirm password</span>
                <span className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3.5 transition focus-within:border-purple-300/50">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your password"
                    className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-gray-600"
                  />
                </span>
              </label>
            )}

            {!isSignUp && !isForgotPassword && (
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs font-medium text-purple-200 transition hover:text-white">Forgot password?</Link>
              </div>
            )}

            <button
              type="submit"
              disabled={!isConfigured || Boolean(busy) || status === 'loading'}
              className="group flex w-full items-center justify-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'form' ? 'Please wait…' : isSignUp ? 'Create account' : isForgotPassword ? 'Send recovery link' : 'Sign in'}
              {busy !== 'form' && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
            </button>
          </form>

          {canResendVerification && !isForgotPassword && (
            <button type="button" onClick={handleResendVerification} disabled={!isConfigured || Boolean(busy) || !email.trim()} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition hover:border-purple-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
              {busy === 'resend' ? 'Sending…' : 'Resend verification email'}
            </button>
          )}

          {!isForgotPassword && (
            <>
              <div className="my-6 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500">or continue with</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <button type="button" onClick={handleGoogleSignIn} disabled={!isConfigured || Boolean(busy) || status === 'loading'} className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/90 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-700" aria-hidden="true">G</span>
                {busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
              </button>
            </>
          )}

          <p className="mt-6 text-center text-sm text-gray-400">
            {isSignUp ? (
              <>Already have an account? <Link to="/login" state={location.state} className="font-semibold text-purple-200 transition hover:text-white">Sign in</Link></>
            ) : isForgotPassword ? (
              <>Remembered your password? <Link to="/login" className="font-semibold text-purple-200 transition hover:text-white">Return to sign in</Link></>
            ) : (
              <>New to XSHOP? <Link to="/register" state={location.state} className="font-semibold text-purple-200 transition hover:text-white">Create an account</Link></>
            )}
          </p>
        </div>
      </div>
    </StorePageShell>
  );
};

export default AuthPage;
