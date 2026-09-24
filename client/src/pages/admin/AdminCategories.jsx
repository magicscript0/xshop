import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote, Modal,
  StatusBadge, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from '../../components/admin/AdminUI';

const emptyCategory = { name: '', slug: '', description: '', status: 'draft', visibility: 'private', sort_order: 0 };

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.listCategoriesAdmin()
      .then((data) => setCategories(data))
      .catch((loadError) => setError(loadError.message || 'Categories could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setDialogError('');
    if (!editing.name?.trim()) { setDialogError('Enter a category name.'); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(editing.slug || '')) {
      setDialogError('Enter a URL-safe slug like "gift-cards". Changing a live slug breaks existing links.');
      return;
    }
    setBusy(true);
    try {
      await adminService.saveCategory(editing);
      toast.success('Category saved.');
      setEditing(null);
      load();
    } catch (actionError) {
      setDialogError(actionError.message || 'The category could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard
        title="Categories"
        description="Public category pages show only active + public categories. Reorder with the sort field; lower numbers appear first."
        actions={<button type="button" onClick={() => { setEditing({ ...emptyCategory }); setDialogError(''); }} className={primaryButtonClass}><Plus className="h-4 w-4" aria-hidden="true" /> New category</button>}
      >
        {loading ? <LoadingNote label="Loading categories…" /> : error ? <ErrorNote message={error} onRetry={load} /> : categories.length === 0 ? (
          <EmptyNote title="No categories yet" description="Create a category to organize the public catalog." />
        ) : (
          <AdminTable headers={['Name', 'Slug', 'Status', 'Visibility', 'Sort', 'Actions']} caption="Categories">
            {categories.map((category) => (
              <tr key={category.id}>
                <td className="px-3 py-2.5 text-gray-200">{category.name}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-400">/{category.slug}</td>
                <td className="px-3 py-2.5"><StatusBadge value={category.status} /></td>
                <td className="px-3 py-2.5"><StatusBadge value={category.visibility === 'public' ? 'active' : 'draft'} /></td>
                <td className="px-3 py-2.5 text-gray-400">{category.sort_order}</td>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={() => { setEditing({ ...category }); setDialogError(''); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">Edit</button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {editing && (
        <Modal title={editing.id ? 'Edit category' : 'New category'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            {dialogError && <ErrorNote message={dialogError} />}
            <Field label="Name" required>
              <input
                type="text" maxLength={120} value={editing.name}
                onChange={(event) => setEditing((current) => ({
                  ...current,
                  name: event.target.value,
                  slug: current.id ? current.slug : slugify(event.target.value),
                }))}
                className={inputClass}
              />
            </Field>
            <Field label="Slug" required hint={editing.id ? 'Careful: changing a live slug breaks existing category URLs.' : 'Lowercase letters, numbers, and dashes.'}>
              <input type="text" maxLength={120} value={editing.slug} onChange={(event) => setEditing((current) => ({ ...current, slug: event.target.value }))} className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Description" hint="Optional; shown on the category page.">
              <textarea rows={3} maxLength={2000} value={editing.description || ''} onChange={(event) => setEditing((current) => ({ ...current, description: event.target.value }))} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Status" required>
                <select value={editing.status} onChange={(event) => setEditing((current) => ({ ...current, status: event.target.value }))} className={selectClass}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <Field label="Visibility" required>
                <select value={editing.visibility} onChange={(event) => setEditing((current) => ({ ...current, visibility: event.target.value }))} className={selectClass}>
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </Field>
              <Field label="Sort order">
                <input type="number" value={editing.sort_order} onChange={(event) => setEditing((current) => ({ ...current, sort_order: event.target.value }))} className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={subtleButtonClass}>Cancel</button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Saving…' : 'Save category'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminCategories;
