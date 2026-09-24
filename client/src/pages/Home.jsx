import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductGrid from '../components/store/ProductGrid';
import StoreHero from '../components/store/StoreHero';
import { catalogService } from '../services/catalogService';

const Home = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    catalogService.search({ limit: 4, sortBy: 'relevant' })
      .then((result) => { if (active) setProducts(result.products); })
      .catch((loadError) => { if (active) setError(loadError.message || 'The catalog could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <StoreHero />
      <section className="relative overflow-hidden bg-[#F6F6F6] px-4 py-20 text-black sm:px-8 lg:px-12 lg:py-28">
        <div className="pointer-events-none absolute -left-20 top-8 h-72 w-72 rounded-full bg-purple-300/20 blur-[100px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-blue-300/20 blur-[110px]" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-purple-700"><Sparkles className="h-4 w-4" aria-hidden="true" /> The XSHOP catalog</p>
              <h2 className="text-3xl font-bold leading-tight sm:text-5xl">Explore digital products</h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-600">Published product details, current prices, and availability are read from the Supabase catalog.</p>
            </div>
            <Link to="/shop" className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition hover:border-purple-400 hover:shadow-lg sm:self-auto">View all <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          {error ? (
            <div role="status" className="rounded-2xl border border-amber-300/50 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">{error}</div>
          ) : loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading catalog">{Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-gray-200" />)}</div>
          ) : (
            <ProductGrid products={products} emptyState={{ title: 'No products are published yet', description: 'Products appear after real catalog entries have been configured, rights-checked, and published.', actionLabel: 'Browse categories', actionTo: '/categories' }} />
          )}
        </div>
      </section>

      <section className="relative overflow-hidden bg-black px-4 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900/85 via-black to-purple-950/20 p-7 shadow-2xl shadow-purple-950/15 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">A considered storefront</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-4xl">Clear product details, server-calculated orders, and careful payment review.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-base">Configured crypto sessions expire after 60 minutes. A submitted transaction reference is never treated as proof; digital inventory is assigned only after a trusted payment review.</p>
          </div>
          <Link to="/support" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition hover:border-purple-300/40 hover:bg-white/10">Store information <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>
    </>
  );
};

export default Home;
