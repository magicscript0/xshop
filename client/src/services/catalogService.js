import { isSupabaseConfigured, supabase } from '../lib/supabase/client';

const CATALOG_PAGE_SIZE = 24;

const requireStore = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('The XSHOP catalog is not connected in this environment. Configure Supabase to load live products.');
  }
  return supabase;
};

const getPublicMediaUrl = (mediaItem) => {
  if (!mediaItem?.object_path || !mediaItem?.bucket_id) return null;
  const client = supabase;
  if (!client) return null;
  return client.storage.from(mediaItem.bucket_id).getPublicUrl(mediaItem.object_path).data?.publicUrl ?? null;
};

const normalizeProduct = (row) => {
  const media = Array.isArray(row.media) ? row.media : [];
  const categories = Array.isArray(row.categories) ? row.categories : [];
  const priceOptions = Array.isArray(row.price_options) ? row.price_options : [];
  const mappedMedia = media.map((item) => ({ ...item, url: getPublicMediaUrl(item) }));
  const category = categories[0] ?? null;

  return {
    ...row,
    id: row.product_id ?? row.id,
    currency: row.currency_code,
    category_name: category?.name ?? null,
    categories,
    media: mappedMedia,
    thumbnail: mappedMedia.find((item) => item.url)?.url ?? null,
    price_options: priceOptions,
    variants: priceOptions.map((option) => ({
      id: option.variant_id,
      price_id: option.price_id,
      variant_name: option.variant_name,
      sku: option.sku,
      denomination_value: option.denomination_value,
      price: option.price,
      original_price: option.original_price,
      currency: row.currency_code,
      available: option.available,
      on_deal: option.on_deal,
      availability_mode: option.availability_mode,
      fulfillment_mode: option.fulfillment_mode,
    })),
  };
};

const normalizeRpcError = (error) => {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (message.includes('choose a currency')) return 'Choose a currency before filtering by price.';
  if (message.includes('price page size') || message.includes('catalog page size')) return 'The catalog page request is invalid.';
  return 'The catalog could not be loaded. Check the Supabase connection and confirm the catalog migrations are applied.';
};

export const catalogService = {
  async search({
    searchTerm = null,
    categorySlug = null,
    minPrice = null,
    maxPrice = null,
    currencyCode = null,
    availableOnly = false,
    dealsOnly = false,
    productType = null,
    slug = null,
    sortBy = 'relevant',
    limit = CATALOG_PAGE_SIZE,
    offset = 0,
  } = {}) {
    const client = requireStore();
    const { data, error } = await client.rpc('search_catalog', {
      search_term: searchTerm?.trim() || null,
      category_slug: categorySlug || null,
      min_price: minPrice === '' || minPrice == null ? null : Number(minPrice),
      max_price: maxPrice === '' || maxPrice == null ? null : Number(maxPrice),
      currency_code_filter: currencyCode || null,
      available_only: Boolean(availableOnly),
      deals_only: Boolean(dealsOnly),
      product_type_filter: productType || null,
      slug_filter: slug || null,
      sort_by: sortBy,
      result_limit: limit,
      result_offset: offset,
    });

    if (error) throw new Error(normalizeRpcError(error));
    const rows = Array.isArray(data) ? data : [];
    return {
      products: rows.map(normalizeProduct),
      totalCount: Number(rows[0]?.total_count ?? 0),
    };
  },

  async getProductBySlug(slug) {
    const result = await this.search({ slug, limit: 1, offset: 0, sortBy: 'relevant' });
    return result.products[0] ?? null;
  },

  async listCategories() {
    const client = requireStore();
    const { data, error } = await client
      .from('categories')
      .select('id,name,slug,description,sort_order')
      .eq('status', 'active')
      .eq('visibility', 'public')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw new Error('Categories could not be loaded. Check the Supabase connection and catalog migration.');
    return data ?? [];
  },

  async getCategoryBySlug(slug) {
    const client = requireStore();
    const { data, error } = await client
      .from('categories')
      .select('id,name,slug,description')
      .eq('slug', slug)
      .eq('status', 'active')
      .eq('visibility', 'public')
      .maybeSingle();

    if (error) throw new Error('Category information could not be loaded.');
    return data;
  },

  async listCurrencies() {
    const client = requireStore();
    const { data, error } = await client
      .from('products')
      .select('currency_code')
      .eq('status', 'active')
      .eq('visibility', 'public')
      .eq('resale_rights_verified', true)
      .limit(1000);

    if (error) throw new Error('Catalog filters could not be loaded.');
    return [...new Set((data ?? []).map((row) => row.currency_code).filter(Boolean))].sort();
  },
};

export { CATALOG_PAGE_SIZE, normalizeProduct };
