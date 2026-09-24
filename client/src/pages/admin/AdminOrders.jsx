import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { formatDateTime, formatMoney, shortId } from '../../lib/format';
import useAuth from '../../hooks/useAuth';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote, Modal,
  StatusBadge, dangerButtonClass, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from '../../components/admin/AdminUI';

const PAGE_SIZE = 25;
const PAYMENT_STATUSES = ['unpaid', 'pending', 'submitted', 'verified', 'rejected', 'expired'];

const ReviewDialog = ({ session, onClose, onDone }) => {
  const [decision, setDecision] = useState('approve');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (decision === 'reject' && !reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setBusy(true);
    try {
      const result = await adminService.reviewPayment(session.id, decision === 'approve', decision === 'reject' ? reason.trim() : null);
      toast.success(decision === 'approve' ? 'Payment verified and fulfillment attempted.' : 'Payment rejected.');
      onDone(result);
    } catch (actionError) {
      setError(actionError.message || 'The review could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Manual payment review" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4 text-xs leading-relaxed text-gray-400">
          <p><span className="text-gray-500">Session:</span> <span className="font-mono text-gray-300">{session.id}</span></p>
          <p className="mt-1"><span className="text-gray-500">Expected:</span> <span className="text-white">{session.expected_amount} {session.asset_code}</span> on {session.network_code}</p>
          <p className="mt-1"><span className="text-gray-500">Receiving address:</span> <span className="break-all font-mono text-gray-300">{session.receiving_address}</span></p>
          <p className="mt-1"><span className="text-gray-500">Submitted hash:</span> <span className="break-all font-mono text-gray-300">{session.transaction_hash || '—'}</span></p>
          <p className="mt-1"><span className="text-gray-500">Submitted at:</span> {formatDateTime(session.submitted_at)}</p>
        </div>
        <p className="text-xs leading-relaxed text-amber-200/90">
          A transaction hash is not proof of payment. Confirm the transfer on the relevant network explorer against the
          expected amount and receiving address before approving. Your decision is permanently audited.
        </p>
        {error && <ErrorNote message={error} />}
        <Field label="Decision" required>
          <select value={decision} onChange={(event) => setDecision(event.target.value)} className={selectClass}>
            <option value="approve">Approve — payment confirmed manually</option>
            <option value="reject">Reject — payment could not be confirmed</option>
          </select>
        </Field>
        {decision === 'reject' && (
          <Field label="Rejection reason" required hint="Shared with the customer on their order page.">
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} className={inputClass} />
          </Field>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={subtleButtonClass}>Cancel</button>
          <button type="submit" disabled={busy} className={decision === 'approve' ? primaryButtonClass : dangerButtonClass}>
            {busy ? 'Recording…' : decision === 'approve' ? 'Verify payment' : 'Reject payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const ManualFulfillDialog = ({ order, onClose, onDone }) => {
  const [payloads, setPayloads] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const deliveries = [];
    for (const item of order.manual_items) {
      const raw = (payloads[item.id] || '').split('\n').map((line) => line.trim()).filter(Boolean);
      if (raw.length !== item.quantity) {
        setError(`"${item.product_name_snapshot}" needs exactly ${item.quantity} delivery line(s), one per purchased unit.`);
        return;
      }
      deliveries.push({ order_item_id: item.id, payloads: raw });
    }
    setBusy(true);
    try {
      await adminService.manualFulfill(order.id, deliveries);
      toast.success('Manual fulfillment recorded.');
      onDone();
    } catch (actionError) {
      setError(actionError.message || 'Manual fulfillment could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Complete manual fulfillment" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs leading-relaxed text-gray-400">
          Provide one delivery line per purchased unit for each manually fulfilled item. Deliveries become visible only to
          this order's owner and are never shown publicly.
        </p>
        {error && <ErrorNote message={error} />}
        {order.manual_items.map((item) => (
          <Field key={item.id} label={`${item.product_name_snapshot}${item.variant_name_snapshot ? ` — ${item.variant_name_snapshot}` : ''} (${item.quantity} unit${item.quantity > 1 ? 's' : ''})`} required>
            <textarea
              rows={Math.min(6, item.quantity + 1)}
              value={payloads[item.id] || ''}
              onChange={(event) => setPayloads((current) => ({ ...current, [item.id]: event.target.value }))}
              placeholder="One delivery entry per line"
              className={`${inputClass} font-mono`}
            />
          </Field>
        ))}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={subtleButtonClass}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Recording…' : 'Complete fulfillment'}</button>
        </div>
      </form>
    </Modal>
  );
};

export const AdminOrderDetails = () => {
  const { id } = useParams();
  const { profile } = useAuth();
  const isAdmin = ['admin', 'super_admin'].includes(profile?.role);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewSession, setReviewSession] = useState(null);
  const [showManualFulfill, setShowManualFulfill] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.getOrderAdmin(id)
      .then((data) => setOrder(data))
      .catch((loadError) => setError(loadError.message || 'The order could not be loaded.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote label="Loading order…" />;
  if (error) return <ErrorNote message={error} onRetry={load} />;
  if (!order) return <EmptyNote title="Order not found" />;

  const manualItems = order.items.filter((item) => item.fulfillment_mode === 'manual');
  const canManualFulfill = isAdmin && order.payment_status === 'verified'
    && order.fulfillment?.status === 'manual_required' && manualItems.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/orders" className="inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={order.payment_status} />
          <StatusBadge value={order.fulfillment_status} />
        </div>
      </div>

      <AdminCard title={`Order ${shortId(order.id)}`} description={`Created ${formatDateTime(order.created_at)} · updated ${formatDateTime(order.updated_at)}`}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs uppercase tracking-wider text-gray-500">Customer</dt><dd className="mt-1 text-gray-200">{order.customer?.display_name || '—'}<span className="block text-xs text-gray-500">{order.customer?.email || order.contact_email}</span></dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-gray-500">Contact email</dt><dd className="mt-1 break-all text-gray-200">{order.contact_email}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-gray-500">Order ID</dt><dd className="mt-1 break-all font-mono text-xs text-gray-300">{order.id}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-gray-500">Subtotal</dt><dd className="mt-1 text-gray-200">{formatMoney(order.subtotal_amount, order.currency_code)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-gray-500">Discounts</dt><dd className="mt-1 text-gray-200">
            −{formatMoney(Number(order.discount_amount) + Number(order.coupon_discount_amount) + Number(order.reward_discount_amount), order.currency_code)}
            {order.coupon_code_snapshot && <span className="block text-xs text-gray-500">Coupon {order.coupon_code_snapshot}: −{formatMoney(order.coupon_discount_amount, order.currency_code)}</span>}
            {Number(order.reward_points_redeemed) > 0 && <span className="block text-xs text-gray-500">{order.reward_points_redeemed} points: −{formatMoney(order.reward_discount_amount, order.currency_code)}</span>}
          </dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-gray-500">Total</dt><dd className="mt-1 font-semibold text-white">{formatMoney(order.total_amount, order.currency_code)}</dd></div>
        </dl>
      </AdminCard>

      <AdminCard title="Items" description="Immutable snapshot captured at order time; historical prices are never recalculated.">
        <AdminTable headers={['Product', 'Qty', 'Unit price', 'Unit discount', 'Line total']} caption="Order items">
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2.5 text-gray-200">{item.product_name_snapshot}{item.variant_name_snapshot && <span className="block text-xs text-gray-500">{item.variant_name_snapshot}</span>}</td>
              <td className="px-3 py-2.5 text-gray-300">{item.quantity}</td>
              <td className="px-3 py-2.5 text-gray-300">{formatMoney(item.unit_price_amount, item.currency_code)}</td>
              <td className="px-3 py-2.5 text-gray-300">−{formatMoney(item.unit_discount_amount, item.currency_code)}</td>
              <td className="px-3 py-2.5 text-white">{formatMoney(item.line_total_amount, item.currency_code)}</td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard
        title="Payment sessions"
        description="Manual review only: a submitted hash is never treated as proof of payment."
        actions={canManualFulfill && (
          <button type="button" onClick={() => setShowManualFulfill(true)} className={primaryButtonClass}>Complete manual fulfillment</button>
        )}
      >
        {order.payment_sessions.length === 0 ? (
          <EmptyNote title="No payment sessions" description="The customer has not started a payment for this order yet." />
        ) : (
          <div className="space-y-3">
            {order.payment_sessions.map((session) => (
              <div key={session.id} className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{session.asset_code} · {session.network_code}</p>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={session.status} />
                    {isAdmin && session.status === 'submitted' && (
                      <button type="button" onClick={() => setReviewSession(session)} className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-500/20">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Review
                      </button>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-gray-400 sm:grid-cols-2">
                  <div><dt className="text-gray-500">Expected amount</dt><dd className="text-gray-200">{session.expected_amount} {session.asset_code}</dd></div>
                  <div><dt className="text-gray-500">Receiving address</dt><dd className="break-all font-mono">{session.receiving_address}</dd></div>
                  <div><dt className="text-gray-500">Transaction hash</dt><dd className="break-all font-mono">{session.transaction_hash || '—'}</dd></div>
                  <div><dt className="text-gray-500">Created / expires</dt><dd>{formatDateTime(session.created_at)} → {formatDateTime(session.expires_at)}</dd></div>
                  {session.submitted_at && <div><dt className="text-gray-500">Submitted</dt><dd>{formatDateTime(session.submitted_at)}</dd></div>}
                  {session.verified_at && <div><dt className="text-gray-500">Verified</dt><dd>{formatDateTime(session.verified_at)}</dd></div>}
                  {session.rejection_reason && <div className="sm:col-span-2"><dt className="text-gray-500">Rejection reason</dt><dd className="text-red-200">{session.rejection_reason}</dd></div>}
                </dl>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard title="Verification & audit history" description="Every state change with actor and timestamp.">
        {order.payment_events.length === 0 ? (
          <EmptyNote title="No payment events yet" />
        ) : (
          <AdminTable headers={['When', 'Event', 'Transition', 'Details']} caption="Payment event history">
            {order.payment_events.map((event) => (
              <tr key={event.id}>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{formatDateTime(event.created_at)}</td>
                <td className="px-3 py-2.5 text-gray-200">{event.event_type.replaceAll('_', ' ')}</td>
                <td className="px-3 py-2.5 text-gray-400">{event.from_status ?? '—'} → {event.to_status}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{event.details && Object.keys(event.details).length ? JSON.stringify(event.details) : '—'}</td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {reviewSession && (
        <ReviewDialog
          session={reviewSession}
          onClose={() => setReviewSession(null)}
          onDone={() => { setReviewSession(null); load(); }}
        />
      )}
      {showManualFulfill && (
        <ManualFulfillDialog
          order={{ ...order, manual_items: manualItems }}
          onClose={() => setShowManualFulfill(false)}
          onDone={() => { setShowManualFulfill(false); load(); }}
        />
      )}
    </div>
  );
};

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.listOrdersAdmin({ paymentStatus: statusFilter || null, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((result) => { setOrders(result.orders); setTotalCount(result.totalCount); })
      .catch((loadError) => setError(loadError.message || 'Orders could not be loaded.'))
      .finally(() => setLoading(false));
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <AdminCard
      title="Orders"
      description="All customer orders with payment and fulfillment state. Order snapshots are immutable."
      actions={(
        <select
          value={statusFilter}
          onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}
          className={selectClass}
          aria-label="Filter by payment status"
        >
          <option value="">All payment states</option>
          {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      )}
    >
      {loading ? <LoadingNote label="Loading orders…" /> : error ? <ErrorNote message={error} onRetry={load} /> : orders.length === 0 ? (
        <EmptyNote title="No orders yet" description={statusFilter ? 'No orders match this filter.' : 'Orders appear here when customers check out.'} />
      ) : (
        <>
          <AdminTable headers={['Order', 'Customer', 'Created', 'Total', 'Payment', 'Fulfillment']} caption="Orders">
            {orders.map((order) => (
              <tr key={order.id} className="transition hover:bg-white/[0.03]">
                <td className="px-3 py-2.5">
                  <Link to={`/admin/orders/${order.id}`} className="font-mono text-xs text-purple-200 underline-offset-4 transition hover:text-white hover:underline">{shortId(order.id)}</Link>
                </td>
                <td className="px-3 py-2.5 text-gray-300"><span className="block max-w-[220px] truncate">{order.contact_email}</span></td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{formatDateTime(order.created_at)}</td>
                <td className="px-3 py-2.5 text-white">{formatMoney(order.total_amount, order.currency_code)}</td>
                <td className="px-3 py-2.5"><StatusBadge value={order.payment_status} /></td>
                <td className="px-3 py-2.5"><StatusBadge value={order.fulfillment_status} /></td>
              </tr>
            ))}
          </AdminTable>
          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-400">
              <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className={subtleButtonClass}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
              </button>
              <span>Page {page + 1} of {pageCount}</span>
              <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)} className={subtleButtonClass}>
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </AdminCard>
  );
};

export default AdminOrders;
