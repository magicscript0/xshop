import { useEffect, useState } from 'react';
import { ArrowRight, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';
import { catalogService } from '../../services/catalogService';

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    catalogService.listCategories()
      .then((rows) => { if (active) setCategories(rows); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Categories could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <StorePageShell
      eyebrow="XSHOP / DISCOVER"
      title="Categories"
      description="Browse the public categories configured by XSHOP. Only active, published catalog records appear here."
    >
      {error ? (
        <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading categories">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.035]" />)}
        </div>
      ) : categories.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link key={category.id} to={`/categories/${category.slug}`} className="group rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900/80 to-black/80 p-6 transition hover:-translate-y-0.5 hover:border-purple-300/35 hover:shadow-xl hover:shadow-purple-950/15">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/10 text-purple-200"><Layers3 className="h-5 w-5" aria-hidden="true" /></span>
                <ArrowRight className="h-4 w-4 text-gray-500 transition group-hover:translate-x-1 group-hover:text-purple-200" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-white">{category.name}</h2>
              {category.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-400">{category.description}</p>}
            </Link>
          ))}
        </div>
      ) : (
        <StoreEmptyState
          icon={Layers3}
          title="No categories are published"
          description="Categories will appear here after they are configured and published in the XSHOP catalog."
          actionLabel="Browse the shop"
          actionTo="/shop"
        />
      )}
    </StorePageShell>
  );
};

export default Categories;
