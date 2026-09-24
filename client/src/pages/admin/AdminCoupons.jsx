import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { formatDateTime, formatNumber } from '../../lib/format';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote, Modal,
  StatusBadge, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from '../../components/admin/AdminUI';

const emptyCoupon = {
  code: '', description: '', discount_type: 'percent', discount_value: '', currency_code: 'USD',
  min_order_amount: '', max_discount_amount: '', usage_limit: '', per_customer_limit: 1,
  status: 'inactive', starts_at: '', ends_at: '',
};

const toLocalInput = (value) => (value ? value.slice(0, 16) : '');
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : '');

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.listCoupons()
      .then((data) => setCoupons(data))
      .catch((loadError) => setError(loadError.message || 'Coupons could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (key, value) => setEditing((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setDialogError('');
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test((editing.code || '').toUpperCase())) {
      setDialogError('Codes are 3–40 characters: letters, numbers, dashes, underscores.');
      return;
    }
    if (!Number.isFinite(Number(editing.discount_value)) || Number(editing.discount_value) <= 0) {
      setDialogError('Enter a discount value greater than zero.');
      return;
    }
    if (editing.discount_type === 'percent' && Number(editing.discount_value) > 100) {
      setDialogError('Percentage discounts cannot exceed 100.');
      return;
    }
    setBusy(true);
    try {
      await adminService.saveCoupon(editing);
      toast.success('Coupon saved.');
      setEditing(null);
      load();
    } catch (actionError) {
      setDialogError(actionError.message || 'The coupon could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (coupon) => {
    try {
      await adminService.saveCoupon({ ...coupon, status: coupon.status === 'active' ? 'inactive' : 'active' });
      load();
    } catch (actionError) {
      toast.error(actionError.message || 'The status could not be changed.');
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard
        title="Coupons"
        description="Coupons are validated by the database at checkout — usage limits, windows, minimums, and stacking rules are enforced server-side and every redemption is auditable."
        actions={<button type="button" onClick={() => { setEditing({ ...emptyCoupon }); setDialogError(''); }} className={primaryButtonClass}><Plus className="h-4 w-4" aria-hidden="true" /> New coupon</button>}
      >
        {loading ? <LoadingNote label="Loading coupons…" /> : error ? <ErrorNote message={error} onRetry={load} /> : coupons.length === 0 ? (
          <EmptyNote title="No coupons yet" description="Create a coupon to run a promotion. Codes are never exposed publicly." />
        ) : (
          <AdminTable headers={['Code', 'Discount', 'Limits', 'Window', 'Used', 'Status', 'Actions']} caption="Coupons">
            {coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td className="px-3 py-2.5"><span className="font-mono text-sm text-white">{coupon.code}</span>{coupon.description && <span className="block max-w-[200px] truncate text-xs text-gray-500">{coupon.description}</span>}</td>
                <td className="px-3 py-2.5 text-gray-300">{coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `${coupon.discount_value} ${coupon.currency_code}`}{coupon.max_discount_amount && <span className="block text-xs text-gray-500">max {coupon.max_discount_amount}</span>}</td>
                <td className="px-3 py-2.5 text-xs text-gray-400">
                  {coupon.min_order_amount ? `min ${coupon.min_order_amount}` : 'no minimum'}<br />
                  {coupon.usage_limit ? `${coupon.usage_limit} total` : 'unlimited'} · {coupon.per_customer_limit}/customer
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-400">{coupon.starts_at ? formatDateTime(coupon.starts_at) : 'now'} →<br />{coupon.ends_at ? formatDateTime(coupon.ends_at) : 'open'}</td>
                <td className="px-3 py-2.5 text-gray-300">{formatNumber(coupon.redemption_count)}</td>
                <td className="px-3 py-2.5"><StatusBadge value={coupon.status} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setEditing({ ...coupon, starts_at: coupon.starts_at ?? '', ends_at: coupon.ends_at ?? '', currency_code: coupon.currency_code ?? 'USD' }); setDialogError(''); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">Edit</button>
                    <button type="button" onClick={() => toggleStatus(coupon)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">
                      {coupon.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {editing && (
        <Modal title={editing.id ? 'Edit coupon' : 'New coupon'} onClose={() => setEditing(null)} wide>
          <form onSubmit={save} className="space-y-4">
            {dialogError && <ErrorNote message={dialogError} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" required hint="Automatically uppercased.">
                <input type="text" maxLength={40} value={editing.code} onChange={(event) => setField('code', event.target.value.toUpperCase())} className={`${inputClass} font-mono`} />
              </Field>
              <Field label="Description" hint="Internal note.">
                <input type="text" maxLength={300} value={editing.description || ''} onChange={(event) => setField('description', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Discount type" required>
                <select value={editing.discount_type} onChange={(event) => setField('discount_type', event.target.value)} className={selectClass}>
                  <option value="percent">Percentage off</option>
                  <option value="amount">Fixed amount off</option>
                </select>
              </Field>
              <Field label={editing.discount_type === 'percent' ? 'Percent (1–100)' : 'Amount'} required>
                <input type="number" step="any" min="0" value={editing.discount_value} onChange={(event) => setField('discount_value', event.target.value)} className={inputClass} />
              </Field>
              {editing.discount_type === 'amount' && (
                <Field label="Currency" required>
                  <input type="text" maxLength={3} value={editing.currency_code} onChange={(event) => setField('currency_code', event.target.value.toUpperCase())} className={inputClass} />
                </Field>
              )}
              <Field label="Minimum order value" hint="Optional.">
                <input type="number" step="any" min="0" value={editing.min_order_amount ?? ''} onChange={(event) => setField('min_order_amount', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Maximum discount" hint="Optional cap.">
                <input type="number" step="any" min="0" value={editing.max_discount_amount ?? ''} onChange={(event) => setField('max_discount_amount', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Total usage limit" hint="Optional.">
                <input type="number" min="1" value={editing.usage_limit ?? ''} onChange={(event) => setField('usage_limit', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Per-customer limit" required>
                <input type="number" min="1" max="100" value={editing.per_customer_limit} onChange={(event) => setField('per_customer_limit', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Status" required>
                <select value={editing.status} onChange={(event) => setField('status', event.target.value)} className={selectClass}>
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                </select>
              </Field>
              <Field label="Starts" hint="Optional.">
                <input type="datetime-local" value={toLocalInput(editing.starts_at)} onChange={(event) => setField('starts_at', fromLocalInput(event.target.value))} className={inputClass} />
              </Field>
              <Field label="Ends" hint="Optional.">
                <input type="datetime-local" value={toLocalInput(editing.ends_at)} onChange={(event) => setField('ends_at', fromLocalInput(event.target.value))} className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={subtleButtonClass}>Cancel</button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Saving…' : 'Save coupon'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminCoupons;
