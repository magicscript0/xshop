import { useEffect, useState } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import ProductCard from '../../components/store/ProductCard';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import { customerService } from '../../services/customerService';

const AccountWishlist = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyProduct, setBusyProduct] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    customerService.listWishlist()
      .then((rows) => { if (active) setItems(rows); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Your wishlist could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const removeItem = async (productId) => {
    setBusyProduct(productId);
    setError('');
    try {
      await customerService.removeFromWishlist(productId);
      setItems((current) => current.filter((item) => item.product_id !== productId));
      toast.success('Removed from your wishlist.');
    } catch (actionError) {
      setError(actionError.message || 'This product could not be removed.');
    } finally {
      setBusyProduct('');
    }
  };

  if (loading) return <div role="status" className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-gray-300">Loading your wishlist…</div>;
  if (error && !items.length) return <div role="alert" className="rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div>;
  if (!items.length) return <StoreEmptyState icon={Heart} title="Your wishlist is empty" description="Save a published product to find it here later." actionLabel="Browse the shop" actionTo="/shop" />;

  return (
    <div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-300/20 bg-red-400/[0.06] p-3 text-sm text-red-100">{error}</div>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10]">
            <ProductCard product={item.product} />
            <div className="border-t border-white/[0.07] p-3">
              <button type="button" onClick={() => removeItem(item.product_id)} disabled={busyProduct === item.product_id} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:border-red-300/25 hover:bg-red-500/10 hover:text-red-100 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {busyProduct === item.product_id ? 'Removing…' : 'Remove from wishlist'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AccountWishlist;
