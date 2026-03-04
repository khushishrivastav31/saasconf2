import type {
  AttendeeData,
  BillingProfileCreate,
  BookingPeriod,
  UnifiedAttendeeData,
} from '../../../../types';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<string, string> = {
  registered_pending_invoice: 'Pending Invoice',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<string, string> = {
  registered_pending_invoice:
    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  invoiced: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
};

export const MODE_LABELS: Record<string, string> = {
  individual: 'Single',
  company_single: 'Single',
  company_bulk: 'Group',
};

// ---------------------------------------------------------------------------
// Price helper – find the current active period price for an option
// ---------------------------------------------------------------------------

export function getCurrentPrice(
  optionId: string,
  periods: BookingPeriod[]
): { price: number; currency: string | null; periodName: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  const active = periods.find((p) => p.is_active && p.start_date <= today && p.end_date >= today);
  if (!active || !active.prices) return null;
  const price = active.prices[optionId];
  if (price == null) return null;
  return { price, currency: active.currency, periodName: active.name };
}

export function formatPrice(price: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price);
    } catch {
      return `${price.toFixed(2)} ${currency}`;
    }
  }
  return price.toFixed(2);
}

// ---------------------------------------------------------------------------
// Empty form factories
// ---------------------------------------------------------------------------

export const emptyAttendee: AttendeeData = {
  first_name: '',
  last_name: '',
  email: '',
  pronouns: '',
  job_title: '',
  department: '',
  phone: '',
};

export const emptyBilling: BillingProfileCreate = {
  company_name: '',
  street: '',
  postal_code: '',
  city: '',
  country: '',
  contact_first_name: '',
  contact_last_name: '',
  contact_phone: '',
  contact_email: '',
  vat_number: '',
  procurement_code: '',
};

export const emptyUnifiedAttendee: UnifiedAttendeeData = {
  ...emptyAttendee,
  booking_option_id: '',
};
