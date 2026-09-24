import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { formatDateTime, shortId } from '../../lib/format';
import {
  AdminCard, AdminTable, EmptyNote, ErrorNote, Field, LoadingNote,
  inputClass, primaryButtonClass,
} from '../../components/admin/AdminUI';

// Known functional settings with friendly labels. Unknown keys still render generically.
const KNOWN_SETTINGS = {
  'inventory.low_stock_threshold': { label: 'Low-stock threshold', type: 'number', hint: 'Stock level at or below which admin alerts are raised.' },
  'rewards.enabled': { label: 'Rewards enabled', type: 'boolean', hint: 'Customers earn and redeem loyalty points.' },
  'rewards.earn_points_per_currency_unit': { label: 'Points earned per currency unit', type: 'number', hint: 'Points earned per 1.00 of a verified order.' },
  'rewards.redeem_points_per_currency_unit': { label: 'Points required per currency unit', type: 'number', hint: 'Points needed to discount 1.00 at checkout.' },
  'referrals.enabled': { label: 'Referrals enabled', type: 'boolean', hint: 'Referral codes can be applied and qualified.' },
  'referrals.reward_points': { label: 'Referral reward points', type: 'number', hint: 'Points granted to the referrer per qualified referral.' },
  'referrals.min_qualifying_order_total': { label: 'Referral minimum order total', type: 'number', hint: 'Minimum verified order total for a referral to qualify.' },
};

const AdminSettings = () => {
  const [settings, setSettings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([adminService.listSettings(), adminService.listAuditLog({ limit: 100 })])
      .then(([settingData, auditData]) => {
        setSettings(settingData);
        setAuditLog(auditData);
        setDrafts(Object.fromEntries(settingData.map((setting) => [setting.key, JSON.stringify(setting.value)])));
      })
      .catch((loadError) => setError(loadError.message || 'Settings could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSetting = async (setting) => {
    const known = KNOWN_SETTINGS[setting.key];
    const raw = drafts[setting.key];
    let value;
    try {
      if (known?.type === 'boolean') value = raw === 'true';
      else if (known?.type === 'number') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error('invalid');
        value = parsed;
      } else value = JSON.parse(raw);
    } catch {
      toast.error('Enter a valid value for this setting.');
      return;
    }
    setBusyKey(setting.key);
    try {
      await adminService.saveSetting(setting.key, value);
      toast.success('Setting saved.');
      load();
    } catch (actionError) {
      toast.error(actionError.message || 'The setting could not be saved.');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) return <LoadingNote label="Loading settings…" />;
  if (error) return <ErrorNote message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AdminCard
        title="Store settings"
        description="Database-driven configuration for inventory alerts, rewards, and referrals. Secrets never belong here."
      >
        {settings.length === 0 ? (
          <EmptyNote title="No settings found" description="Apply the Phase 7 migration to create the default configuration keys." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {settings.map((setting) => {
              const known = KNOWN_SETTINGS[setting.key];
              return (
                <div key={setting.key} className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
                  <Field label={known?.label ?? setting.key} hint={known?.hint ?? setting.description ?? undefined}>
                    {known?.type === 'boolean' ? (
                      <select
                        value={drafts[setting.key]}
                        onChange={(event) => setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))}
                        className={`${inputClass} appearance-none`}
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    ) : (
                      <input
                        type={known?.type === 'number' ? 'number' : 'text'}
                        step="any"
                        min="0"
                        value={drafts[setting.key] ?? ''}
                        onChange={(event) => setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))}
                        className={inputClass}
                      />
                    )}
                  </Field>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] text-gray-600">{setting.key}{setting.is_public ? ' · public' : ''}</span>
                    <button
                      type="button"
                      onClick={() => saveSetting(setting)}
                      disabled={busyKey === setting.key}
                      className={primaryButtonClass}
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" /> {busyKey === setting.key ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      <AdminCard
        title="Audit log"
        description="Privileged catalog, payment-method, coupon, role, inventory, and settings changes with actor and timestamp. Digital delivery payloads are never logged."
      >
        {auditLog.length === 0 ? (
          <EmptyNote title="No audit entries yet" description="Privileged actions appear here as they happen." />
        ) : (
          <AdminTable headers={['When', 'Actor', 'Action', 'Entity']} caption="Admin audit log">
            {auditLog.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{formatDateTime(entry.created_at)}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{entry.actor_id ? shortId(entry.actor_id) : 'system'}</td>
                <td className="px-3 py-2.5 text-gray-200">{entry.action.replaceAll('_', ' ')}</td>
                <td className="px-3 py-2.5 text-xs text-gray-400">{entry.entity_type}{entry.entity_id ? ` · ${shortId(entry.entity_id)}` : ''}</td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
};

export default AdminSettings;
