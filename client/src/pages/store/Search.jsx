import CatalogBrowser from '../../components/store/CatalogBrowser';
import StorePageShell from '../../components/store/StorePageShell';

const SearchPage = () => (
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

export default SearchPage;
