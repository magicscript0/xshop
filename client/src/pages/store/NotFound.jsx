import StoreEmptyState from '../../components/store/StoreEmptyState';
import StorePageShell from '../../components/store/StorePageShell';
import usePageMeta from '../../hooks/usePageMeta';

const NotFound = () => {
  usePageMeta({ title: 'Page not found', noindex: true });
  return (
  <StorePageShell eyebrow="XSHOP / 404" title="Page not found" description="That route does not exist in the current storefront.">
    <StoreEmptyState
      title="We could not find that page"
      description="Check the address or return to the XSHOP home page."
      actionLabel="Go home"
      actionTo="/"
    />
  </StorePageShell>
  );
};

export default NotFound;
