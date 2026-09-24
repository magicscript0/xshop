import ProductCard from './ProductCard';
import StoreEmptyState from './StoreEmptyState';

const ProductGrid = ({ products = [], emptyState = {} }) => {
  if (!products.length) {
    return (
      <StoreEmptyState
        icon={emptyState.icon}
        title={emptyState.title || 'The catalog is being prepared'}
        description={emptyState.description || 'No active published product records match this view. Catalog listings appear only after a real product has been approved.'}
        actionLabel={emptyState.actionLabel}
        actionTo={emptyState.actionTo}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => <ProductCard key={product.id} product={product} />)}
    </div>
  );
};

export default ProductGrid;
