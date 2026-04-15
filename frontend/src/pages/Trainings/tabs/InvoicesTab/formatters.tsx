// eslint-disable-next-line react-refresh/only-export-components
export const formatDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

// eslint-disable-next-line react-refresh/only-export-components
export const formatAmount = (amt: string | number | null | undefined, currency: string | null) => {
  if (amt === null || amt === undefined || amt === '') return '—';
  const num = Number(amt);
  const sym = currency === 'EUR' ? '€' : (currency ?? '');
  const formatted = Math.abs(num).toLocaleString('de-DE', { minimumFractionDigits: 2 });
  return num < 0 ? `-${sym}\u00A0${formatted}` : `${sym}\u00A0${formatted}`;
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  credit_note: 'Credit Note',
};
const TYPE_COLORS: Record<string, string> = {
  bank_transfer: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  credit_card: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
  credit_note: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
};

export function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type;
  const cls = TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}
