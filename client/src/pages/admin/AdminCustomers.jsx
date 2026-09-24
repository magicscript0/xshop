import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';
import { adminService } from '../../services/adminService';
import { formatDateTime, formatMoney, formatNumber, shortId } from '../../lib/format';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote, Modal,
  StatusBadge, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from '../../components/admin/AdminUI';

const PAGE_SIZE = 25;
const ROLES = ['customer', 'support', 'admin', 'super_admin'];

const CustomerDetail = ({ customerId, onClose, onChanged }) => {
  const { profile: myProfile, user } = useAuth();
  const isSuperAdmin = myProfile?.role === 'super_admin';
  const isAdmin = ['admin', 'super_admin'].includes(myProfile?.role);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const [pointsDraft, setPointsDraft] = useState('');
  const [pointsReason, setPointsReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.getCustomerDetail(customerId)
      .then((data) => { setDetail(data); setRoleDraft(data.profile.role); })
      .catch((loadError) => setError(loadError.message || 'The customer could not be loaded.'))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const changeRole = async () => {
    setBusy(true);
    try {
      await adminService.setUserRole(customerId, roleDraft);
      toast.success('Role updated.');
      load();
      onChanged();
    } catch (actionError) {
      toast.error(actionError.message || 'The role change was refused.');
    } finally {
      setBusy(false);
    }
  };

  const adjustPoints = async (event) => {
    event.preventDefault();
    const delta = Math.trunc(Number(pointsDraft));
    if (!delta) { toast.error('Enter a non-zero point adjustment.'); return; }
    if (!pointsReason.trim()) { toast.error('An adjustment reason is required.'); return; }
    setBusy(true);
    try {
      await adminService.adjustRewardPoints(customerId, delta, pointsReason.trim());
      toast.success('Reward ledger updated.');
      setPointsDraft('');
      setPointsReason('');
      load();
    } catch (actionError) {
      toast.error(actionError.message || 'The adjustment was refused.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Customer" onClose={onClose} wide>
      {loading ? <LoadingNote label="Loading customer…" /> : error ? <ErrorNote message={error} onRetry={load} /> : (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{detail.profile.display_name || 'Unnamed customer'}</p>
                <p className="text-sm text-gray-400">{detail.profile.email || '—'}</p>
                <p className="mt-1 text-xs text-gray-500">Joined {formatDateTime(detail.profile.created_at)} · ID <span className="font-mono">{shortId(detail.profile.id)}</span></p>
              </div>
              <StatusBadge value={detail.profile.role} />
            </div>
            {isSuperAdmin && detail.profile.id !== user?.id && (
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/[0.07] pt-4">
                <Field label="Role" hint="Only a super admin can change roles; you can never change your own.">
                  <select value={roleDraft} onChange={(event) => setRoleDraft(event.target.value)} className={selectClass}>
                    {ROLES.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}
                  </select>
                </Field>
                <button type="button" onClick={changeRole} disabled={busy || roleDraft === detail.profile.role} className={primaryButtonClass}>
                  Update role
                </button>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Recent orders</h3>
            {detail.orders.length === 0 ? <EmptyNote title="No orders yet" /> : (
              <AdminTable headers={['Order', 'Created', 'Total', 'Payment', 'Fulfillment']} caption="Customer orders">
                {detail.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-3 py-2.5"><Link to={`/admin/orders/${order.id}`} className="font-mono text-xs text-purple-200 underline-offset-4 hover:underline">{shortId(order.id)}</Link></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{formatDateTime(order.created_at)}</td>
                    <td className="px-3 py-2.5 text-white">{formatMoney(order.total_amount, order.currency_code)}</td>
                    <td className="px-3 py-2.5"><StatusBadge value={order.payment_status} /></td>
                    <td className="px-3 py-2.5"><StatusBadge value={order.fulfillment_status} /></td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </div>

          {isAdmin && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Rewards ledger <span className="ml-2 text-xs font-normal text-gray-500">Balance: {formatNumber(detail.rewardBalance)} points</span></h3>
              {detail.rewards.length === 0 ? <p className="text-xs text-gray-500">No reward activity.</p> : (
                <AdminTable headers={['When', 'Type', 'Points', 'Description']} caption="Reward ledger">
                  {detail.rewards.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{formatDateTime(entry.created_at)}</td>
                      <td className="px-3 py-2.5 text-gray-300">{entry.entry_type.replaceAll('_', ' ')}</td>
                      <td className={`px-3 py-2.5 font-semibold ${entry.points_delta > 0 ? 'text-emerald-200' : 'text-red-200'}`}>{entry.points_delta > 0 ? '+' : ''}{formatNumber(entry.points_delta)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{entry.description}</td>
                    </tr>
                  ))}
                </AdminTable>
              )}
              <form onSubmit={adjustPoints} className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-4">
                <Field label="Adjust points" hint="Positive or negative; recorded in the immutable ledger and audit log.">
                  <input type="number" value={pointsDraft} onChange={(event) => setPointsDraft(event.target.value)} className={`${inputClass} !w-36`} />
                </Field>
                <Field label="Reason" required>
                  <input type="text" maxLength={300} value={pointsReason} onChange={(event) => setPointsReason(event.target.value)} className={`${inputClass} !w-64`} />
                </Field>
                <button type="submit" disabled={busy} className={subtleButtonClass}>Record adjustment</button>
              </form>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.listCustomers({ search: submittedSearch, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((result) => { setCustomers(result.customers); setTotalCount(result.totalCount); })
      .catch((loadError) => setError(loadError.message || 'Customers could not be loaded.'))
      .finally(() => setLoading(false));
  }, [submittedSearch, page]);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminCard
        title="Customers"
        description="Profiles, order history, and reward activity. Authentication secrets are managed by Supabase Auth and are never visible here."
        actions={(
          <form
            onSubmit={(event) => { event.preventDefault(); setPage(0); setSubmittedSearch(search); }}
            className="relative"
            role="search"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <input
              type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email or name…" aria-label="Search customers"
              className={`${inputClass} !w-60 pl-9`}
            />
          </form>
        )}
      >
        {loading ? <LoadingNote label="Loading customers…" /> : error ? <ErrorNote message={error} onRetry={load} /> : customers.length === 0 ? (
          <EmptyNote title="No customers found" description={submittedSearch ? 'No profiles match this search.' : 'Customer profiles appear after account registration.'} />
        ) : (
          <>
            <AdminTable headers={['Customer', 'Role', 'Joined', 'Actions']} caption="Customers">
              {customers.map((customer) => (
                <tr key={customer.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[240px] truncate font-medium text-gray-200">{customer.display_name || '—'}</span>
                    <span className="block max-w-[240px] truncate text-xs text-gray-500">{customer.email || '—'}</span>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge value={customer.role} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{formatDateTime(customer.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => setSelectedId(customer.id)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </AdminTable>
            {pageCount > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-400">
                <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className={subtleButtonClass}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                <span>Page {page + 1} of {pageCount}</span>
                <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)} className={subtleButtonClass}>
                  Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        )}
      </AdminCard>

      {selectedId && (
        <CustomerDetail customerId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
};

export default AdminCustomers;
