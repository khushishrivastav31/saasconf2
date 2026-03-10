import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type {
  Conference,
  Invoice,
  Registration,
  RegistrationListResponse,
  UnifiedAttendeeData,
  UnifiedRegistrationCreate,
  UnifiedRegistrationResponse,
  BillingProfileCreate,
  RegistrationItemCreate,
  RegistrationItem,
  BookingOption,
  BookingPeriod,
  DiscountCodeValidation,
  VatCalculation,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { ErrorBanner, SuccessBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner, ButtonSpinner } from '../../../../components/common/LoadingSpinner';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  MODE_LABELS,
  emptyBilling,
  emptyUnifiedAttendee,
} from './helpers';
import AttendeeFields from './AttendeeFields';
import BillingFields from './BillingFields';
import BookingOptionSelect from './BookingOptionSelect';
import { OptionSessions } from './SessionSelector';
import ReplaceAttendeeModal from '../../../../components/modals/ReplaceAttendeeModal';
import OrderSummary from '../../../PublicRegistration/components/OrderSummary';
import type {
  PortalAttendee,
  PublicBookingPeriod,
  PublicBookingOption,
} from '../../../../types/publicRegistration';

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
  // Map: optionId -> session selections for that option
  const [attendeeSessionSelections, setAttendeeSessionSelections] = useState<
    Record<string, Record<string, string>>[]
  >([{}]);
  const [billing, setBilling] = useState<BillingProfileCreate>({ ...emptyBilling });

  // Discount code validation state
  const [discountValidation, setDiscountValidation] = useState<DiscountCodeValidation | null>(null);

  // VAT calculation state
  const [vatCalculation, setVatCalculation] = useState<VatCalculation | null>(null);

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Registration | null>(null);

  // Replace attendee state
  const [replaceTarget, setReplaceTarget] = useState<Registration | null>(null);

  // Debug logging for replaceTarget state changes
  useEffect(() => {
    console.log('replaceTarget state changed:', replaceTarget);
  }, [replaceTarget]);

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

  // Fetch invoices for registrations to display invoice numbers
  const { data: invoicesData } = useQuery({
    queryKey: [...queryKeys.invoices.byConference(conference.id), 'registration'],
    queryFn: async () => {
      const response = await api.get<{ items: Invoice[]; total: number }>(
        `/conferences/${conference.id}/invoices`,
        { params: { recipient_source_type: 'registration', page_size: 100 } }
      );
      return response.data;
    },
    enabled: data !== undefined, // Only fetch invoices after registrations are loaded
  });

  const options = useMemo(() => optionsData || [], [optionsData]);
  const periods = useMemo(() => periodsData || [], [periodsData]);
  const selectedReg = data?.items?.find((r) => r.id === selectedId);

  // Map invoice data by billing_profile_id
  const invoiceMap = useMemo(() => {
    const map: Record<string, { number: string; id: string }> = {};
    if (invoicesData?.items) {
      invoicesData.items.forEach((inv) => {
        if (inv.recipient_source_id && inv.invoice_number && inv.id) {
          map[inv.recipient_source_id] = { number: inv.invoice_number, id: inv.id };
        }
      });
    }
    return map;
  }, [invoicesData]);

  // ---- Effects for discount and VAT calculation ----

  // Discount validation hook - debounced
  useEffect(() => {
    const validateDiscount = async (code: string) => {
      try {
        const response = await api.get<DiscountCodeValidation>(
          `/conferences/${conference.id}/registrations/validate-discount/${encodeURIComponent(code.trim())}`
        );
        setDiscountValidation(response.data);
      } catch {
        setDiscountValidation({
          valid: false,
          message: 'Error validating code',
        } as DiscountCodeValidation);
      }
    };

    const timer = setTimeout(() => {
      if (billing.discount_code && billing.discount_code.trim()) {
        validateDiscount(billing.discount_code);
      } else {
        setDiscountValidation(null);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [billing.discount_code, conference.id]);

  // VAT calculation hook
  useEffect(() => {
    const calculateVat = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const activePeriod = periods.find(
        (p) => p.is_active && p.start_date <= today && p.end_date >= today
      );

      if (!activePeriod) {
        setVatCalculation(null);
        return;
      }

      let subtotal = 0;
      attendees.forEach((_, idx) => {
        const selectedOptions = attendeeOptionIds[idx] || [];
        selectedOptions.forEach((optionId) => {
          const price = Number(activePeriod.prices?.[optionId] || 0);

          if (discountValidation?.valid) {
            const applies =
              (!discountValidation.applicable_option_ids ||
                discountValidation.applicable_option_ids.length === 0 ||
                discountValidation.applicable_option_ids.includes(optionId)) &&
              (!discountValidation.applicable_period_ids ||
                discountValidation.applicable_period_ids.length === 0 ||
                discountValidation.applicable_period_ids.includes(activePeriod.id));

            if (applies) {
              const discountValue = discountValidation.discount_value || 0;
              const discountAmount =
                discountValidation.discount_type === 'percentage'
                  ? (price * discountValue) / 100
                  : Math.min(discountValue, price);
              subtotal += price - discountAmount;
            } else {
              subtotal += price;
            }
          } else {
            subtotal += price;
          }
        });
      });

      if (!billing.country || subtotal === 0) {
        setVatCalculation(null);
        return;
      }

      try {
        const response = await api.post<VatCalculation>(
          `/conferences/${conference.id}/registrations/calculate-vat`,
          {
            country: billing.country,
            vat_number: billing.vat_number || null,
            subtotal,
          }
        );
        setVatCalculation(response.data);
      } catch (err) {
        console.error('VAT calculation failed:', err);
        setVatCalculation(null);
      }
    };

    const timer = setTimeout(() => {
      calculateVat();
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    billing.country,
    billing.vat_number,
    attendeeOptionIds,
    discountValidation,
    periods,
    attendees.length,
    conference.id,
  ]);

  // Convert admin types to public types for OrderSummary component
  const publicBookingOptions: PublicBookingOption[] = useMemo(() => {
    return options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      description: opt.description || '',
      price: 0, // Price comes from period
      capacity: null,
      current_registrations: 0,
      is_sold_out: false,
      conference_day_id: opt.conference_day_id,
    }));
  }, [options]);

  const publicBookingPeriods: PublicBookingPeriod[] = useMemo(() => {
    return periods.map((period) => ({
      id: period.id,
      name: period.name,
      start_date: period.start_date,
      end_date: period.end_date,
      prices: period.prices || {},
      sort_order: period.sort_order,
    }));
  }, [periods]);

  const portalAttendees: PortalAttendee[] = useMemo(() => {
    return attendees.map((att, idx) => ({
      first_name: att.first_name,
      last_name: att.last_name,
      email: att.email,
      phone: att.phone || '',
      job_title: att.job_title || '',
      department: att.department || '',
      pronouns: att.pronouns || '',
      booking_option_ids: attendeeOptionIds[idx] || [],
      items: [],
    }));
  }, [attendees, attendeeOptionIds]);

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
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
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

  const updateItemSessionMutation = useMutation({
    mutationFn: async ({
      regId,
      itemId,
      sessionId,
    }: {
      regId: string;
      itemId: string;
      sessionId: string | null;
    }) => {
      const response = await api.patch(
        `/conferences/${conference.id}/registrations/${regId}/items/${itemId}`,
        { program_session_id: sessionId }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      setSuccess('Session updated');
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to update session')),
  });

  const updateMainSessionMutation = useMutation({
    mutationFn: async ({ regId, sessionId }: { regId: string; sessionId: string | null }) => {
      const response = await api.put(`/conferences/${conference.id}/registrations/${regId}`, {
        main_session_id: sessionId,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      setSuccess('Tutorial selection updated');
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to update tutorial selection')),
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
      const sessionMap = attendeeSessionSelections[idx] || {};

      // Extract main session ID (for first booking option)
      const mainSessionId =
        ids[0] && sessionMap[ids[0]] ? Object.values(sessionMap[ids[0]]).find(Boolean) : undefined;

      // Create items ONLY for add-ons (skip index 0)
      const items: RegistrationItemCreate[] = [];

      ids.forEach((optionId, optionIdx) => {
        // FIXED: Only create RegistrationItems for ADD-ONS (idx > 0), not main booking
        if (optionIdx > 0) {
          const sessionSelections = sessionMap[optionId];
          const sessionId = sessionSelections
            ? Object.values(sessionSelections).find(Boolean)
            : undefined;

          items.push({
            item_type: 'booking_option' as const,
            booking_option_id: optionId,
            program_session_id: sessionId || undefined,
          });
        }
      });

      return {
        ...a,
        booking_option_id: ids[0] || '',
        main_session_id: mainSessionId, // NEW: Pass main session directly
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
            {selectedReg.billing_company_name && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Company:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">
                  {selectedReg.billing_company_name}
                </span>
              </div>
            )}
            <div>
              <span className="text-gray-500 dark:text-gray-400">Invoice:</span>{' '}
              {invoiceMap[selectedReg.billing_profile_id] ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Navigate to invoices tab with invoice ID in URL
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'invoices');
                    url.searchParams.set('invoice', invoiceMap[selectedReg.billing_profile_id].id);
                    window.location.href = url.toString();
                  }}
                  className="text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {invoiceMap[selectedReg.billing_profile_id].number}
                </button>
              ) : (
                <span className="text-gray-900 dark:text-gray-100">\u2014</span>
              )}
            </div>
            {selectedReg.notes && (
              <div className="col-span-full">
                <span className="text-gray-500 dark:text-gray-400">Notes:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{selectedReg.notes}</span>
              </div>
            )}
          </div>

          {/* Status (read-only, determined by invoice) */}
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                STATUS_COLORS[selectedReg.status] ||
                'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
              }`}
            >
              {STATUS_LABELS[selectedReg.status] || selectedReg.status}
            </span>
            <div className="flex-1" />
            {isAdmin && (
              <div className="flex items-center gap-2">
                {(selectedReg.status === 'invoiced' || selectedReg.status === 'paid') && (
                  <button
                    onClick={() => {
                      console.log('Replace Attendee clicked', selectedReg);
                      setReplaceTarget(selectedReg);
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    Replace Attendee
                  </button>
                )}
                {selectedReg.status === 'registered_pending_invoice' && (
                  <button
                    onClick={() => setDeleteTarget(selectedReg)}
                    className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Delete Registration
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Main booking option with session selection */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Main Booking Option
            </h4>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                  {selectedReg.booking_option_name || 'Unknown option'}
                </span>
              </div>
              {/* Session selector */}
              {isAdmin && selectedReg.booking_option_id && (
                <OptionSessions
                  conferenceId={conference.id}
                  optionId={selectedReg.booking_option_id}
                  selections={{}}
                  selectedSessionId={selectedReg.main_session_id}
                  onChange={(selections) => {
                    const sessionId = Object.values(selections).find(Boolean) || null;
                    updateMainSessionMutation.mutate({
                      regId: selectedReg.id,
                      sessionId,
                    });
                  }}
                  compact={true}
                />
              )}
            </div>
          </div>

          {/* Add-on items */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Add-on Items
              </h4>
              {isAdmin && selectedReg.status === 'registered_pending_invoice' && (
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
              <p className="text-sm text-gray-400 dark:text-gray-500">No items</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {[...selectedReg.items]
                  .sort((a, b) => {
                    const optMap: Record<string, number> = {};
                    options.forEach((o) => (optMap[o.id] = o.sort_order));
                    const sortA = a.booking_option_id ? (optMap[a.booking_option_id] ?? 999) : 999;
                    const sortB = b.booking_option_id ? (optMap[b.booking_option_id] ?? 999) : 999;
                    return sortA - sortB;
                  })
                  .map((item) => (
                    <li key={item.id} className="py-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {item.item_name}
                          </span>
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                            {item.item_type === 'tutorial' ? 'Tutorial' : 'Option'}
                          </span>
                          {item.pending && (
                            <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                              (to be selected)
                            </span>
                          )}
                        </div>
                        {isAdmin && selectedReg.status === 'registered_pending_invoice' && (
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
                      </div>

                      {/* Session selector for this item */}
                      {isAdmin && item.booking_option_id && (
                        <OptionSessions
                          conferenceId={conference.id}
                          optionId={item.booking_option_id}
                          selections={{}}
                          selectedSessionId={item.program_session_id}
                          onChange={(selections) => {
                            const sessionId = Object.values(selections).find(Boolean) || null;
                            updateItemSessionMutation.mutate({
                              regId: selectedReg.id,
                              itemId: item.id,
                              sessionId,
                            });
                          }}
                          compact={true}
                        />
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

        {replaceTarget && (
          <>
            {console.log('About to render ReplaceAttendeeModal (detail view)', {
              replaceTarget,
              isOpen: !!replaceTarget,
              conferenceId: conference.id,
            })}
            <ReplaceAttendeeModal
              isOpen={!!replaceTarget}
              onClose={() => setReplaceTarget(null)}
              registration={replaceTarget}
              conferenceId={conference.id}
            />
          </>
        )}
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
                      // Clear session selections for removed options
                      const currentSessions = attendeeSessionSelections[idx] || {};
                      const updatedSessions = [...attendeeSessionSelections];
                      const newSessions: Record<string, Record<string, string>> = {};
                      ids.forEach((id) => {
                        if (currentSessions[id]) {
                          newSessions[id] = currentSessions[id];
                        }
                      });
                      updatedSessions[idx] = newSessions;
                      setAttendeeSessionSelections(updatedSessions);
                    }}
                    conferenceId={conference.id}
                    sessionSelections={attendeeSessionSelections[idx] || {}}
                    onSessionChange={(optionId: string, sel: Record<string, string>) => {
                      const updated = [...attendeeSessionSelections];
                      const currentMap = updated[idx] || {};
                      updated[idx] = { ...currentMap, [optionId]: sel };
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
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Billing Information
              </h4>
              {attendees.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const attendee = attendees[0];
                    console.log('Copying attendee info:', attendee);
                    const updatedBilling = {
                      ...billing,
                      contact_first_name: attendee.first_name,
                      contact_last_name: attendee.last_name,
                      contact_email: attendee.email,
                      contact_phone: attendee.phone || '',
                    };
                    console.log('Updated billing:', updatedBilling);
                    setBilling(updatedBilling);
                  }}
                  className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                >
                  📋 Use Attendee Info
                </button>
              )}
            </div>
            <BillingFields data={billing} onChange={setBilling} conference={conference} />
          </div>

          {/* Order Summary - reusing component from public registration */}
          <OrderSummary
            attendees={portalAttendees}
            bookingOptions={publicBookingOptions}
            bookingPeriods={publicBookingPeriods}
            currency={conference.currency || 'EUR'}
            discount={discountValidation}
            vatCalculation={vatCalculation}
          />

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
                    Invoice #
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
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {invoiceMap[reg.billing_profile_id]?.number || '\u2014'}
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

      {replaceTarget && (
        <>
          {console.log('About to render ReplaceAttendeeModal', {
            replaceTarget,
            isOpen: !!replaceTarget,
            conferenceId: conference.id,
          })}
          <ReplaceAttendeeModal
            isOpen={!!replaceTarget}
            onClose={() => setReplaceTarget(null)}
            registration={replaceTarget}
            conferenceId={conference.id}
          />
        </>
      )}
    </div>
  );
}
