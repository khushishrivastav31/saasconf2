export const EVENT_LABELS: Record<string, string> = {
  // Admin actions on the portal user
  portal_activated: 'Portal activated',
  portal_deactivated: 'Portal deactivated',
  invite_resent: 'Invite resent',
  password_reset_sent: 'Password reset sent',
  impersonated: 'Impersonated',
  merged_from: 'Merged from another account',
  merged_into: 'Source of merge',
  // Training attendee events
  registered: 'Registered (training)',
  offer_assigned: 'Assigned via offer',
  parked: 'Parked',
  reassigned: 'Reassigned',
  cancelled: 'Cancelled',
  offer_removed: 'Removed from offer',
  deactivated: 'Attendee deactivated',
  reactivated: 'Attendee reactivated',
};

export const EVENT_COLORS: Record<string, string> = {
  portal_activated: 'text-green-600 dark:text-green-400',
  portal_deactivated: 'text-gray-500 dark:text-gray-400',
  invite_resent: 'text-blue-600 dark:text-blue-400',
  password_reset_sent: 'text-blue-600 dark:text-blue-400',
  impersonated: 'text-amber-600 dark:text-amber-400',
  merged_from: 'text-primary-600 dark:text-primary-400',
  merged_into: 'text-primary-600 dark:text-primary-400',
  registered: 'text-green-600 dark:text-green-400',
  offer_assigned: 'text-blue-600 dark:text-blue-400',
  parked: 'text-amber-600 dark:text-amber-400',
  reassigned: 'text-primary-600 dark:text-primary-400',
  cancelled: 'text-red-600 dark:text-red-400',
  offer_removed: 'text-gray-500 dark:text-gray-400',
  deactivated: 'text-gray-500 dark:text-gray-400',
  reactivated: 'text-green-600 dark:text-green-400',
};

export const SOURCE_LABELS: Record<string, string> = {
  admin: 'Admin',
  training: 'Training',
};

export const SOURCE_COLORS: Record<string, string> = {
  admin: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300',
  training: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
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
