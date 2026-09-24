import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote, Modal,
  StatusBadge, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from '../../components/admin/AdminUI';

const ASSET_NETWORKS = {
  USDT: ['TRC20', 'ERC20'],
  USDC: ['ERC20'],
  BTC: ['Bitcoin'],
  ETH: ['Ethereum'],
  TRX: ['TRON'],
  LTC: ['Litecoin'],
};

const emptyMethod = {
  asset_code: 'USDT',
  network_code: 'TRC20',
  display_name: '',
  fiat_currency_code: 'USD',
  crypto_units_per_fiat: '',
  asset_decimals: 6,
  receiving_address: '',
  status: 'inactive',
  starts_at: '',
  ends_at: '',
};

const AdminPaymentMethods = () => {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.listPaymentMethodsAdmin()
      .then((data) => setMethods(data))
      .catch((loadError) => setError(loadError.message || 'Payment methods could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (key, value) => setEditing((current) => {
    const next = { ...current, [key]: value };
    if (key === 'asset_code' && !ASSET_NETWORKS[value].includes(next.network_code)) {
      next.network_code = ASSET_NETWORKS[value][0];
    }
    return next;
  });

  const save = async (event) => {
    event.preventDefault();
    setDialogError('');
    if (!editing.display_name?.trim()) { setDialogError('Enter a display name.'); return; }
    if (!editing.receiving_address?.trim() || editing.receiving_address.trim().length < 8) {
      setDialogError('Enter the real receiving address configured by the store owner (at least 8 characters). Addresses are never invented.');
      return;
    }
    if (!Number.isFinite(Number(editing.crypto_units_per_fiat)) || Number(editing.crypto_units_per_fiat) <= 0) {
      setDialogError('Enter the configured crypto units per one unit of fiat (a positive number).');
      return;
    }
    setBusy(true);
    try {
      await adminService.savePaymentMethod(editing);
      toast.success('Payment method saved.');
      setEditing(null);
      load();
    } catch (actionError) {
      setDialogError(actionError.message || 'The payment method could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (method) => {
    try {
      await adminService.savePaymentMethod({ ...method, status: method.status === 'active' ? 'inactive' : 'active' });
      load();
    } catch (actionError) {
      toast.error(actionError.message || 'The status could not be changed.');
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard
        title="Crypto payment methods"
        description="Receiving addresses and quotes are configured here by the store owner. No addresses are pre-filled, private keys are never stored, and no automatic blockchain verification is claimed."
        actions={<button type="button" onClick={() => { setEditing({ ...emptyMethod }); setDialogError(''); }} className={primaryButtonClass}><Plus className="h-4 w-4" aria-hidden="true" /> Add method</button>}
      >
        {loading ? <LoadingNote label="Loading payment methods…" /> : error ? <ErrorNote message={error} onRetry={load} /> : methods.length === 0 ? (
          <EmptyNote title="No payment methods configured" description="Add an asset, network, and your real receiving address to enable checkout payments." />
        ) : (
          <AdminTable headers={['Method', 'Fiat', 'Quote', 'Receiving address', 'Status', 'Actions']} caption="Configured payment methods">
            {methods.map((method) => (
              <tr key={method.id}>
                <td className="px-3 py-2.5 text-gray-200">{method.display_name}<span className="block text-xs text-gray-500">{method.asset_code} · {method.network_code}</span></td>
                <td className="px-3 py-2.5 text-gray-300">{method.fiat_currency_code}</td>
                <td className="px-3 py-2.5 text-gray-300">{method.crypto_units_per_fiat}<span className="block text-xs text-gray-500">{method.asset_decimals} decimals</span></td>
                <td className="px-3 py-2.5"><span className="block max-w-[180px] truncate font-mono text-xs text-gray-400" title={method.receiving_address}>{method.receiving_address}</span></td>
                <td className="px-3 py-2.5"><StatusBadge value={method.status} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setEditing({ ...method, starts_at: method.starts_at ?? '', ends_at: method.ends_at ?? '' }); setDialogError(''); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">Edit</button>
                    <button type="button" onClick={() => toggleStatus(method)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">
                      {method.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {editing && (
        <Modal title={editing.id ? 'Edit payment method' : 'Add payment method'} onClose={() => setEditing(null)} wide>
          <form onSubmit={save} className="space-y-4">
            {dialogError && <ErrorNote message={dialogError} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Asset" required>
                <select value={editing.asset_code} onChange={(event) => setField('asset_code', event.target.value)} className={selectClass}>
                  {Object.keys(ASSET_NETWORKS).map((asset) => <option key={asset} value={asset}>{asset}</option>)}
                </select>
              </Field>
              <Field label="Network" required>
                <select value={editing.network_code} onChange={(event) => setField('network_code', event.target.value)} className={selectClass}>
                  {ASSET_NETWORKS[editing.asset_code].map((network) => <option key={network} value={network}>{network}</option>)}
                </select>
              </Field>
              <Field label="Display name" required hint="Shown to customers at checkout.">
                <input type="text" maxLength={100} value={editing.display_name} onChange={(event) => setField('display_name', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Fiat currency" required hint="Must match the order currency (e.g. USD).">
                <input type="text" maxLength={3} value={editing.fiat_currency_code} onChange={(event) => setField('fiat_currency_code', event.target.value.toUpperCase())} className={inputClass} />
              </Field>
              <Field label="Crypto units per 1 fiat unit" required hint="Manually configured quote; update it when rates change.">
                <input type="number" step="any" min="0" value={editing.crypto_units_per_fiat} onChange={(event) => setField('crypto_units_per_fiat', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Asset decimals" required>
                <input type="number" min="0" max="18" value={editing.asset_decimals} onChange={(event) => setField('asset_decimals', event.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Receiving address" required hint="Enter your own wallet address. Never enter a private key or seed phrase.">
              <input type="text" maxLength={200} value={editing.receiving_address} onChange={(event) => setField('receiving_address', event.target.value)} className={`${inputClass} font-mono`} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Status" required>
                <select value={editing.status} onChange={(event) => setField('status', event.target.value)} className={selectClass}>
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                </select>
              </Field>
              <Field label="Available from" hint="Optional">
                <input type="datetime-local" value={editing.starts_at ? editing.starts_at.slice(0, 16) : ''} onChange={(event) => setField('starts_at', event.target.value ? new Date(event.target.value).toISOString() : '')} className={inputClass} />
              </Field>
              <Field label="Available until" hint="Optional">
                <input type="datetime-local" value={editing.ends_at ? editing.ends_at.slice(0, 16) : ''} onChange={(event) => setField('ends_at', event.target.value ? new Date(event.target.value).toISOString() : '')} className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={subtleButtonClass}>Cancel</button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Saving…' : 'Save method'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminPaymentMethods;
