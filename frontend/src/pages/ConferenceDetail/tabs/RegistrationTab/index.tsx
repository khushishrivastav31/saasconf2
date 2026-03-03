import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { COUNTRY_OPTIONS } from '../../../../config/countries';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import type {
  Conference,
  Registration,
  RegistrationListResponse,
  RegistrationUpdate,
  UnifiedAttendeeData,
  UnifiedRegistrationCreate,
  UnifiedRegistrationResponse,
  BillingProfileCreate,
  AttendeeData,
  RegistrationItemCreate,
  RegistrationItem,
  BookingOption,
  BookingPeriod,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { ErrorBanner, SuccessBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner, ButtonSpinner } from '../../../../components/common/LoadingSpinner';
import { OptionSessions } from './SessionSelector';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  registered_pending_invoice: 'Pending Invoice',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  registered_pending_invoice:
    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  invoiced: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
};

const MODE_LABELS: Record<string, string> = {
  individual: 'Single',
  company_single: 'Single',
  company_bulk: 'Group',
};

// (RegistrationModeType removed — unified flow replaces single/group toggle)

// ---------------------------------------------------------------------------
// Price helper – find the current active period price for an option
// ---------------------------------------------------------------------------

function getCurrentPrice(
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

function formatPrice(price: number, currency: string | null): string {
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

const emptyAttendee: AttendeeData = {
  first_name: '',
  last_name: '',
  email: '',
  pronouns: '',
  job_title: '',
  department: '',
  phone: '',
};

const emptyBilling: BillingProfileCreate = {
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

const emptyUnifiedAttendee: UnifiedAttendeeData = {
  ...emptyAttendee,
  booking_option_id: '',
};

// ---------------------------------------------------------------------------
// Booking option select component (with description + price)
// ---------------------------------------------------------------------------

function BookingOptionSelect({
  options,
  periods,
  value,
  onChange,
  conferenceId,
  sessionSelections,
  onSessionChange,
}: {
  options: BookingOption[];
  periods: BookingPeriod[];
  value: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
  id?: string;
  conferenceId?: string;
  sessionSelections?: Record<string, string>;
  onSessionChange?: (selections: Record<string, string>) => void;
}) {
  const activeOptions = options.filter((o) => o.is_active);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {activeOptions.map((o) => {
        const isSelected = value.includes(o.id);
        const priceInfo = getCurrentPrice(o.id, periods);
        return (
          <div
            key={o.id}
            className={`relative flex flex-col items-start text-left rounded-lg border-2 p-4 transition-all ${
              isSelected
                ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {/* Clickable header area */}
            <button
              type="button"
              onClick={() => toggle(o.id)}
              className="w-full flex flex-col items-start text-left"
            >
              {/* Selection indicator (checkbox style) */}
              <span
                className={`absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded border-2 ${
                  isSelected
                    ? 'border-primary-600 bg-primary-600'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                }`}
              >
                {isSelected && (
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                  </svg>
                )}
              </span>

              {/* Name + price */}
              <span
                className={`text-sm font-semibold pr-6 ${isSelected ? 'text-primary-900' : 'text-gray-900 dark:text-gray-100'}`}
              >
                {o.name}
              </span>
              {priceInfo && (
                <span
                  className={`mt-1 text-sm font-medium ${isSelected ? 'text-primary-700' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  {formatPrice(priceInfo.price, priceInfo.currency)}
                  <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">
                    ({priceInfo.periodName})
                  </span>
                </span>
              )}

              {/* Description */}
              {o.description && (
                <span className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {o.description}
                </span>
              )}
            </button>

            {/* Session selectors inside the card */}
            {isSelected &&
              conferenceId &&
              o.conference_day_id &&
              sessionSelections &&
              onSessionChange && (
                <OptionSessions
                  conferenceId={conferenceId}
                  optionId={o.id}
                  selections={sessionSelections}
                  onChange={onSessionChange}
                />
              )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AttendeeFields({
  data,
  onChange,
  conferenceId,
  prefix,
}: {
  data: AttendeeData;
  onChange: (d: AttendeeData) => void;
  conferenceId: string;
  prefix?: string;
}) {
  const p = prefix ? `${prefix}-` : '';

  const { data: pronounOptions } = useQuery({
    queryKey: queryKeys.settings.pronounOptions(conferenceId),
    queryFn: async () => {
      const res = await api.get<{ id: string; name: string }[]>(
        `/conferences/${conferenceId}/settings/pronouns`
      );
      return res.data;
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label
          htmlFor={`${p}first_name`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          First Name *
        </label>
        <input
          id={`${p}first_name`}
          type="text"
          required
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.first_name}
          onChange={(e) => onChange({ ...data, first_name: e.target.value })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}last_name`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Last Name *
        </label>
        <input
          id={`${p}last_name`}
          type="text"
          required
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.last_name}
          onChange={(e) => onChange({ ...data, last_name: e.target.value })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}email`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Email *
        </label>
        <input
          id={`${p}email`}
          type="email"
          required
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.email}
          onChange={(e) => onChange({ ...data, email: e.target.value })}
        />
      </div>
      {pronounOptions && pronounOptions.length > 0 && (
        <div>
          <label
            htmlFor={`${p}pronouns`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Pronouns
          </label>
          <select
            id={`${p}pronouns`}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.pronouns || ''}
            onChange={(e) => onChange({ ...data, pronouns: e.target.value || null })}
          >
            <option value="">Select pronouns...</option>
            {pronounOptions.map((opt) => (
              <option key={opt.id} value={opt.name}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label
          htmlFor={`${p}phone`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Phone
        </label>
        <input
          id={`${p}phone`}
          type="text"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.phone || ''}
          onChange={(e) => onChange({ ...data, phone: e.target.value || null })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}job_title`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Job Title
        </label>
        <input
          id={`${p}job_title`}
          type="text"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.job_title || ''}
          onChange={(e) => onChange({ ...data, job_title: e.target.value || null })}
        />
      </div>
      <div>
        <label
          htmlFor={`${p}department`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Department
        </label>
        <input
          id={`${p}department`}
          type="text"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          value={data.department || ''}
          onChange={(e) => onChange({ ...data, department: e.target.value || null })}
        />
      </div>
    </div>
  );
}

function BillingFields({
  data,
  onChange,
}: {
  data: BillingProfileCreate;
  onChange: (d: BillingProfileCreate) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label
            htmlFor="company_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Company Name
          </label>
          <input
            id="company_name"
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.company_name || ''}
            onChange={(e) => onChange({ ...data, company_name: e.target.value || null })}
          />
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="street"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Street *
          </label>
          <input
            id="street"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.street}
            onChange={(e) => onChange({ ...data, street: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="postal_code"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Postal Code *
          </label>
          <input
            id="postal_code"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.postal_code}
            onChange={(e) => onChange({ ...data, postal_code: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="city"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            City *
          </label>
          <input
            id="city"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.city}
            onChange={(e) => onChange({ ...data, city: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="country"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Country *
          </label>
          <select
            id="country"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.country}
            onChange={(e) => {
              onChange({ ...data, country: e.target.value, vat_validated: null });
            }}
          >
            <option value="">Select a country</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <VatNumberInput
            value={data.vat_number || ''}
            onChange={(val) => onChange({ ...data, vat_number: val || null, vat_validated: null })}
            onValidationResult={(valid) => onChange({ ...data, vat_validated: valid })}
            country={data.country}
          />
        </div>
      </div>

      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">
        Contact Person
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="contact_first_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            First Name *
          </label>
          <input
            id="contact_first_name"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.contact_first_name}
            onChange={(e) => onChange({ ...data, contact_first_name: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="contact_last_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Last Name *
          </label>
          <input
            id="contact_last_name"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.contact_last_name}
            onChange={(e) => onChange({ ...data, contact_last_name: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="contact_phone"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Phone *
          </label>
          <input
            id="contact_phone"
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.contact_phone}
            onChange={(e) => onChange({ ...data, contact_phone: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="contact_email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email *
          </label>
          <input
            id="contact_email"
            type="email"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.contact_email}
            onChange={(e) => onChange({ ...data, contact_email: e.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor="procurement_code"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Procurement / PO Code
          </label>
          <input
            id="procurement_code"
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={data.procurement_code || ''}
            onChange={(e) => onChange({ ...data, procurement_code: e.target.value || null })}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Tab
// ---------------------------------------------------------------------------

export default function RegistrationTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Create form state (unified — always an array of attendees)
  const [showCreate, setShowCreate] = useState(false);
  const [attendees, setAttendees] = useState<UnifiedAttendeeData[]>([{ ...emptyUnifiedAttendee }]);
  const [attendeeOptionIds, setAttendeeOptionIds] = useState<string[][]>([[]]);
  const [attendeeSessionSelections, setAttendeeSessionSelections] = useState<
    Record<string, string>[]
  >([{}]);
  const [billing, setBilling] = useState<BillingProfileCreate>({ ...emptyBilling });

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Registration | null>(null);

  // Add item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemType, setAddItemType] = useState<'booking_option' | 'tutorial'>('booking_option');
  const [addItemOptionId, setAddItemOptionId] = useState('');

  // ---- Queries ----

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.registrations.byConference(conference.id, page, search, statusFilter),
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await api.get<RegistrationListResponse>(
        `/conferences/${conference.id}/registrations`,
        { params }
      );
      return response.data;
    },
  });

  const { data: optionsData } = useQuery({
    queryKey: queryKeys.booking.options(conference.id),
    queryFn: async () => {
      const response = await api.get<{ items: BookingOption[]; total: number }>(
        `/conferences/${conference.id}/settings/booking-options`
      );
      return response.data.items;
    },
  });

  const { data: periodsData } = useQuery({
    queryKey: queryKeys.booking.periods(conference.id),
    queryFn: async () => {
      const response = await api.get<{ items: BookingPeriod[]; total: number }>(
        `/conferences/${conference.id}/settings/booking-periods`
      );
      return response.data.items;
    },
  });

  const options = useMemo(() => optionsData || [], [optionsData]);
  const periods = useMemo(() => periodsData || [], [periodsData]);
  const selectedReg = data?.items?.find((r) => r.id === selectedId);

  // ---- Mutations ----

  const createMutation = useMutation({
    mutationFn: async (payload: UnifiedRegistrationCreate) => {
      const response = await api.post<UnifiedRegistrationResponse>(
        `/conferences/${conference.id}/registrations`,
        payload
      );
      return response.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      resetCreateForm();
      if (res.total_created === 1) {
        const reg = res.registrations[0];
        setSuccess(`Registration created for ${reg.first_name} ${reg.last_name}`);
        setSelectedId(reg.id);
      } else {
        setSuccess(`${res.total_created} registration(s) created successfully`);
      }
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to create registration')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: d }: { id: string; data: RegistrationUpdate }) => {
      const response = await api.put<Registration>(
        `/conferences/${conference.id}/registrations/${id}`,
        d
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      setSuccess('Registration updated');
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to update registration')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/registrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      setDeleteTarget(null);
      setSelectedId(null);
      setSuccess('Registration deleted');
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to delete registration')),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ regId, data: d }: { regId: string; data: RegistrationItemCreate }) => {
      const response = await api.post<RegistrationItem>(
        `/conferences/${conference.id}/registrations/${regId}/items`,
        d
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      setShowAddItem(false);
      setAddItemOptionId('');
      setSuccess('Item added to registration');
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to add item')),
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ regId, itemId }: { regId: string; itemId: string }) => {
      await api.delete(`/conferences/${conference.id}/registrations/${regId}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      setSuccess('Item removed');
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to remove item')),
  });

  // ---- Handlers ----

  function resetCreateForm() {
    setShowCreate(false);
    setAttendees([{ ...emptyUnifiedAttendee }]);
    setAttendeeOptionIds([[]]);
    setAttendeeSessionSelections([{}]);
    setBilling({ ...emptyBilling });
    setError(null);
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const mergedAttendees: UnifiedAttendeeData[] = attendees.map((a, idx) => {
      const ids = attendeeOptionIds[idx] || [];
      const addOnItems: RegistrationItemCreate[] = ids.slice(1).map((id) => ({
        item_type: 'booking_option' as const,
        booking_option_id: id,
      }));
      const tutorialItems: RegistrationItemCreate[] = Object.values(
        attendeeSessionSelections[idx] || {}
      )
        .filter(Boolean)
        .map((sessionId) => ({
          item_type: 'tutorial' as const,
          program_session_id: sessionId,
        }));
      const items = [...addOnItems, ...tutorialItems];
      return {
        ...a,
        booking_option_id: ids[0] || '',
        items: items.length ? items : undefined,
      };
    });

    const validAttendees = mergedAttendees.filter(
      (a) => a.first_name && a.last_name && a.email && a.booking_option_id
    );
    if (validAttendees.length === 0) {
      setError('Please fill in all required fields for at least one attendee');
      return;
    }

    createMutation.mutate({
      billing,
      attendees: validAttendees,
    });
  }

  function handleAddItem() {
    if (!selectedId || !addItemOptionId) return;
    const payload: RegistrationItemCreate = {
      item_type: addItemType,
      booking_option_id: addItemType === 'booking_option' ? addItemOptionId : undefined,
      program_session_id: addItemType === 'tutorial' ? addItemOptionId : undefined,
    };
    addItemMutation.mutate({ regId: selectedId, data: payload });
  }

  const isCreating = createMutation.isPending;

  // ---- Detail view ----
  if (selectedId && selectedReg) {
    return (
      <div>
        <button
          onClick={() => {
            setSelectedId(null);
            setSuccess(null);
          }}
          className="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to list
        </button>

        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedReg.first_name} {selectedReg.last_name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedReg.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  STATUS_COLORS[selectedReg.status] ||
                  'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                }`}
              >
                {STATUS_LABELS[selectedReg.status] || selectedReg.status}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {MODE_LABELS[selectedReg.registration_mode] || selectedReg.registration_mode}
              </span>
            </div>
          </div>

          {/* Attendee info */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 text-sm">
            {selectedReg.phone && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Phone:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{selectedReg.phone}</span>
              </div>
            )}
            {selectedReg.job_title && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Job Title:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{selectedReg.job_title}</span>
              </div>
            )}
            {selectedReg.department && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Department:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{selectedReg.department}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500 dark:text-gray-400">Booking Option:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">
                {selectedReg.booking_option_name || '\u2014'}
              </span>
            </div>
            {selectedReg.billing_company_name && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Company:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">
                  {selectedReg.billing_company_name}
                </span>
              </div>
            )}
            {selectedReg.notes && (
              <div className="col-span-full">
                <span className="text-gray-500 dark:text-gray-400">Notes:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{selectedReg.notes}</span>
              </div>
            )}
          </div>

          {/* Status update */}
          {isAdmin && (
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Status:
              </label>
              <select
                className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={selectedReg.status}
                onChange={(e) => {
                  setError(null);
                  setSuccess(null);
                  updateMutation.mutate({
                    id: selectedReg.id,
                    data: { status: e.target.value as RegistrationUpdate['status'] },
                  });
                }}
              >
                <option value="registered_pending_invoice">Pending Invoice</option>
                <option value="invoiced">Invoiced</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div className="flex-1" />
              <button
                onClick={() => setDeleteTarget(selectedReg)}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
              >
                Delete Registration
              </button>
            </div>
          )}

          {/* Add-on items */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Add-on Items
              </h4>
              {isAdmin && (
                <button
                  onClick={() => setShowAddItem(!showAddItem)}
                  className="text-sm text-primary-600 hover:text-primary-800"
                >
                  {showAddItem ? 'Cancel' : '+ Add Item'}
                </button>
              )}
            </div>

            {showAddItem && (
              <div className="flex items-end gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <select
                    className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm"
                    value={addItemType}
                    onChange={(e) => {
                      setAddItemType(e.target.value as 'booking_option' | 'tutorial');
                      setAddItemOptionId('');
                    }}
                  >
                    <option value="booking_option">Booking Option</option>
                    <option value="tutorial">Tutorial</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {addItemType === 'booking_option' ? 'Option' : 'Tutorial Session'}
                  </label>
                  {addItemType === 'booking_option' ? (
                    <select
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm"
                      value={addItemOptionId}
                      onChange={(e) => setAddItemOptionId(e.target.value)}
                    >
                      <option value="">Select option...</option>
                      {options
                        .filter((o) => o.is_active)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Tutorial will be assigned as pending"
                      disabled
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 sm:text-sm"
                    />
                  )}
                </div>
                <button
                  onClick={handleAddItem}
                  disabled={addItemType === 'booking_option' && !addItemOptionId}
                  className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}

            {selectedReg.items.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No add-on items</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {selectedReg.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {item.item_name}
                      </span>
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                        {item.item_type === 'tutorial' ? 'Tutorial' : 'Option'}
                      </span>
                      {item.pending && (
                        <span className="ml-2 text-xs text-yellow-600">(pending)</span>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() =>
                          removeItemMutation.mutate({
                            regId: selectedReg.id,
                            itemId: item.id,
                          })
                        }
                        className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          title="Delete Registration"
          message={`Are you sure you want to delete the registration for ${deleteTarget?.first_name} ${deleteTarget?.last_name}?`}
          onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    );
  }

  // ---- Create form ----
  if (showCreate) {
    return (
      <div>
        <button
          onClick={resetCreateForm}
          className="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to list
        </button>

        <ErrorBanner message={error} />

        <form onSubmit={handleCreateSubmit} className="space-y-6">
          {/* Attendee(s) */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              New Registration
            </h3>

            {attendees.map((att, idx) => (
              <div
                key={idx}
                className={
                  attendees.length > 1
                    ? 'mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700'
                    : ''
                }
              >
                {attendees.length > 1 && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      Attendee {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttendees(attendees.filter((_, i) => i !== idx));
                        setAttendeeOptionIds(attendeeOptionIds.filter((_, i) => i !== idx));
                        setAttendeeSessionSelections(
                          attendeeSessionSelections.filter((_, i) => i !== idx)
                        );
                      }}
                      className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {attendees.length === 1 && (
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Attendee
                  </h4>
                )}

                <AttendeeFields
                  prefix={attendees.length > 1 ? `att-${idx}` : undefined}
                  data={att}
                  conferenceId={conference.id}
                  onChange={(d) => {
                    const updated = [...attendees];
                    updated[idx] = { ...updated[idx], ...d };
                    setAttendees(updated);
                  }}
                />

                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Booking Option *
                  </label>
                  <BookingOptionSelect
                    options={options}
                    periods={periods}
                    value={attendeeOptionIds[idx] || []}
                    onChange={(ids) => {
                      const updated = [...attendeeOptionIds];
                      updated[idx] = ids;
                      setAttendeeOptionIds(updated);
                      const updatedSessions = [...attendeeSessionSelections];
                      updatedSessions[idx] = {};
                      setAttendeeSessionSelections(updatedSessions);
                    }}
                    conferenceId={conference.id}
                    sessionSelections={attendeeSessionSelections[idx] || {}}
                    onSessionChange={(sel: Record<string, string>) => {
                      const updated = [...attendeeSessionSelections];
                      updated[idx] = sel;
                      setAttendeeSessionSelections(updated);
                    }}
                    required
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setAttendees([...attendees, { ...emptyUnifiedAttendee }]);
                setAttendeeOptionIds([...attendeeOptionIds, []]);
                setAttendeeSessionSelections([...attendeeSessionSelections, {}]);
              }}
              className="mt-4 text-sm text-primary-600 hover:text-primary-800"
            >
              + Add Another Attendee
            </button>
          </div>

          {/* Billing section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Billing Information
            </h4>
            <BillingFields data={billing} onChange={setBilling} />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={resetCreateForm}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
            >
              {isCreating ? (
                <ButtonSpinner label="Creating..." />
              ) : attendees.length > 1 ? (
                `Register ${attendees.length} Attendees`
              ) : (
                'Register Attendee'
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---- List view ----
  return (
    <div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name or email..."
            className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="registered_pending_invoice">Pending Invoice</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setShowCreate(true);
              setError(null);
              setSuccess(null);
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            + New Registration
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner />
      ) : !data?.items?.length ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium">No registrations yet</p>
          <p className="text-sm mt-1">Create your first registration to get started.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Booking Option
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Mode
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Items
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data.items.map((reg) => (
                  <tr
                    key={reg.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                      setSelectedId(reg.id);
                      setError(null);
                      setSuccess(null);
                    }}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {reg.first_name} {reg.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {reg.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {reg.booking_option_name || '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {reg.billing_company_name || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[reg.status] ||
                          'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {STATUS_LABELS[reg.status] || reg.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                      {MODE_LABELS[reg.registration_mode] || reg.registration_mode}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {reg.items.length > 0 ? reg.items.length : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex justify-between items-center mt-4 text-sm text-gray-500 dark:text-gray-400">
              <span>
                Page {data.page} of {data.pages} ({data.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Previous
                </button>
                <button
                  disabled={page >= data.pages}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Registration"
        message={`Are you sure you want to delete the registration for ${deleteTarget?.first_name} ${deleteTarget?.last_name}?`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
