import { useEffect, useState } from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';
import useAuth from '../../hooks/useAuth';
import { cartService } from '../../services/cartService';
import { isSupabaseConfigured } from '../../lib/supabase/client';

const formatMoney = (amount, currency) => {
  if (amount == null || !currency || !Number.isFinite(Number(amount))) return 'Unavailable';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
};

const Cart = () => {
  const { status } = useAuth();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyItem, setBusyItem] = useState('');

  useEffect(() => {
    let active = true;
    if (status === 'loading') return () => { active = false; };
    if (status !== 'authenticated') {
      setCart(null);
      setError('');
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    cartService.getMyCart()
      .then((data) => { if (active) setCart(data); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Your cart could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status]);

  const runItemAction = async (item, action, quantity) => {
    setBusyItem(item.id);
    setError('');
    try {
      const nextCart = action === 'remove'
        ? await cartService.removeItem(item.id)
        : await cartService.updateItem(item.id, quantity);
      setCart(nextCart);
    } catch (actionError) {
      const message = actionError.message || 'Your cart could not be updated.';
      setError(message);
      toast.error(message);
    } finally {
      setBusyItem('');
    }
  };

  if (status === 'loading' || loading) {
    return <StorePageShell eyebrow="XSHOP / CART" title="Your cart"><div role="status" className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-gray-300">Loading your saved cart…</div></StorePageShell>;
  }

  if (status !== 'authenticated') {
    return (
      <StorePageShell eyebrow="XSHOP / CART" title="Your cart" description="Your XSHOP cart is saved to your account so prices and availability can be checked securely.">
        <StoreEmptyState
          icon={ShoppingBag}
          title="Sign in to use your saved cart"
          description="Customer carts are persistent and account-owned. Sign in to add products and continue with live catalog pricing."
          actionLabel="Sign in"
          actionTo="/login"
        />
      </StorePageShell>
    );
  }

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const hasUnavailable = items.some((item) => !item.available || item.unit_price == null);
  const canCheckout = isSupabaseConfigured && items.length > 0 && !cart?.currency_mixed && !hasUnavailable;

  return (
    <StorePageShell eyebrow="XSHOP / CART" title="Your cart" description="Prices and inventory are recalculated by Supabase at checkout. The displayed totals are a current quote, not a locked payment amount.">
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-400/[0.06] p-4 text-sm text-red-100">{error}</div>}
      {!items.length ? (
        <StoreEmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add a published product to keep it here across sessions. No products or prices are invented for the cart."
          actionLabel="Browse the shop"
          actionTo="/shop"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section aria-label="Cart items" className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className={`rounded-2xl border bg-gray-900/60 p-4 sm:p-5 ${item.available ? 'border-white/10' : 'border-amber-300/20'}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link to={item.slug ? `/products/${item.slug}` : '/shop'} className="font-semibold text-white transition hover:text-purple-200">{item.name || 'Catalog item'}</Link>
                    {item.variant_name && <p className="mt-1 text-sm text-gray-400">{item.variant_name}</p>}
                    <p className="mt-2 text-xs text-gray-500">Unit price: {formatMoney(item.unit_price, item.currency_code)}</p>
                    {!item.available && <p className="mt-2 text-xs text-amber-200">This item is currently unavailable. Remove it or wait for stock before checkout.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="flex items-center rounded-lg border border-white/10 bg-black/25">
                      <button type="button" aria-label={`Decrease quantity of ${item.name}`} disabled={busyItem === item.id || item.quantity <= 1} onClick={() => runItemAction(item, 'update', item.quantity - 1)} className="p-2.5 text-gray-300 transition hover:text-white disabled:opacity-40"><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      <span className="min-w-8 text-center text-sm text-white">{item.quantity}</span>
                      <button type="button" aria-label={`Increase quantity of ${item.name}`} disabled={busyItem === item.id || item.quantity >= 20} onClick={() => runItemAction(item, 'update', item.quantity + 1)} className="p-2.5 text-gray-300 transition hover:text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    </div>
                    <p className="min-w-24 text-right text-sm font-semibold text-white">{formatMoney(item.line_total, item.currency_code)}</p>
                    <button type="button" aria-label={`Remove ${item.name} from cart`} disabled={busyItem === item.id} onClick={() => runItemAction(item, 'remove')} className="rounded-lg border border-white/10 p-2.5 text-gray-400 transition hover:border-red-300/25 hover:bg-red-500/10 hover:text-red-100 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit rounded-2xl border border-white/10 bg-gray-900/65 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Order summary</h2>
            {cart.currency_mixed ? (
              <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-sm leading-relaxed text-amber-100">Your cart contains more than one currency. Create separate orders by removing items until one currency remains.</div>
            ) : (
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4 text-gray-400"><span>Subtotal</span><span>{formatMoney(cart.subtotal, cart.currency_code)}</span></div>
                <div className="flex justify-between gap-4 text-gray-400"><span>Catalog discounts</span><span>−{formatMoney(cart.discount_total, cart.currency_code)}</span></div>
                <div className="flex justify-between gap-4 border-t border-white/10 pt-4 text-base font-semibold text-white"><span>Current total</span><span>{formatMoney(cart.total, cart.currency_code)}</span></div>
              </div>
            )}
            <Link to="/checkout" aria-disabled={!canCheckout} onClick={(event) => { if (!canCheckout) event.preventDefault(); }} className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 ${canCheckout ? '' : 'pointer-events-none opacity-40'}`}>
              Continue to checkout <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {hasUnavailable && <p className="mt-3 text-xs leading-relaxed text-amber-200">Unavailable items must be removed before continuing.</p>}
            <Link to="/shop" className="mt-4 block text-center text-xs text-gray-400 transition hover:text-white">Continue browsing</Link>
          </aside>
        </div>
      )}
    </StorePageShell>
  );
};

export default Cart;
