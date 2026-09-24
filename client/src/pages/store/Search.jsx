import CatalogBrowser from '../../components/store/CatalogBrowser';
import StorePageShell from '../../components/store/StorePageShell';
import usePageMeta from '../../hooks/usePageMeta';

const SearchPage = () => {
  usePageMeta({ title: 'Search', description: 'Search published XSHOP products, identifiers, and active categories.', canonicalPath: '/search' });
  return (
  <StorePageShell
    eyebrow="XSHOP / SEARCH"
    title="Find a product"
    description="Search published product details, identifiers, and active categories. Results and filters are read from the XSHOP catalog."
  >
    <CatalogBrowser
      mode="search"
      emptyTitle="No matching products"
      emptyDescription="Try another search term or clear one of the catalog filters."
    />
  </StorePageShell>
  );
};

export default SearchPage;
