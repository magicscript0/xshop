import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import CatalogBrowser from '../../components/store/CatalogBrowser';
import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';
import { catalogService } from '../../services/catalogService';

const CategoryDetails = () => {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    catalogService.getCategoryBySlug(slug)
      .then((record) => { if (active) setCategory(record); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Category could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return <StorePageShell eyebrow="XSHOP / CATEGORY" title="Loading category"><div role="status" className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-gray-300">Loading published category…</div></StorePageShell>;
  }

  if (error || !category) {
    return (
      <StorePageShell eyebrow="XSHOP / CATEGORY" title="Category unavailable">
        {error ? <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100">{error}</div> : (
          <StoreEmptyState title="This category is not published" description="The requested category is unavailable or has been archived." actionLabel="View categories" actionTo="/categories" />
        )}
      </StorePageShell>
    );
  }

  return (
    <StorePageShell eyebrow="XSHOP / CATEGORY" title={category.name} description={category.description || 'Browse current products in this published category.'}>
      <Link to="/categories" className="mb-5 inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All categories</Link>
      <CatalogBrowser
        mode="category"
        categorySlug={category.slug}
        emptyTitle="No products in this category yet"
        emptyDescription="Products appear when a legitimate digital good is configured, approved, and assigned to this category."
      />
    </StorePageShell>
  );
};

export default CategoryDetails;
