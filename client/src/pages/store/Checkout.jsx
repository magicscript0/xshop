import { useEffect, useState } from 'react';
import { ArrowRight, BadgePercent, Gift, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';
import useAuth from '../../hooks/useAuth';
import usePageMeta from '../../hooks/usePageMeta';
import { cartService } from '../../services/cartService';
import { customerService } from '../../services/customerService';
import { growthService } from '../../services/growthService';
import { formatMoney } from '../../lib/format';

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

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState('');

  const [rewards, setRewards] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState('');

  usePageMeta({ title: 'Checkout', noindex: true });

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
    growthService.getMyRewards()
      .then((data) => { if (active) setRewards(data); })
      .catch(() => { /* Rewards are optional at checkout; the order still works without them. */ });
    return () => { active = false; };
  }, [status]);

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const unavailable = items.some((item) => !item.available || item.unit_price == null);
  const canCreateOrder = items.length > 0 && !unavailable && !cart?.currency_mixed;

  const rewardsEnabled = Boolean(rewards?.enabled) && Number(rewards?.redeem_rate) > 0 && Number(rewards?.balance) > 0;
  const parsedPoints = Math.max(0, Math.trunc(Number(redeemPoints) || 0));
  const estimatedRewardDiscount = rewardsEnabled && parsedPoints > 0
    ? Math.floor((parsedPoints / Number(rewards.redeem_rate)) * 100) / 100
    : 0;
  const estimatedTotal = Math.max(
    0,
    Number(cart?.total ?? 0) - Number(appliedCoupon?.discount ?? 0) - estimatedRewardDiscount,
  );

  const applyCoupon = async (event) => {
    event.preventDefault();
    setCouponError('');
    if (!couponInput.trim()) return;
    setCouponBusy(true);
    try {
      const preview = await growthService.previewCoupon(couponInput.trim());
      setAppliedCoupon(preview);
      setCouponInput('');
    } catch (couponActionError) {
      setCouponError(couponActionError.message || 'This coupon could not be checked.');
    } finally {
      setCouponBusy(false);
    }
  };

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
    if (parsedPoints > 0 && rewards && parsedPoints > Number(rewards.balance)) {
      setError('You do not have that many reward points.');
      return;
    }
    const idempotencyKey = getCheckoutKey();
    if (!idempotencyKey) {
      setError('This browser could not create a secure retry key. Refresh the page and try again.');
      return;
    }

    setBusy(true);
    try {
      const created = await customerService.createOrderFromCart(email.trim(), idempotencyKey, {
        couponCode: appliedCoupon?.code ?? null,
        redeemPoints: rewardsEnabled ? parsedPoints : 0,
      });
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
      description="Supabase rechecks current catalog prices, coupons, reward points, and availability when the order is created. The browser never submits a total."
    >
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-400/[0.06] p-4 text-sm text-red-100">{error}</div>}
      {cart?.currency_mixed && <div role="alert" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100">All items in an order must use one currency. Return to the cart and separate items into distinct orders.</div>}
      {unavailable && <div role="alert" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100">One or more products are no longer available. Remove unavailable items from your cart before continuing.</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
        <div className="space-y-6">
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

          <section className="rounded-2xl border border-white/10 bg-gray-900/60 p-5 sm:p-7" aria-label="Discounts and rewards">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/10 text-purple-200"><BadgePercent className="h-4 w-4" aria-hidden="true" /></span>
              <div><h2 className="font-semibold text-white">Coupon</h2><p className="mt-1 text-xs text-gray-400">Validated by the database; final amounts are recalculated at order creation.</p></div>
            </div>
            {appliedCoupon ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100">
                <span><span className="font-mono font-semibold">{appliedCoupon.code}</span> — estimated −{formatMoney(appliedCoupon.discount, appliedCoupon.currency_code)}</span>
                <button type="button" onClick={() => setAppliedCoupon(null)} aria-label="Remove coupon" className="rounded-lg border border-emerald-300/25 p-1.5 transition hover:bg-emerald-400/10"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
            ) : (
              <form onSubmit={applyCoupon} className="mt-4 flex flex-wrap gap-2">
                <input
                  type="text" maxLength={40} value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                  placeholder="Coupon code" aria-label="Coupon code"
                  className="w-44 rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 font-mono text-sm uppercase text-white outline-none transition focus:border-purple-300/50"
                />
                <button type="submit" disabled={couponBusy || !couponInput.trim()} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {couponBusy ? 'Checking…' : 'Apply'}
                </button>
              </form>
            )}
            {couponError && <p role="alert" className="mt-2 text-xs text-red-200">{couponError}</p>}

            {rewardsEnabled && (
              <div className="mt-6 border-t border-white/[0.07] pt-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/10 text-purple-200"><Gift className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <h2 className="font-semibold text-white">Redeem points</h2>
                    <p className="mt-1 text-xs text-gray-400">Balance: {rewards.balance} points · {rewards.redeem_rate} points = 1.00 off. Crypto checkout requires a total above zero.</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    type="number" min="0" max={rewards.balance} step="1" value={redeemPoints}
                    onChange={(event) => setRedeemPoints(event.target.value)}
                    placeholder="0" aria-label="Points to redeem"
                    className="w-32 rounded-xl border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-white outline-none transition focus:border-purple-300/50"
                  />
                  {parsedPoints > 0 && <span className="text-xs text-gray-400">Estimated −{formatMoney(estimatedRewardDiscount, cart?.currency_code)}</span>}
                </div>
              </div>
            )}
          </section>
        </div>

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
              <div className="flex justify-between text-gray-400"><span>Catalog discounts</span><span>−{formatMoney(cart?.discount_total, cart?.currency_code)}</span></div>
              {appliedCoupon && <div className="flex justify-between text-emerald-200"><span>Coupon (est.)</span><span>−{formatMoney(appliedCoupon.discount, cart?.currency_code)}</span></div>}
              {estimatedRewardDiscount > 0 && <div className="flex justify-between text-emerald-200"><span>Points (est.)</span><span>−{formatMoney(estimatedRewardDiscount, cart?.currency_code)}</span></div>}
              <div className="flex justify-between border-t border-white/10 pt-3 text-base font-semibold text-white"><span>Estimated total</span><span>{formatMoney(estimatedTotal, cart?.currency_code)}</span></div>
              <p className="text-xs leading-relaxed text-gray-500">The final total is recalculated and locked by the database when the order is created.</p>
            </div>
          )}
        </aside>
      </div>
    </StorePageShell>
  );
};

export default Checkout;
