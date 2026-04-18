export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  parked: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export const EVENT_LABELS: Record<string, string> = {
  registered: 'Registered',
  offer_assigned: 'Assigned (Offer)',
  parked: 'Parked',
  reassigned: 'Reassigned',
  cancelled: 'Cancelled',
  offer_removed: 'Removed (Offer)',
  deactivated: 'Deactivated',
  reactivated: 'Reactivated',
  portal_activated: 'Portal Activated',
  portal_deactivated: 'Portal Deactivated',
};

export const EVENT_COLORS: Record<string, string> = {
  registered: 'text-green-600 dark:text-green-400',
  offer_assigned: 'text-blue-600 dark:text-blue-400',
  parked: 'text-amber-600 dark:text-amber-400',
  reassigned: 'text-primary-600 dark:text-primary-400',
  cancelled: 'text-red-600 dark:text-red-400',
  offer_removed: 'text-gray-500 dark:text-gray-400',
  deactivated: 'text-gray-500 dark:text-gray-400',
  reactivated: 'text-green-600 dark:text-green-400',
  portal_activated: 'text-green-600 dark:text-green-400',
  portal_deactivated: 'text-gray-500 dark:text-gray-400',
};

export const REG_STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  waitlisted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
};

export const formatDate = (d: string | null): string =>
  d
    ? new Date(d).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

export const formatDateTime = (d: string | null): string =>
  d
    ? new Date(d).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const formatCurrency = (amount: string | null, currency: string | null): string => {
  if (!amount) return '—';
  const num = parseFloat(amount);
  const cur = currency || 'EUR';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur }).format(num);
};
