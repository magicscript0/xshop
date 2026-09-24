import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { formatDateTime, shortId } from '../../lib/format';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote, Modal,
  dangerButtonClass, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from '../../components/admin/AdminUI';

const AdminPayments = () => {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewSession, setReviewSession] = useState(null);
  const [decision, setDecision] = useState('approve');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.listReviewQueue()
      .then((data) => setQueue(data))
      .catch((loadError) => setError(loadError.message || 'The review queue could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReview = (session) => {
    setReviewSession(session);
    setDecision('approve');
    setReason('');
    setDialogError('');
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setDialogError('');
    if (decision === 'reject' && !reason.trim()) {
      setDialogError('A rejection reason is required.');
      return;
    }
    setBusy(true);
    try {
      await adminService.reviewPayment(reviewSession.id, decision === 'approve', decision === 'reject' ? reason.trim() : null);
      toast.success(decision === 'approve' ? 'Payment verified. Fulfillment was attempted automatically.' : 'Payment rejected.');
      setReviewSession(null);
      load();
    } catch (actionError) {
      setDialogError(actionError.message || 'The review could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard
        title="Payment review queue"
        description="Submitted transaction references awaiting explicit manual verification. A hash alone is never proof of payment — confirm the transfer on the relevant network explorer first. Every decision records who decided, when, and why."
      >
        {loading ? <LoadingNote label="Loading review queue…" /> : error ? <ErrorNote message={error} onRetry={load} /> : queue.length === 0 ? (
          <EmptyNote title="No payments waiting for review" description="Submitted crypto transactions appear here for manual verification." />
        ) : (
          <AdminTable headers={['Order', 'Asset', 'Expected', 'Transaction hash', 'Submitted', 'Actions']} caption="Payments awaiting review">
            {queue.map((session) => (
              <tr key={session.id}>
                <td className="px-3 py-2.5">
                  <Link to={`/admin/orders/${session.order_id}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-purple-200 underline-offset-4 transition hover:text-white hover:underline">
                    {shortId(session.order_id)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-gray-200">{session.asset_code}<span className="block text-xs text-gray-500">{session.network_code}</span></td>
                <td className="px-3 py-2.5 text-white">{session.expected_amount}</td>
                <td className="px-3 py-2.5"><span className="block max-w-[180px] truncate font-mono text-xs text-gray-400" title={session.transaction_hash}>{session.transaction_hash}</span></td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{formatDateTime(session.submitted_at)}</td>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={() => openReview(session)} className="rounded-lg border border-purple-300/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-500/20">
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {reviewSession && (
        <Modal title="Manual payment review" onClose={() => setReviewSession(null)}>
          <form onSubmit={submitReview} className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4 text-xs leading-relaxed text-gray-400">
              <p><span className="text-gray-500">Order:</span> <span className="font-mono text-gray-300">{reviewSession.order_id}</span></p>
              <p className="mt-1"><span className="text-gray-500">Expected:</span> <span className="text-white">{reviewSession.expected_amount} {reviewSession.asset_code}</span> on {reviewSession.network_code}</p>
              <p className="mt-1"><span className="text-gray-500">Receiving address:</span> <span className="break-all font-mono text-gray-300">{reviewSession.receiving_address}</span></p>
              <p className="mt-1"><span className="text-gray-500">Hash:</span> <span className="break-all font-mono text-gray-300">{reviewSession.transaction_hash}</span></p>
            </div>
            {dialogError && <ErrorNote message={dialogError} />}
            <Field label="Decision" required>
              <select value={decision} onChange={(event) => setDecision(event.target.value)} className={selectClass}>
                <option value="approve">Approve — I confirmed this transfer manually</option>
                <option value="reject">Reject — this payment could not be confirmed</option>
              </select>
            </Field>
            {decision === 'reject' && (
              <Field label="Rejection reason" required hint="Shown to the customer on their order page.">
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} className={inputClass} />
              </Field>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setReviewSession(null)} className={subtleButtonClass}>Cancel</button>
              <button type="submit" disabled={busy} className={decision === 'approve' ? primaryButtonClass : dangerButtonClass}>
                {busy ? 'Recording…' : decision === 'approve' ? 'Verify payment' : 'Reject payment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminPayments;
