import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { formatDateTime, formatNumber, shortId } from '../../lib/format';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote, Modal,
  StatusBadge, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from '../../components/admin/AdminUI';

const ImportDialog = ({ options, onClose, onDone }) => {
  const [priceId, setPriceId] = useState(options[0]?.price_id ?? '');
  const [entries, setEntries] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const payloads = entries.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!priceId) { setError('Choose a digital product option.'); return; }
    if (!payloads.length || payloads.length > 500) {
      setError('Provide between 1 and 500 delivery entries, one per line.');
      return;
    }
    setBusy(true);
    try {
      const inserted = await adminService.importInventory(priceId, payloads);
      toast.success(`${inserted} inventory item${inserted === 1 ? '' : 's'} imported.`);
      onDone();
    } catch (actionError) {
      setError(actionError.message || 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import digital inventory" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs leading-relaxed text-gray-400">
          Paste one legitimate delivery entry (code, key, or credential you are licensed to resell) per line.
          Entries are stored privately, never appear in catalog queries or client bundles, and each item can be
          fulfilled exactly once. Imports are idempotent per batch.
        </p>
        {error && <ErrorNote message={error} />}
        <Field label="Product option" required>
          <select value={priceId} onChange={(event) => setPriceId(event.target.value)} className={selectClass}>
            {options.map((option) => (
              <option key={option.price_id} value={option.price_id}>
                {option.product_name}{option.variant_name ? ` — ${option.variant_name}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Delivery entries" required hint="One entry per line. Up to 500 per import.">
          <textarea rows={8} value={entries} onChange={(event) => setEntries(event.target.value)} className={`${inputClass} font-mono`} spellCheck={false} autoComplete="off" />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={subtleButtonClass}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Importing…' : 'Import inventory'}</button>
        </div>
      </form>
    </Modal>
  );
};

const AdminInventory = () => {
  const [summary, setSummary] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [inspectPrice, setInspectPrice] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([adminService.getInventorySummary(), adminService.listInventoryBatches()])
      .then(([summaryData, batchData]) => { setSummary(summaryData); setBatches(batchData); })
      .catch((loadError) => setError(loadError.message || 'Inventory could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const inspect = (row) => {
    setInspectPrice(row);
    setItemsLoading(true);
    adminService.listInventoryItems(row.price_id)
      .then((data) => setItems(data))
      .catch((loadError) => toast.error(loadError.message || 'Inventory items could not be loaded.'))
      .finally(() => setItemsLoading(false));
  };

  const voidItem = async (item) => {
    const reason = window.prompt('Reason for invalidating this inventory item (audited):');
    if (!reason?.trim()) return;
    try {
      await adminService.voidInventoryItem(item.id, reason.trim());
      toast.success('Inventory item invalidated.');
      inspect(inspectPrice);
      load();
    } catch (actionError) {
      toast.error(actionError.message || 'The item could not be invalidated.');
    }
  };

  if (loading) return <LoadingNote label="Loading inventory…" />;
  if (error) return <ErrorNote message={error} onRetry={load} />;

  const digital = summary?.digital ?? [];
  const tracked = summary?.tracked ?? [];

  return (
    <div className="space-y-6">
      <AdminCard
        title="Digital inventory"
        description={`Counts per product option. Codes themselves are never displayed here. Low-stock threshold: ${summary?.threshold}.`}
        actions={(
          <button type="button" onClick={() => setShowImport(true)} disabled={digital.length === 0} className={primaryButtonClass}>
            <Upload className="h-4 w-4" aria-hidden="true" /> Import inventory
          </button>
        )}
      >
        {digital.length === 0 ? (
          <EmptyNote title="No digital-inventory options" description='Create a product price with availability "digital" to import fulfillable inventory.' />
        ) : (
          <AdminTable headers={['Option', 'Available', 'Reserved', 'Sold', 'Invalidated', 'Actions']} caption="Digital inventory summary">
            {digital.map((row) => (
              <tr key={row.price_id} className={row.low_stock ? 'bg-amber-400/[0.04]' : undefined}>
                <td className="px-3 py-2.5 text-gray-200">
                  <span className="flex items-center gap-2">
                    {row.low_stock && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />}
                    {row.product_name}{row.variant_name ? ` — ${row.variant_name}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-white">{formatNumber(row.available)}</td>
                <td className="px-3 py-2.5 text-gray-300">{formatNumber(row.reserved)}</td>
                <td className="px-3 py-2.5 text-gray-300">{formatNumber(row.assigned)}</td>
                <td className="px-3 py-2.5 text-gray-400">{formatNumber(row.void)}</td>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={() => inspect(row)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">Inspect</button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {tracked.length > 0 && (
        <AdminCard title="Tracked stock (manual fulfillment)" description="Options with a simple stock counter, fulfilled manually after payment review.">
          <AdminTable headers={['Option', 'Stock on hand']} caption="Tracked stock">
            {tracked.map((row) => (
              <tr key={row.price_id} className={row.low_stock ? 'bg-amber-400/[0.04]' : undefined}>
                <td className="px-3 py-2.5 text-gray-200">
                  <span className="flex items-center gap-2">
                    {row.low_stock && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />}
                    {row.product_name}{row.variant_name ? ` — ${row.variant_name}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-white">{formatNumber(row.stock_on_hand)}</td>
              </tr>
            ))}
          </AdminTable>
        </AdminCard>
      )}

      <AdminCard title="Recent import batches" description="Idempotent batch registry; re-running a batch never duplicates items.">
        {batches.length === 0 ? (
          <EmptyNote title="No imports yet" description="Inventory import batches appear here." />
        ) : (
          <AdminTable headers={['Batch', 'Entries', 'Imported']} caption="Inventory import batches">
            {batches.map((batch) => (
              <tr key={batch.batch_id}>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{shortId(batch.batch_id)}</td>
                <td className="px-3 py-2.5 text-gray-300">{formatNumber(batch.payload_count)}</td>
                <td className="px-3 py-2.5 text-gray-400">{formatDateTime(batch.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {showImport && (
        <ImportDialog
          options={digital}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }}
        />
      )}

      {inspectPrice && (
        <Modal title={`Inventory — ${inspectPrice.product_name}${inspectPrice.variant_name ? ` (${inspectPrice.variant_name})` : ''}`} onClose={() => setInspectPrice(null)} wide>
          <p className="mb-4 text-xs leading-relaxed text-gray-400">
            Item metadata only — delivery payloads are never fetched into this screen. Only available items can be invalidated.
          </p>
          {itemsLoading ? <LoadingNote label="Loading items…" /> : items.length === 0 ? (
            <EmptyNote title="No inventory items" />
          ) : (
            <AdminTable headers={['Item', 'Status', 'Imported', 'Actions']} caption="Inventory items">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{shortId(item.id)}</td>
                  <td className="px-3 py-2.5"><StatusBadge value={item.status} /></td>
                  <td className="px-3 py-2.5 text-gray-400">{formatDateTime(item.created_at)}</td>
                  <td className="px-3 py-2.5">
                    {item.status === 'available' && (
                      <button type="button" onClick={() => voidItem(item)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-red-300/30 hover:text-red-200">
                        Invalidate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
        </Modal>
      )}
    </div>
  );
};

export default AdminInventory;
