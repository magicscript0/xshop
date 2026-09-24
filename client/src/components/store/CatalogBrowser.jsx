import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import ProductGrid from './ProductGrid';
import { CATALOG_PAGE_SIZE, catalogService } from '../../services/catalogService';

const productTypes = [
  { value: '', label: 'All product types' },
  { value: 'digital_code', label: 'Digital codes' },
  { value: 'gift_card', label: 'Gift cards' },
  { value: 'voucher', label: 'Vouchers' },
  { value: 'software_license', label: 'Software licenses' },
  { value: 'other_digital', label: 'Other digital goods' },
];

const updateParam = (setSearchParams, key, value) => {
  setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (value === '' || value === null || value === undefined || value === false) next.delete(key);
    else next.set(key, String(value));
    next.delete('page');
    return next;
  });
};

const CatalogBrowser = ({
  mode = 'shop',
  categorySlug = null,
  emptyTitle = 'No published products',
  emptyDescription = 'There are no active product records for these filters. Products will appear when a real catalog entry has been published.',
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const query = searchParams.get('q') || '';
  const selectedCategory = categorySlug || searchParams.get('category') || '';
  const productType = searchParams.get('type') || '';
  const currencyCode = searchParams.get('currency') || '';
  const minPrice = searchParams.get('min') || '';
  const maxPrice = searchParams.get('max') || '';
  const sortBy = searchParams.get('sort') || 'relevant';
  const availableOnly = searchParams.get('available') === '1';
  const page = Math.max(0, Number.parseInt(searchParams.get('page') || '0', 10) || 0);
  const filterKey = `${mode}|${categorySlug || ''}|${searchString}`;
  const [draftQuery, setDraftQuery] = useState(query);
  const [categories, setCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersError, setFiltersError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setDraftQuery(query), [query]);

  useEffect(() => {
    let active = true;
    Promise.all([catalogService.listCategories(), catalogService.listCurrencies()])
      .then(([nextCategories, nextCurrencies]) => {
        if (!active) return;
        setCategories(nextCategories);
        setCurrencies(nextCurrencies);
        setFiltersError('');
      })
      .catch((loadError) => {
        if (active) setFiltersError(loadError.message || 'Catalog filters are temporarily unavailable.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    catalogService.search({
      searchTerm: query || null,
      categorySlug: selectedCategory || null,
      minPrice: minPrice || null,
      maxPrice: maxPrice || null,
      currencyCode: currencyCode || null,
      availableOnly,
      dealsOnly: mode === 'deals',
      productType: productType || null,
      sortBy,
      limit: CATALOG_PAGE_SIZE,
      offset: page * CATALOG_PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setProducts(result.products);
        setTotalCount(result.totalCount);
      })
      .catch((loadError) => {
        if (!active) return;
        setProducts([]);
        setTotalCount(0);
        setError(loadError.message || 'The catalog could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filterKey, query, selectedCategory, productType, currencyCode, minPrice, maxPrice, sortBy, availableOnly, mode, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / CATALOG_PAGE_SIZE)), [totalCount]);
  const isDeals = mode === 'deals';

  const handleSearch = (event) => {
    event.preventDefault();
    updateParam(setSearchParams, 'q', draftQuery.trim());
  };

  const setFilter = (key, value) => updateParam(setSearchParams, key, value);

  const handleCurrencyChange = (event) => {
    const next = event.target.value;
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next) params.set('currency', next);
      else params.delete('currency');
      params.delete('min');
      params.delete('max');
      params.delete('page');
      return params;
    });
  };

  const handlePriceChange = (key, value) => {
    if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;
    setFilter(key, value);
  };

  const clearFilters = () => {
    setSearchParams(query ? { q: query } : {});
  };

  return (
    <div>
      <div className="mb-7 rounded-2xl border border-white/10 bg-gray-900/55 p-4 shadow-xl shadow-purple-950/10 sm:p-5">
        {mode !== 'shop' && mode !== 'deals' && (
          <form onSubmit={handleSearch} className="mb-4 flex gap-2 rounded-xl border border-white/10 bg-black/35 p-1.5 focus-within:border-purple-300/40">
            <label htmlFor="catalog-search" className="sr-only">Search the catalog</label>
            <SearchIcon className="ml-3 h-5 w-5 self-center text-purple-300" aria-hidden="true" />
            <input
              id="catalog-search"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search products, types, or categories"
              className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-gray-500"
            />
            <button type="submit" className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">Search</button>
          </form>
        )}

        {mode === 'shop' && (
          <form onSubmit={handleSearch} className="mb-4 flex gap-2 rounded-xl border border-white/10 bg-black/35 p-1.5 focus-within:border-purple-300/40">
            <label htmlFor="shop-search" className="sr-only">Search the catalog</label>
            <SearchIcon className="ml-3 h-5 w-5 self-center text-purple-300" aria-hidden="true" />
            <input
              id="shop-search"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search products, types, or categories"
              className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-gray-500"
            />
            <button type="submit" className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">Search</button>
          </form>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            {isDeals ? <BadgePercent className="h-4 w-4 text-purple-300" aria-hidden="true" /> : <SlidersHorizontal className="h-4 w-4 text-purple-300" aria-hidden="true" />}
            <span>{loading ? 'Loading catalog…' : `${totalCount} ${totalCount === 1 ? 'product' : 'products'}`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="catalog-sort" className="sr-only">Sort products</label>
            <select id="catalog-sort" value={sortBy} onChange={(event) => setFilter('sort', event.target.value)} className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-purple-300/50">
              <option value="relevant">Recommended</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition hover:border-purple-300/30">
              Filters
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {!categorySlug && (
              <label className="block text-xs font-medium text-gray-400">
                Category
                <select value={selectedCategory} onChange={(event) => setFilter('category', event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-300/50">
                  <option value="">All categories</option>
                  {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
                </select>
              </label>
            )}
            <label className="block text-xs font-medium text-gray-400">
              Product type
              <select value={productType} onChange={(event) => setFilter('type', event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-300/50">
                {productTypes.map((type) => <option key={type.value || 'all'} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-400">
              Currency
              <select value={currencyCode} onChange={handleCurrencyChange} className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-300/50">
                <option value="">All currencies</option>
                {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-gray-400">
                Min price
                <input type="number" min="0" step="0.01" inputMode="decimal" disabled={!currencyCode} value={minPrice} onChange={(event) => handlePriceChange('min', event.target.value)} placeholder="0.00" className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-purple-300/50 disabled:opacity-40" />
              </label>
              <label className="block text-xs font-medium text-gray-400">
                Max price
                <input type="number" min="0" step="0.01" inputMode="decimal" disabled={!currencyCode} value={maxPrice} onChange={(event) => handlePriceChange('max', event.target.value)} placeholder="No limit" className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-purple-300/50 disabled:opacity-40" />
              </label>
            </div>
            {!isDeals && (
              <label className="flex items-center gap-3 self-end rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-sm text-gray-300 sm:col-span-2">
                <input type="checkbox" checked={availableOnly} onChange={(event) => setFilter('available', event.target.checked ? '1' : '')} className="h-4 w-4 accent-purple-400" />
                Available options only
              </label>
            )}
            <button type="button" onClick={clearFilters} className="self-end rounded-lg border border-white/10 px-3 py-3 text-sm text-gray-300 transition hover:border-white/20 hover:text-white">Clear filters</button>
          </div>
        )}
        {filtersError && <p className="mt-3 text-xs text-amber-200" role="status">{filtersError}</p>}
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-5 text-sm leading-relaxed text-amber-100">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading catalog" aria-busy="true">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.035]" />)}
        </div>
      ) : (
        <>
          <ProductGrid products={products} emptyState={{
            icon: isDeals ? BadgePercent : undefined,
            title: emptyTitle,
            description: emptyDescription,
            actionLabel: mode === 'search' ? 'Browse the shop' : undefined,
            actionTo: mode === 'search' ? '/shop' : undefined,
          }} />
          {totalPages > 1 && (
            <nav aria-label="Catalog pages" className="mt-8 flex items-center justify-center gap-3">
              <button type="button" disabled={page <= 0} onClick={() => setFilter('page', String(page - 1))} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white transition hover:border-purple-300/30 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
              <span className="text-sm text-gray-400">Page {page + 1} of {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setFilter('page', String(page + 1))} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white transition hover:border-purple-300/30 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
};

export default CatalogBrowser;
