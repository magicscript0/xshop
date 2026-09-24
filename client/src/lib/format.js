export const formatMoney = (amount, currency) => {
  if (amount == null || !currency || !Number.isFinite(Number(amount))) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
};

export const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return String(value);
  }
};

export const shortId = (value) => (typeof value === 'string' && value.length > 12 ? `${value.slice(0, 8)}…` : value ?? '—');

export const formatNumber = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return '0';
  return new Intl.NumberFormat(undefined).format(Number(value));
};
