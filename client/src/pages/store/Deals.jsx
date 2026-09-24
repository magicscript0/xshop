import CatalogBrowser from '../../components/store/CatalogBrowser';
import StorePageShell from '../../components/store/StorePageShell';

const Deals = () => (
  <StorePageShell
    eyebrow="XSHOP / OFFERS"
    title="Deals"
    description="Explore current offers configured in the catalog. Deal prices, timing, and eligibility are resolved by Supabase."
  >
    <CatalogBrowser
      mode="deals"
      emptyTitle="No active offers"
      emptyDescription="There are no live deal records matching these filters. No sale price or promotion is invented for the storefront."
    />
  </StorePageShell>
);

export default Deals;
