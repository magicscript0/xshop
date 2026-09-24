import { useEffect, useState } from 'react';
import { ArrowRight, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import { customerService } from '../../services/customerService';

const labels = {
  unpaid: 'Awaiting payment', pending: 'Payment session open', submitted: 'Awaiting payment review', verified: 'Payment verified',
  rejected: 'Payment rejected', expired: 'Payment session expired', not_eligible: 'Not yet eligible', eligible: 'Ready for fulfillment',
  processing: 'Processing fulfillment', fulfilled: 'Fulfilled', manual_required: 'Manual fulfillment in progress', failed: 'Fulfillment needs attention', cancelled: 'Cancelled',
};

const formatMoney = (amount, currency) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount)); }
  catch { return `${amount} ${currency}`; }
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
};

const AccountOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    customerService.listOrders()
      .then((rows) => { if (active) setOrders(rows); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Orders could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div role="status" className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-gray-300">Loading your order history…</div>;
  if (error) return <div role="alert" className="rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div>;
  if (!orders.length) {
    return <StoreEmptyState icon={PackageCheck} title="No orders yet" description="Orders created by your account will appear here with their payment and fulfillment status." actionLabel="Browse the shop" actionTo="/shop" />;
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Link key={order.id} to={`/account/orders/${order.id}`} className="group block rounded-xl border border-white/10 bg-black/25 p-4 transition hover:border-purple-300/30 hover:bg-white/[0.035] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">Order placed {formatDate(order.created_at)}</p>
              <p className="mt-1 break-all font-mono text-xs text-gray-400">{order.id}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-purple-300/20 bg-purple-400/10 px-2.5 py-1 text-xs text-purple-100">{labels[order.payment_status] || order.payment_status}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-gray-300">{labels[order.fulfillment_status] || order.fulfillment_status}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="font-semibold text-white">{formatMoney(order.total_amount, order.currency_code)}</span>
              <ArrowRight className="h-4 w-4 text-gray-500 transition group-hover:translate-x-1 group-hover:text-purple-200" aria-hidden="true" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default AccountOrders;
