import { useCallback, useEffect, useState } from 'react';
import { Copy, Gift, Send, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { growthService } from '../../services/growthService';
import { formatDateTime, formatNumber } from '../../lib/format';

const inputClass = 'w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-300/50';

const AccountRewards = () => {
  const [rewards, setRewards] = useState(null);
  const [referral, setReferral] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [referralInput, setReferralInput] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([growthService.getMyRewards(), growthService.getMyReferralCode()])
      .then(([rewardData, referralData]) => { setRewards(rewardData); setReferral(referralData); })
      .catch((loadError) => setError(loadError.message || 'Your rewards could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(referral.code);
      toast.success('Referral code copied.');
    } catch {
      toast.error('The code could not be copied automatically.');
    }
  };

  const applyReferral = async (event) => {
    event.preventDefault();
    if (!referralInput.trim()) return;
    setBusy(true);
    try {
      await growthService.applyReferralCode(referralInput.trim());
      toast.success('Referral code applied. It qualifies after your first verified order.');
      setReferralInput('');
    } catch (actionError) {
      toast.error(actionError.message || 'This referral code could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div role="status" aria-live="polite" className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-gray-300">Loading your rewards…</div>;
  }

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-300/20 bg-red-400/[0.06] p-5 text-sm text-red-100">
        <p>{error}</p>
        <button type="button" onClick={load} className="mt-3 rounded-lg border border-red-300/25 px-3 py-1.5 text-xs font-semibold transition hover:bg-red-500/15">Try again</button>
      </div>
    );
  }

  const entries = rewards?.entries ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-purple-300/20 bg-gradient-to-br from-purple-500/10 to-blue-500/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-200"><Gift className="h-4 w-4" aria-hidden="true" /> Points balance</div>
          <p className="mt-2 text-3xl font-bold text-white">{formatNumber(rewards?.balance)}</p>
          {rewards?.enabled ? (
            <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
              Earn {formatNumber(rewards.earn_rate)} point{Number(rewards.earn_rate) === 1 ? '' : 's'} per 1.00 spent on verified orders.
              {Number(rewards.redeem_rate) > 0 && ` Redeem ${formatNumber(rewards.redeem_rate)} points per 1.00 off at checkout.`}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-gray-500">Rewards are currently disabled by the store.</p>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-200"><Users className="h-4 w-4" aria-hidden="true" /> Your referral code</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-lg tracking-widest text-white">{referral?.code ?? '—'}</span>
            <button type="button" onClick={copyCode} aria-label="Copy referral code" className="rounded-lg border border-white/10 p-2 text-gray-400 transition hover:border-white/25 hover:text-white"><Copy className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-gray-400">
            {referral?.enabled
              ? `Referrals qualify only after the referred customer completes a verified order — never for clicks alone. ${formatNumber(referral?.qualified)} qualified so far.`
              : 'Referrals are currently disabled by the store.'}
          </p>
        </div>
      </div>

      <form onSubmit={applyReferral} className="rounded-xl border border-white/10 bg-black/30 p-5">
        <h3 className="text-sm font-semibold text-white">Were you referred?</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">New customers can apply one referral code before their first verified order. Self-referrals are rejected.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text" value={referralInput} maxLength={12}
            onChange={(event) => setReferralInput(event.target.value.toUpperCase())}
            placeholder="Referral code" aria-label="Referral code"
            className={`${inputClass} !w-48 font-mono uppercase`}
          />
          <button type="submit" disabled={busy || !referralInput.trim()} className="inline-flex items-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" aria-hidden="true" /> {busy ? 'Applying…' : 'Apply code'}
          </button>
        </div>
      </form>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">Points history</h3>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-center text-sm text-gray-500">
            No reward activity yet. Points appear here after verified orders.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10 bg-black/25">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-gray-200">{entry.description}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatDateTime(entry.created_at)} · {entry.entry_type.replaceAll('_', ' ')}</p>
                </div>
                <span className={`shrink-0 font-semibold ${entry.points_delta > 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                  {entry.points_delta > 0 ? '+' : ''}{formatNumber(entry.points_delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AccountRewards;
