import { createElement, useEffect } from 'react';
import { AlertTriangle, Inbox, X } from 'lucide-react';

export const inputClass = 'w-full rounded-xl border border-white/10 bg-black/35 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-purple-300/50 disabled:opacity-50';
export const selectClass = `${inputClass} appearance-none`;
export const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';
export const subtleButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
export const dangerButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:border-red-300/45 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50';

const badgeStyles = {
  green: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  amber: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
  red: 'border-red-300/25 bg-red-400/10 text-red-100',
  blue: 'border-blue-300/25 bg-blue-400/10 text-blue-100',
  purple: 'border-purple-300/25 bg-purple-400/10 text-purple-100',
  gray: 'border-white/10 bg-white/[0.05] text-gray-300',
};

const statusTones = {
  active: 'green', verified: 'green', fulfilled: 'green', confirmed: 'green', qualified: 'green', assigned: 'green', available: 'green',
  submitted: 'amber', pending: 'amber', manual_required: 'amber', applied: 'amber', reserved: 'amber', processing: 'amber', unpaid: 'gray',
  rejected: 'red', failed: 'red', expired: 'red', void: 'red', archived: 'red', released: 'gray',
  draft: 'gray', inactive: 'gray', not_eligible: 'gray', eligible: 'blue',
  customer: 'gray', support: 'blue', admin: 'purple', super_admin: 'purple',
};

export const Badge = ({ tone, children }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeStyles[tone] ?? badgeStyles.gray}`}>
    {children}
  </span>
);

export const StatusBadge = ({ value }) => (
  <Badge tone={statusTones[value] ?? 'gray'}>{String(value ?? '—').replaceAll('_', ' ')}</Badge>
);

export const AdminCard = ({ title, description, actions, children, className = '' }) => (
  <section className={`rounded-2xl border border-white/10 bg-gray-900/60 p-5 backdrop-blur-xl sm:p-6 ${className}`}>
    {(title || actions) && (
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
          {description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export const StatCard = ({ icon: Icon, label, value, hint, tone = 'purple' }) => (
  <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-4 backdrop-blur-xl sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      {Icon && (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone === 'amber' ? 'border-amber-300/20 bg-amber-500/10 text-amber-200' : 'border-purple-300/20 bg-purple-500/10 text-purple-200'}`}>
          {createElement(Icon, { className: 'h-4 w-4', 'aria-hidden': true })}
        </span>
      )}
    </div>
    <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

export const Field = ({ label, hint, required, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-gray-200">
      {label} {required && <span className="text-purple-300" aria-hidden="true">*</span>}
    </span>
    {children}
    {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
  </label>
);

export const LoadingNote = ({ label = 'Loading…' }) => (
  <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-gray-300">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" aria-hidden="true" />
    {label}
  </div>
);

export const ErrorNote = ({ message, onRetry }) => (
  <div role="alert" className="rounded-xl border border-red-300/20 bg-red-400/[0.06] p-4 text-sm text-red-100">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="leading-relaxed">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-2 rounded-lg border border-red-300/25 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/15">
            Try again
          </button>
        )}
      </div>
    </div>
  </div>
);

export const EmptyNote = ({ icon: Icon = Inbox, title, description }) => (
  <div className="flex flex-col items-center rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center">
    {createElement(Icon, { className: 'h-6 w-6 text-gray-500', 'aria-hidden': true })}
    <p className="mt-3 text-sm font-semibold text-white">{title}</p>
    {description && <p className="mt-1.5 max-w-md text-xs leading-relaxed text-gray-500">{description}</p>}
  </div>
);

export const AdminTable = ({ headers, children, caption }) => (
  <div className="-mx-1 overflow-x-auto px-1">
    <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-sm">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} scope="col" className="border-b border-white/10 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
    </table>
  </div>
);

export const Modal = ({ title, onClose, children, wide = false }) => {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-gray-950 p-5 shadow-2xl shadow-purple-950/30 sm:rounded-2xl sm:p-6 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg border border-white/10 p-2 text-gray-400 transition hover:border-white/25 hover:text-white">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
