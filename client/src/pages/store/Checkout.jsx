import { useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';
import useAuth from '../../hooks/useAuth';
import { cartService } from '../../services/cartService';
import { customerService } from '../../services/customerService';

const formatMoney = (amount, currency) => {
  if (amount == null || !currency || !Number.isFinite(Number(amount))) return 'Unavailable';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
};

const getCheckoutKey = () => {
  const storageKey = 'xshop.checkout.idempotency-key';
  try {
    const current = window.sessionStorage.getItem(storageKey);
    if (current) return current;
    const next = window.crypto?.randomUUID?.();
    if (next) window.sessionStorage.setItem(storageKey, next);
    return next || null;
  } catch {
    return window.crypto?.randomUUID?.() || null;
  }
};

const Checkout = () => {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    let active = true;
    if (status === 'loading') return () => { active = false; };
    cartService.getMyCart()
      .then((data) => { if (active) setCart(data); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Your saved cart could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status]);

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const unavailable = items.some((item) => !item.available || item.unit_price == null);
  const canCreateOrder = items.length > 0 && !unavailable && !cart?.currency_mixed;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!canCreateOrder) {
      setError('Review your cart and ensure all items use one currency and are currently available.');
      return;
    }
    if (!email.trim()) {
      setError('Enter an email address for order updates and delivery.');
      return;
    }
    const idempotencyKey = getCheckoutKey();
    if (!idempotencyKey) {
      setError('This browser could not create a secure retry key. Refresh the page and try again.');
      return;
    }

    setBusy(true);
    try {
      const created = await customerService.createOrderFromCart(email.trim(), idempotencyKey);
      try { window.sessionStorage.removeItem('xshop.checkout.idempotency-key'); } catch { /* Storage is optional after a successful order. */ }
      navigate(`/account/orders/${created.order_id}`, { replace: true });
    } catch (actionError) {
      setError(actionError.message || 'Your order could not be created. Your cart has not been cleared.');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading' || loading) {
    return <StorePageShell eyebrow="XSHOP / CHECKOUT" title="Preparing checkout"><div role="status" className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-gray-300">Loading current cart and account…</div></StorePageShell>;
  }

  if (!items.length) {
    return (
      <StorePageShell eyebrow="XSHOP / CHECKOUT" title={error ? 'Checkout is unavailable' : 'Your cart is empty'}>
        {error ? <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div> : <StoreEmptyState title="There is nothing to check out" description="Add a published product to your saved cart before creating an order." actionLabel="Browse the shop" actionTo="/shop" />}
      </StorePageShell>
    );
  }

  return (
    <StorePageShell
      eyebrow="XSHOP / CHECKOUT"
      title="Review your order"
      description="Supabase rechecks current catalog prices, product eligibility, and currency when the order is created. The browser never submits a total."
    >
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-400/[0.06] p-4 text-sm text-red-100">{error}</div>}
      {cart?.currency_mixed && <div role="alert" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100">All items in an order must use one currency. Return to the cart and separate items into distinct orders.</div>}
      {unavailable && <div role="alert" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100">One or more products are no longer available. Remove unavailable items from your cart before continuing.</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-gray-900/60 p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/10 text-purple-200"><LockKeyhole className="h-4 w-4" aria-hidden="true" /></span>
            <div><h2 className="font-semibold text-white">Order contact</h2><p className="mt-1 text-xs text-gray-400">Used for order support and delivery notices.</p></div>
          </div>
          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-medium text-gray-200">Contact email</span>
            <input type="email" autoComplete="email" maxLength={320} required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-300/50" />
          </label>
          <div className="mt-5 flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-purple-200" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-gray-400">Creating an order does not submit payment. Available crypto methods are shown only when a payment method and receiving address have been configured in Supabase.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="submit" disabled={!canCreateOrder || busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Creating order…' : 'Create order'} {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
            <Link to="/cart" className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-gray-300 transition hover:border-white/20 hover:text-white">Back to cart</Link>
          </div>
        </form>

        <aside className="h-fit rounded-2xl border border-white/10 bg-gray-900/60 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Items</h2>
          <div className="mt-4 divide-y divide-white/[0.07]">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 py-3 text-sm">
                <div className="min-w-0"><p className="truncate text-gray-200">{item.name} <span className="text-gray-500">× {item.quantity}</span></p>{item.variant_name && <p className="mt-1 truncate text-xs text-gray-500">{item.variant_name}</p>}</div>
                <span className="shrink-0 text-gray-300">{formatMoney(item.line_total, item.currency_code)}</span>
              </div>
            ))}
          </div>
          {!cart?.currency_mixed && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{formatMoney(cart?.subtotal, cart?.currency_code)}</span></div>
              <div className="flex justify-between text-gray-400"><span>Discount</span><span>−{formatMoney(cart?.discount_total, cart?.currency_code)}</span></div>
              <div className="flex justify-between border-t border-white/10 pt-3 text-base font-semibold text-white"><span>Current total</span><span>{formatMoney(cart?.total, cart?.currency_code)}</span></div>
            </div>
          )}
        </aside>
      </div>
    </StorePageShell>
  );
};

export default Checkout;
