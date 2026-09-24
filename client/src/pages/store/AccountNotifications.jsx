import { useEffect, useState } from 'react';
import { Bell, Check, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import { customerService } from '../../services/customerService';

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const AccountNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let active = true;
    customerService.listNotifications()
      .then((rows) => { if (active) setNotifications(rows); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Your notifications could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const markRead = async (id) => {
    setBusyId(id);
    try {
      await customerService.markNotificationRead(id);
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: item.read_at || new Date().toISOString() } : item));
    } catch (actionError) {
      toast.error(actionError.message || 'This notification could not be updated.');
    } finally {
      setBusyId('');
    }
  };

  if (loading) return <div role="status" className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-gray-300">Loading your notifications…</div>;
  if (error) return <div role="alert" className="rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div>;
  if (!notifications.length) return <StoreEmptyState icon={Bell} title="No notifications yet" description="Private account and order updates will appear here when there is activity to report." actionLabel="View your orders" actionTo="/account/orders" />;

  return (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <article key={notification.id} className={`rounded-xl border p-4 ${notification.read_at ? 'border-white/[0.08] bg-black/20' : 'border-purple-300/20 bg-purple-500/[0.06]'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-purple-200"><Bell className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium text-white">{notification.title}</h2>{!notification.read_at && <span className="rounded-full bg-purple-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">New</span>}</div>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-400">{notification.message}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500"><Clock3 className="h-3 w-3" aria-hidden="true" />{formatDate(notification.created_at)}</p>
                {notification.related_order_id && <Link to={`/account/orders/${notification.related_order_id}`} className="mt-3 inline-flex text-xs font-medium text-purple-200 transition hover:text-white">View related order</Link>}
              </div>
            </div>
            {!notification.read_at && (
              <button type="button" onClick={() => markRead(notification.id)} disabled={busyId === notification.id} aria-label="Mark notification as read" className="shrink-0 rounded-lg border border-white/10 p-2 text-gray-300 transition hover:border-purple-200/30 hover:text-white disabled:opacity-50">
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
};

export default AccountNotifications;
