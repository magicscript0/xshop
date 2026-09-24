import CatalogBrowser from '../../components/store/CatalogBrowser';
import StorePageShell from '../../components/store/StorePageShell';

const Shop = () => (
  <StorePageShell
    eyebrow="XSHOP / SHOP"
    title="Browse the catalog"
    description="Explore current listings, product options, and database-backed availability. Pricing and product details come from the published XSHOP catalog."
  >
    <CatalogBrowser
      mode="shop"
      emptyTitle="No products match these filters"
      emptyDescription="There are no active product records for this selection. Listings appear only after a real catalog entry has been approved and published."
    />
  </StorePageShell>
);

export default Shop;
