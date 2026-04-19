// Namespaced ``<domain>.<action>`` event types — one source of truth lives
// in ``backend/app/models/customer_event.py::CustomerEventType``. New
// event types added there should mirror here with a label + colour.
export const EVENT_LABELS: Record<string, string> = {
  // portal.* — admin actions on the portal user itself
  'portal.activated': 'Portal activated',
  'portal.deactivated': 'Portal deactivated',
  'portal.invite_resent': 'Invite resent',
  'portal.password_reset_sent': 'Password reset sent',
  'portal.impersonated': 'Impersonated',
  'portal.merged_from': 'Merged from another account',
  'portal.merged_into': 'Source of merge',
  // training.* — training attendee lifecycle
  'training.registered': 'Registered (training)',
  'training.offer_assigned': 'Assigned via offer',
  'training.parked': 'Parked',
  'training.reassigned': 'Reassigned',
  'training.cancelled': 'Cancelled',
  'training.offer_removed': 'Removed from offer',
  'training.deactivated': 'Attendee deactivated',
  'training.reactivated': 'Attendee reactivated',
  // cfp.* — paper lifecycle (main speaker + cospeakers)
  'cfp.submitted': 'Paper submitted',
  'cfp.accepted': 'Paper accepted',
  'cfp.rejected': 'Paper rejected',
  'cfp.withdrawn': 'Paper withdrawn',
  // registration.* — conference registration lifecycle
  'registration.registered': 'Registered (conference)',
  'registration.cancelled': 'Registration cancelled',
  // Forward-compat stubs — writers land in follow-up PRs, labels ready today.
  'messaging.received': 'Message received',
  'messaging.sent': 'Message sent',
  'billing.invoice_sent': 'Invoice sent',
  'billing.invoice_paid': 'Invoice paid',
};

export const EVENT_COLORS: Record<string, string> = {
  'portal.activated': 'text-green-600 dark:text-green-400',
  'portal.deactivated': 'text-gray-500 dark:text-gray-400',
  'portal.invite_resent': 'text-blue-600 dark:text-blue-400',
  'portal.password_reset_sent': 'text-blue-600 dark:text-blue-400',
  'portal.impersonated': 'text-amber-600 dark:text-amber-400',
  'portal.merged_from': 'text-primary-600 dark:text-primary-400',
  'portal.merged_into': 'text-primary-600 dark:text-primary-400',
  'training.registered': 'text-green-600 dark:text-green-400',
  'training.offer_assigned': 'text-blue-600 dark:text-blue-400',
  'training.parked': 'text-amber-600 dark:text-amber-400',
  'training.reassigned': 'text-primary-600 dark:text-primary-400',
  'training.cancelled': 'text-red-600 dark:text-red-400',
  'training.offer_removed': 'text-gray-500 dark:text-gray-400',
  'training.deactivated': 'text-gray-500 dark:text-gray-400',
  'training.reactivated': 'text-green-600 dark:text-green-400',
  'cfp.submitted': 'text-blue-600 dark:text-blue-400',
  'cfp.accepted': 'text-green-600 dark:text-green-400',
  'cfp.rejected': 'text-red-600 dark:text-red-400',
  'cfp.withdrawn': 'text-gray-500 dark:text-gray-400',
  'registration.registered': 'text-green-600 dark:text-green-400',
  'registration.cancelled': 'text-red-600 dark:text-red-400',
  'messaging.received': 'text-primary-600 dark:text-primary-400',
  'messaging.sent': 'text-primary-600 dark:text-primary-400',
  'billing.invoice_sent': 'text-blue-600 dark:text-blue-400',
  'billing.invoice_paid': 'text-green-600 dark:text-green-400',
};

export const DOMAIN_LABELS: Record<string, string> = {
  portal: 'Portal',
  training: 'Training',
  cfp: 'CFP',
  registration: 'Registration',
  messaging: 'Messaging',
  billing: 'Billing',
};

export const DOMAIN_COLORS: Record<string, string> = {
  portal: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300',
  training: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  cfp: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  registration: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  messaging: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  billing: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
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
