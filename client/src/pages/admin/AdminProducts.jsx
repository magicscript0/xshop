import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { adminService } from '../../services/adminService';
import ProductEditor from '../../components/admin/ProductEditor';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, LoadingNote,
  StatusBadge, inputClass, primaryButtonClass,
} from '../../components/admin/AdminUI';

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editorProductId, setEditorProductId] = useState(undefined); // undefined = closed, null = new

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([adminService.listProductsAdmin(), adminService.listCategoriesAdmin()])
      .then(([productData, categoryData]) => { setProducts(productData); setCategories(categoryData); })
      .catch((loadError) => setError(loadError.message || 'Products could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((product) => {
    const term = filter.trim().toLowerCase();
    if (!term) return true;
    return product.name.toLowerCase().includes(term) || product.slug.includes(term);
  });

  return (
    <div className="space-y-6">
      <AdminCard
        title="Products"
        description="Only active + public + rights-verified products appear in the storefront. Archive products instead of deleting them once orders exist."
        actions={(
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="search" value={filter} onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter products…" aria-label="Filter products"
                className={`${inputClass} !w-52 pl-9`}
              />
            </div>
            <button type="button" onClick={() => setEditorProductId(null)} className={primaryButtonClass}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New product
            </button>
          </>
        )}
      >
        {loading ? <LoadingNote label="Loading products…" /> : error ? <ErrorNote message={error} onRetry={load} /> : filtered.length === 0 ? (
          <EmptyNote title={filter ? 'No products match the filter' : 'No products yet'} description={filter ? undefined : 'Create your first product to start building the catalog. No sample data is generated.'} />
        ) : (
          <AdminTable headers={['Product', 'Type', 'Currency', 'Status', 'Visibility', 'Rights', 'Actions']} caption="Products">
            {filtered.map((product) => (
              <tr key={product.id} className="transition hover:bg-white/[0.03]">
                <td className="px-3 py-2.5">
                  <span className="block max-w-[240px] truncate font-medium text-gray-200">{product.name}</span>
                  <span className="block font-mono text-xs text-gray-500">/{product.slug}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-400">{product.product_type.replaceAll('_', ' ')}</td>
                <td className="px-3 py-2.5 text-gray-300">{product.currency_code}</td>
                <td className="px-3 py-2.5"><StatusBadge value={product.status} /></td>
                <td className="px-3 py-2.5 text-gray-400">{product.visibility}</td>
                <td className="px-3 py-2.5"><StatusBadge value={product.resale_rights_verified ? 'verified' : 'pending'} /></td>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={() => setEditorProductId(product.id)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {editorProductId !== undefined && (
        <ProductEditor
          productId={editorProductId}
          categories={categories}
          onClose={() => setEditorProductId(undefined)}
          onSaved={load}
        />
      )}
    </div>
  );
};

export default AdminProducts;
