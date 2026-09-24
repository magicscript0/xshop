import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Heart, ImageOff, PackageCheck, ShoppingBag, ShieldCheck, Tag } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';
import useAuth from '../../hooks/useAuth';
import { catalogService } from '../../services/catalogService';
import { cartService } from '../../services/cartService';
import { customerService } from '../../services/customerService';

const formatMoney = (amount, currency) => {
  if (amount == null || !currency || !Number.isFinite(Number(amount))) return 'Price unavailable';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
};

const EMPTY_PRICE_OPTIONS = [];

const getProductType = (type) => ({
  digital_code: 'Digital code',
  gift_card: 'Gift card',
  voucher: 'Voucher',
  software_license: 'Software license',
  other_digital: 'Digital product',
}[type] || 'Digital product');

const ProductDetails = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { status } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPriceId, setSelectedPriceId] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    catalogService.getProductBySlug(slug)
      .then((record) => {
        if (!active) return;
        setProduct(record);
        setSelectedPriceId(record?.price_options?.[0]?.price_id || '');
        setSelectedImage(0);
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Product information could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const options = product?.price_options ?? EMPTY_PRICE_OPTIONS;
  const selectedOption = useMemo(
    () => options.find((option) => option.price_id === selectedPriceId) ?? options[0] ?? null,
    [options, selectedPriceId],
  );
  const images = product?.media?.filter((item) => item.url) ?? [];
  const currentImage = images[selectedImage] ?? images[0] ?? null;

  const handleAddToCart = async () => {
    if (status !== 'authenticated') {
      navigate('/login', { state: { from: `/products/${slug}` } });
      return;
    }
    if (!selectedOption?.available) return;
    setBusy('cart');
    try {
      await cartService.addItem(product.id, selectedOption.variant_id, Number(quantity));
      toast.success('Added to your saved cart.');
    } catch (actionError) {
      toast.error(actionError.message || 'This product could not be added to your cart.');
    } finally {
      setBusy('');
    }
  };

  const handleSave = async () => {
    if (status !== 'authenticated') {
      navigate('/login', { state: { from: `/products/${slug}` } });
      return;
    }
    setBusy('wishlist');
    try {
      await customerService.addToWishlist(product.id);
      toast.success('Saved to your wishlist.');
    } catch (actionError) {
      toast.error(actionError.message || 'This product could not be saved.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return <StorePageShell eyebrow="XSHOP / PRODUCT" title="Loading product"><div role="status" className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-gray-300">Loading current catalog details…</div></StorePageShell>;
  }

  if (error) {
    return <StorePageShell eyebrow="XSHOP / PRODUCT" title="Product unavailable"><div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div></StorePageShell>;
  }

  if (!product) {
    return (
      <StorePageShell eyebrow="XSHOP / PRODUCT" title="Product not found">
        <StoreEmptyState
          icon={ImageOff}
          title="This product is not published"
          description="The requested listing is unavailable or has been removed from the public catalog."
          actionLabel="Return to the shop"
          actionTo="/shop"
        />
      </StorePageShell>
    );
  }

  const selectedPrice = Number(selectedOption?.price);
  const originalPrice = Number(selectedOption?.original_price);
  const hasDeal = Boolean(selectedOption?.on_deal && originalPrice > selectedPrice);
  const selectedAvailable = Boolean(selectedOption?.available);

  return (
    <StorePageShell eyebrow={`XSHOP / ${getProductType(product.product_type).toUpperCase()}`} title={product.name} description={product.short_description || undefined}>
      <Link to="/shop" className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the catalog</Link>
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section aria-label="Product images" className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900 via-[#101019] to-purple-950/30">
            {currentImage ? (
              <img src={currentImage.url} alt={currentImage.alt_text || product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-purple-200/70"><ImageOff className="h-9 w-9" aria-hidden="true" /><span className="text-xs uppercase tracking-[0.18em]">No product image</span></div>
            )}
            {hasDeal && <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-950/85 px-3 py-1.5 text-xs font-semibold text-emerald-100"><Tag className="h-3.5 w-3.5" aria-hidden="true" /> Active deal</span>}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose product image">
              {images.map((image, index) => (
                <button key={image.id} type="button" onClick={() => setSelectedImage(index)} aria-label={`Show product image ${index + 1}`} aria-pressed={selectedImage === index} className={`h-20 w-24 shrink-0 overflow-hidden rounded-xl border ${selectedImage === index ? 'border-purple-300/70' : 'border-white/10'}`}>
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900/80 to-black/80 p-5 shadow-2xl shadow-purple-950/10 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-purple-300/20 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-100">{getProductType(product.product_type)}</span>
            {product.categories?.map((category) => <Link key={category.id} to={`/categories/${category.slug}`} className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">{category.name}</Link>)}
          </div>

          {product.description && <div className="mt-5 whitespace-pre-line text-sm leading-relaxed text-gray-300">{product.description}</div>}

          {options.length > 1 && (
            <label className="mt-7 block">
              <span className="mb-2 block text-sm font-medium text-gray-200">Choose an option</span>
              <select value={selectedPriceId} onChange={(event) => setSelectedPriceId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-purple-300/50">
                {options.map((option) => {
                  const label = option.variant_name || (option.denomination_value ? `${option.denomination_value} denomination` : 'Standard option');
                  return <option key={option.price_id} value={option.price_id}>{label}{option.available ? '' : ' — unavailable'}</option>;
                })}
              </select>
            </label>
          )}

          <div className="mt-7 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className={`text-3xl font-bold ${hasDeal ? 'text-emerald-100' : 'text-white'}`}>{formatMoney(selectedOption?.price, product.currency_code)}</p>
              {hasDeal && <p className="text-sm text-gray-500 line-through">{formatMoney(selectedOption?.original_price, product.currency_code)}</p>}
              {hasDeal && <span className="rounded-full border border-emerald-200/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">Deal</span>}
            </div>
            {selectedOption?.variant_name && <p className="mt-2 text-sm text-gray-400">Selected option: {selectedOption.variant_name}</p>}
            <p className={`mt-3 flex items-center gap-2 text-sm ${selectedAvailable ? 'text-emerald-200' : 'text-amber-200'}`}>
              {selectedAvailable ? <Check className="h-4 w-4" aria-hidden="true" /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}
              {selectedAvailable ? 'Available for purchase' : 'This option is currently unavailable'}
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="product-quantity">Quantity</label>
              <input id="product-quantity" type="number" min="1" max="20" step="1" value={quantity} onChange={(event) => setQuantity(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-center text-sm text-white outline-none focus:border-purple-300/50 sm:w-24" />
              <button type="button" onClick={handleAddToCart} disabled={!selectedAvailable || Boolean(busy) || status === 'loading'} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                <ShoppingBag className="h-4 w-4" aria-hidden="true" /> {busy === 'cart' ? 'Adding…' : 'Add to cart'}
              </button>
              <button type="button" onClick={handleSave} disabled={Boolean(busy) || status === 'loading'} aria-label="Save to wishlist" title="Save to wishlist" className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white transition hover:border-rose-300/30 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                <Heart className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {status !== 'authenticated' && <p className="mt-3 text-xs leading-relaxed text-gray-500">Sign in to save this option to your persistent cart and wishlist.</p>}
          </div>

          <div className="mt-6 flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-purple-200" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-gray-400">Product availability and current prices are read from the catalog. Final order totals are recalculated by Supabase when you check out.</p>
          </div>
        </section>
      </div>
    </StorePageShell>
  );
};

export default ProductDetails;
