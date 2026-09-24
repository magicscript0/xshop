import { useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import StorePageShell from '../../components/store/StorePageShell';
import useAuth from '../../hooks/useAuth';
import { authService } from '../../services/authService';

const PasswordReset = () => {
  const { status, isConfigured, updatePassword } = useAuth();
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get('token_hash');
  const tokenType = searchParams.get('type');
  const [verifyingLink, setVerifyingLink] = useState(Boolean(tokenHash));
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!tokenHash) return undefined;
    let active = true;
    if (tokenType !== 'recovery') {
      setInvalidLink(true);
      setVerifyingLink(false);
      return () => { active = false; };
    }

    setVerifyingLink(true);
    authService.verifyEmailLink(tokenHash, tokenType)
      .then(() => {
        if (active) setVerifyingLink(false);
      })
      .catch(() => {
        if (!active) return;
        setInvalidLink(true);
        setVerifyingLink(false);
      });
    return () => { active = false; };
  }, [tokenHash, tokenType]);

  if (status === 'loading' || verifyingLink) {
    return (
      <StorePageShell eyebrow="XSHOP / RECOVERY" title="Checking your reset link">
        <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-gray-900/70 p-6 text-sm text-gray-300" role="status" aria-live="polite">
          <span className="mr-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300 align-middle" aria-hidden="true" />
          Restoring your secure session…
        </div>
      </StorePageShell>
    );
  }

  if (status !== 'authenticated') {
    return (
      <StorePageShell
        eyebrow="XSHOP / RECOVERY"
        title="Reset your password"
        description={!isConfigured
          ? 'Password recovery is unavailable until Supabase is configured.'
          : invalidLink
            ? 'This reset link is invalid or expired.'
            : 'This page needs a valid, unexpired recovery session from your email link.'}
      >
        <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-gray-900/70 p-6 sm:p-8">
          <p className="text-sm leading-relaxed text-gray-300">{isConfigured ? 'The reset link may be expired or already used. Request a fresh link to continue.' : 'The authentication service is not connected in this environment.'}</p>
          <Link to="/forgot-password" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
            Request another link <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </StorePageShell>
    );
  }

  if (completed) {
    return (
      <StorePageShell eyebrow="XSHOP / RECOVERY" title="Password updated" description="Your new password has been saved securely by Supabase Auth.">
        <div className="mx-auto max-w-xl rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.06] p-6 sm:p-8">
          <p className="text-sm leading-relaxed text-emerald-100">You can continue to your account with your new password.</p>
          <Link to="/account" replace className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400/20">
            Continue to account <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </StorePageShell>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Use a password with at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'The passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      setCompleted(true);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'We could not update the password. Request a new reset link and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <StorePageShell eyebrow="XSHOP / RECOVERY" title="Choose a new password" description="Use a password you have not used for another account.">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-black/90 p-5 shadow-2xl shadow-purple-950/20 sm:p-8">
        {message && (
          <div role={message.type === 'error' ? 'alert' : 'status'} aria-live="polite" className="mb-5 rounded-xl border border-red-300/20 bg-red-400/[0.07] p-3 text-sm text-red-100">
            {message.text}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-200">New password</span>
            <span className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3.5 transition focus-within:border-purple-300/50">
              <LockKeyhole className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
              <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-gray-600" placeholder="At least 8 characters" />
            </span>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-200">Confirm new password</span>
            <span className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3.5 transition focus-within:border-purple-300/50">
              <LockKeyhole className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
              <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-gray-600" placeholder="Repeat your new password" />
            </span>
          </label>
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? 'Updating…' : 'Update password'}
            {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </form>
      </div>
    </StorePageShell>
  );
};

export default PasswordReset;
