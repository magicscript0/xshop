import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clipboard, Copy, ExternalLink, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import { customerService } from '../../services/customerService';

const formatMoney = (amount, currency) => {
  if (amount == null || !currency || !Number.isFinite(Number(amount))) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const formatCrypto = (amount, decimals, asset) => {
  const parts = String(amount ?? '').split('.');
  if (!parts[0] || !/^\d+$/.test(parts[0])) return `${amount} ${asset}`;
  const digits = Math.max(0, Number(decimals) || 0);
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (parts[1] || '').slice(0, digits).replace(/0+$/, '');
  return `${integer}${fraction ? `.${fraction}` : ''} ${asset}`;
};

const labels = {
  unpaid: 'Awaiting payment',
  pending: 'Payment session open',
  submitted: 'Awaiting payment review',
  verified: 'Payment verified',
  rejected: 'Payment rejected',
  expired: 'Payment session expired',
  not_eligible: 'Not yet eligible',
  eligible: 'Ready for fulfillment',
  processing: 'Processing fulfillment',
  fulfilled: 'Fulfilled',
  manual_required: 'Manual fulfillment in progress',
  failed: 'Fulfillment needs attention',
  cancelled: 'Cancelled',
};

const statusClass = (status) => {
  if (['verified', 'fulfilled'].includes(status)) return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100';
  if (['rejected', 'expired', 'failed', 'cancelled'].includes(status)) return 'border-amber-300/20 bg-amber-400/10 text-amber-100';
  return 'border-purple-300/20 bg-purple-400/10 text-purple-100';
};

const payloadText = (payload) => typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

const OrderDetails = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [methods, setMethods] = useState([]);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    customerService.getOrderDetails(id)
      .then(async (record) => {
        if (!active) return;
        setOrder(record);
        if (!record) {
          setMethods([]);
          return;
        }
        const hasActiveSession = record.payment_sessions.some((session) => ['pending', 'submitted'].includes(session.status));
        if (!hasActiveSession && ['unpaid', 'rejected', 'expired'].includes(record.payment_status)) {
          const activeMethods = await customerService.listPaymentMethods(record.currency_code);
          if (active) {
            setMethods(activeMethods);
            setSelectedMethodId((current) => current && activeMethods.some((method) => method.id === current) ? current : activeMethods[0]?.id || '');
          }
        } else if (active) {
          setMethods([]);
          setSelectedMethodId('');
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'This order could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reloadToken]);

  const activeSession = useMemo(
    () => order?.payment_sessions?.find((session) => ['pending', 'submitted'].includes(session.status)) ?? null,
    [order],
  );
  const eligibleForPayment = order && ['unpaid', 'rejected', 'expired'].includes(order.payment_status) && !activeSession;

  const reload = () => setReloadToken((token) => token + 1);

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}. Select it and copy manually.`);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedMethodId) return;
    setBusy('session');
    setError('');
    try {
      await customerService.createPaymentSession(order.id, selectedMethodId);
      toast.success('Your 60-minute payment session is ready.');
      reload();
    } catch (actionError) {
      setError(actionError.message || 'A payment session could not be created.');
    } finally {
      setBusy('');
    }
  };

  const handleSubmitHash = async (event) => {
    event.preventDefault();
    setError('');
    const normalized = transactionHash.trim().replace(/^0x/i, '');
    if (!/^[a-f\d]{64}$/i.test(normalized)) {
      setError('Enter a 64-character transaction hash. A hash submission is not proof of payment.');
      return;
    }
    setBusy('hash');
    try {
      const result = await customerService.submitPaymentTransaction(activeSession.id, transactionHash.trim());
      if (result?.status === 'submitted') {
        setTransactionHash('');
        toast.success('Transaction reference submitted for manual review.');
      } else if (result?.status === 'expired') {
        toast.error('This payment session expired before the transaction reference was submitted.');
      } else {
        toast(result?.status ? `Current session status: ${result.status}.` : 'Payment status updated.');
      }
      reload();
    } catch (actionError) {
      setError(actionError.message || 'The transaction reference could not be submitted.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return <div role="status" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-gray-300"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading account-owned order details…</div>;
  }

  if (error && !order) {
    return <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div>;
  }

  if (!order) {
    return <StoreEmptyState title="This order is unavailable" description="The order may not exist or may not belong to the signed-in account." actionLabel="View your orders" actionTo="/account/orders" />;
  }

  const deliveriesVisible = order.fulfillment_status === 'fulfilled';

  return (
    <div>
      <div className="mb-5 text-xs text-gray-500">Placed {formatDate(order.created_at)} · Order <span className="font-mono break-all">{order.id}</span></div>
      <Link to="/account/orders" className="mb-5 inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> My orders</Link>
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-400/[0.06] p-4 text-sm text-red-100">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-gray-900/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Purchased items</h2>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(order.payment_status)}`}>{labels[order.payment_status] || order.payment_status}</span>
            </div>
            <div className="mt-4 divide-y divide-white/[0.07]">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{item.product_name_snapshot}</p>
                    {item.variant_name_snapshot && <p className="mt-1 text-sm text-gray-400">{item.variant_name_snapshot}</p>}
                    <p className="mt-1 text-xs text-gray-500">Quantity {item.quantity}{item.sku_snapshot ? ` · ${item.sku_snapshot}` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-white">{formatMoney(item.line_total_amount, item.currency_code)}</p>
                    {Number(item.unit_discount_amount) > 0 && <p className="mt-1 text-xs text-gray-500">Discount {formatMoney(Number(item.unit_discount_amount) * item.quantity, item.currency_code)}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{formatMoney(order.subtotal_amount, order.currency_code)}</span></div>
              <div className="flex justify-between text-gray-400"><span>Discount</span><span>−{formatMoney(order.discount_amount, order.currency_code)}</span></div>
              <div className="flex justify-between pt-2 text-base font-semibold text-white"><span>Order total</span><span>{formatMoney(order.total_amount, order.currency_code)}</span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-gray-900/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Digital delivery</h2>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(order.fulfillment_status)}`}>{labels[order.fulfillment_status] || order.fulfillment_status}</span>
            </div>
            {deliveriesVisible && order.fulfillment_items.length ? (
              <div className="mt-4 space-y-3">
                {order.fulfillment_items.map((item) => {
                  const relatedOrderItem = order.items.find((line) => line.id === item.order_item_id);
                  const value = payloadText(item.delivery_payload);
                  return (
                    <article key={item.id} className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.045] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{relatedOrderItem?.product_name_snapshot || 'Digital item'}{relatedOrderItem?.quantity > 1 ? ` · ${item.delivery_index}` : ''}</p>
                        <button type="button" onClick={() => copyText(value, 'Delivery')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-gray-200 transition hover:border-emerald-200/30"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy</button>
                      </div>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/45 p-3 font-mono text-sm leading-relaxed text-emerald-100">{value}</pre>
                    </article>
                  );
                })}
              </div>
            ) : order.fulfillment_status === 'manual_required' ? (
              <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-4 text-sm leading-relaxed text-amber-100">Payment is verified. This order includes a fulfillment step that requires trusted manual completion. Delivery information will appear here only when fulfillment is complete.</div>
            ) : order.fulfillment_status === 'failed' ? (
              <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-4 text-sm leading-relaxed text-amber-100">Payment was verified, but the fulfillment process needs attention. Contact support with the order ID above; delivery content is not exposed in this state.</div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-gray-400">Digital delivery is not available until Supabase records a verified payment and successful fulfillment. A transaction hash alone does not unlock delivery.</p>
            )}
          </section>

          {order.payment_sessions.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-gray-900/45 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Payment history</h2>
              <div className="mt-4 space-y-3">
                {order.payment_sessions.map((session) => (
                  <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-4 text-sm">
                    <div>
                      <p className="font-medium text-white">{session.asset_code} · {session.network_code}</p>
                      <p className="mt-1 text-xs text-gray-500">Created {formatDate(session.created_at)}{session.transaction_hash ? ` · Hash ${session.transaction_hash.slice(0, 10)}…` : ''}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(session.status)}`}>{labels[session.status] || session.status}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="h-fit space-y-5">
          {activeSession ? (
            <section className="rounded-2xl border border-purple-300/20 bg-gradient-to-br from-purple-950/40 to-gray-950/80 p-5 sm:p-6">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-400/10 text-purple-100"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold text-white">{activeSession.status === 'submitted' ? 'Awaiting manual review' : 'Payment instructions'}</h2><p className="mt-1 text-xs text-gray-400">{activeSession.asset_code} on {activeSession.network_code}</p></div></div>
              {activeSession.status === 'pending' ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">Send exactly</p>
                    <p className="mt-2 break-all font-mono text-lg font-semibold text-white">{formatCrypto(activeSession.expected_amount, activeSession.asset_decimals, activeSession.asset_code)}</p>
                    <p className="mt-1 text-xs text-gray-500">Order total {formatMoney(order.total_amount, order.currency_code)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">Receiving address</p>
                    <p className="mt-2 break-all font-mono text-sm leading-relaxed text-purple-100">{activeSession.receiving_address}</p>
                    <button type="button" onClick={() => copyText(activeSession.receiving_address, 'Address')} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white transition hover:border-purple-200/30"><Clipboard className="h-3.5 w-3.5" aria-hidden="true" /> Copy address</button>
                  </div>
                  <p className="text-xs leading-relaxed text-amber-100">Network and address must match. The server expires this session at {formatDate(activeSession.expires_at)} (60 minutes after creation). Only send after independently confirming the asset and network.</p>
                  <form onSubmit={handleSubmitHash} className="space-y-3 border-t border-white/10 pt-4">
                    <label className="block"><span className="mb-2 block text-sm font-medium text-gray-200">Transaction hash</span><input type="text" autoComplete="off" spellCheck="false" maxLength={66} value={transactionHash} onChange={(event) => setTransactionHash(event.target.value)} placeholder="64-character transaction hash" className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 font-mono text-xs text-white outline-none focus:border-purple-300/50" /></label>
                    <button type="submit" disabled={busy === 'hash' || !transactionHash.trim()} className="w-full rounded-xl border border-purple-300/25 bg-purple-500/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-50">{busy === 'hash' ? 'Submitting…' : 'Submit for manual review'}</button>
                  </form>
                </div>
              ) : (
                <>
                  <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-4 text-sm leading-relaxed text-amber-100">The submitted transaction hash is a reference only. It has not been treated as proof of payment. A trusted reviewer must verify the transaction on the correct network before fulfillment.</div>
                  <button type="button" onClick={reload} className="mt-4 w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-200 transition hover:border-purple-200/25 hover:text-white">Refresh payment status</button>
                </>
              )}
            </section>
          ) : eligibleForPayment ? (
            <section className="rounded-2xl border border-white/10 bg-gray-900/60 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Configured payment methods</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">Available assets, networks, rates, and receiving addresses are loaded from active Supabase configuration. No address is hard-coded in the app.</p>
              {methods.length ? (
                <>
                  <label className="mt-5 block"><span className="mb-2 block text-sm font-medium text-gray-200">Choose a method</span><select value={selectedMethodId} onChange={(event) => setSelectedMethodId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-3 text-sm text-white outline-none focus:border-purple-300/50">{methods.map((method) => <option key={method.id} value={method.id}>{method.display_name} · {method.asset_code} · {method.network_code}</option>)}</select></label>
                  <button type="button" onClick={handleCreateSession} disabled={!selectedMethodId || busy === 'session'} className="mt-4 w-full rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{busy === 'session' ? 'Preparing session…' : 'Create 60-minute payment session'}</button>
                </>
              ) : (
                <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-4 text-sm leading-relaxed text-amber-100">No payment method is configured for {order.currency_code}. Checkout is unavailable until an authorized operator enables a supported asset and network.</div>
              )}
            </section>
          ) : (
            <section className="rounded-2xl border border-white/10 bg-gray-900/50 p-5 sm:p-6">
              <h2 className="font-semibold text-white">Payment status</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{order.payment_status === 'verified' ? 'Payment was manually verified in the database. Fulfillment follows its separately recorded state.' : `Current status: ${labels[order.payment_status] || order.payment_status}.`}</p>
            </section>
          )}

          {order.payment_status === 'verified' && order.fulfillment_status === 'fulfilled' && (
            <div className="flex gap-3 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.05] p-4 text-xs leading-relaxed text-emerald-100"><Check className="h-4 w-4 shrink-0" aria-hidden="true" />Your verified order has been fulfilled. Delivery is available in your account above.</div>
          )}
          <Link to="/support" className="inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white">Need help with this order? <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </aside>
      </div>
    </div>
  );
};

export default OrderDetails;
