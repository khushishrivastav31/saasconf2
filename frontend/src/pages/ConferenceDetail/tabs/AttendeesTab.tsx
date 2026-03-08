import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import type {
  Conference,
  Registration,
  RegistrationListResponse,
  RegistrationItem,
  RegistrationItemCreate,
  BookingOption,
  BookableSessionsResponse,
  Invoice,
} from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import { ErrorBanner, SuccessBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { OptionSessions } from './RegistrationTab/SessionSelector';
import { STATUS_LABELS, MODE_LABELS } from './RegistrationTab/helpers';

const STATUS_COLORS: Record<string, string> = {
  registered_pending_invoice:
    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  invoiced: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_COLORS[status] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

interface AttendeesTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function AttendeesTab({ conference, isAdmin }: AttendeesTabProps) {
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBookingOption, setFilterBookingOption] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Registration | null>(null);

  // Add item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemType, setAddItemType] = useState<'booking_option' | 'tutorial'>('booking_option');
  const [addItemOptionId, setAddItemOptionId] = useState('');

  // Debounced search (300ms)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  // Fetch registrations
  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.registrations.byConference(conference.id, debouncedSearch, filterStatus),
    queryFn: async () => {
      const params: Record<string, string> = { page_size: '100' };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (filterStatus) params.status = filterStatus;
      const res = await api.get<RegistrationListResponse>(
        `/conferences/${conference.id}/registrations`,
        { params }
      );
      return res.data;
    },
  });

  // Fetch booking options for filter dropdown
  const { data: optionsData } = useQuery({
    queryKey: queryKeys.booking.options(conference.id),
    queryFn: async () => {
      const res = await api.get<{ items: BookingOption[] }>(
        `/conferences/${conference.id}/settings/booking-options`
      );
      return res.data.items;
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
    enabled: data !== undefined,
  });

  // Fetch all bookable sessions across all booking options
  const { data: allSessionsData } = useQuery({
    queryKey: ['bookable-sessions-all', conference.id],
    queryFn: async () => {
      if (!optionsData || optionsData.length === 0) return [];

      // Fetch bookable sessions for each booking option
      const sessionsByOption = await Promise.all(
        optionsData.map(async (option) => {
          try {
            const res = await api.get<BookableSessionsResponse>(
              `/conferences/${conference.id}/registrations/bookable-sessions/${option.id}`
            );
            return res.data.groups || [];
          } catch {
            return [];
          }
        })
      );

      // Flatten and deduplicate sessions
      const allSessions = new Map<string, { id: string; name: string }>();
      sessionsByOption.forEach((groups) => {
        groups.forEach((group) => {
          group.slots?.forEach((slot) => {
            slot.sessions?.forEach((session) => {
              if (session.id && session.has_paper) {
                const label = session.speaker_name
                  ? `${session.title} – ${session.speaker_name}`
                  : session.title;
                allSessions.set(session.id, { id: session.id, name: label });
              }
            });
          });
        });
      });

      return Array.from(allSessions.values());
    },
    enabled: !!optionsData && optionsData.length > 0,
  });

  // Client-side filter by booking option
  const filteredData = useMemo(() => {
    if (!data || !filterBookingOption) return data;
    return {
      ...data,
      items: data.items.filter((reg) => reg.booking_option_id === filterBookingOption),
    };
  }, [data, filterBookingOption]);

  // Calculate statistics by booking option
  const statistics = useMemo(() => {
    if (!data || !optionsData) return null;

    const stats: Record<string, { name: string; count: number }> = {};

    // Initialize stats for all booking options
    optionsData.forEach((opt) => {
      stats[opt.id] = { name: opt.name, count: 0 };
    });

    // Count attendees per booking option (only non-cancelled)
    // Count both main booking option AND add-on items
    data.items.forEach((reg) => {
      if (reg.status === 'cancelled') return;

      // Count main booking option
      if (stats[reg.booking_option_id]) {
        stats[reg.booking_option_id].count++;
      }

      // Count all add-on items (tutorials, hackathon, extra days, etc.)
      reg.items.forEach((item) => {
        if (item.booking_option_id && stats[item.booking_option_id]) {
          stats[item.booking_option_id].count++;
        }
      });
    });

    // Convert to array and sort by count (descending), include zero counts
    const sortedStats = Object.values(stats).sort((a, b) => b.count - a.count);

    const totalActive = data.items.filter((r) => r.status !== 'cancelled').length;

    return { total: totalActive, byOption: sortedStats };
  }, [data, optionsData]);

  // Calculate statistics by session (tutorials, workshops, etc.)
  const sessionStatistics = useMemo(() => {
    if (!data) return null;

    const sessionStats: Record<string, { name: string; count: number }> = {};

    // Initialize with all available sessions (with 0 count)
    allSessionsData?.forEach((session) => {
      sessionStats[session.id] = { name: session.name, count: 0 };
    });

    // Count actual bookings
    data.items.forEach((reg) => {
      if (reg.status === 'cancelled') return;

      // Count main session (if exists)
      if (reg.main_session_id && reg.main_session_name) {
        if (!sessionStats[reg.main_session_id]) {
          sessionStats[reg.main_session_id] = { name: reg.main_session_name, count: 0 };
        }
        sessionStats[reg.main_session_id].count++;
      }

      // Count sessions from add-on items
      reg.items.forEach((item) => {
        if (item.program_session_id && item.item_name) {
          if (!sessionStats[item.program_session_id]) {
            sessionStats[item.program_session_id] = { name: item.item_name, count: 0 };
          }
          sessionStats[item.program_session_id].count++;
        }
      });
    });

    const sortedSessionStats = Object.values(sessionStats).sort((a, b) => b.count - a.count);

    return sortedSessionStats.length > 0 ? sortedSessionStats : null;
  }, [data, allSessionsData]);

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

  // Get the currently expanded registration
  const selectedReg = filteredData?.items?.find((r) => r.id === expandedRowId);

  // Export handler
  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await api.get(`/conferences/${conference.id}/export/attendees`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv; charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${conference.abbreviation || conference.name}_attendees.csv`.replace(/ /g, '_');
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(parseApiError(err, 'Failed to export attendees'));
    } finally {
      setExporting(false);
    }
  };

  // ---- Mutations ----

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/registrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.registrations.byConference(conference.id),
      });
      setDeleteTarget(null);
      setExpandedRowId(null);
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

  function handleAddItem() {
    if (!expandedRowId || !addItemOptionId) return;
    const payload: RegistrationItemCreate = {
      item_type: addItemType,
      booking_option_id: addItemType === 'booking_option' ? addItemOptionId : undefined,
      program_session_id: addItemType === 'tutorial' ? addItemOptionId : undefined,
    };
    addItemMutation.mutate({ regId: expandedRowId, data: payload });
  }

  // Clear filters
  const hasActiveFilters = search || filterStatus || filterBookingOption;
  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFilterStatus('');
    setFilterBookingOption('');
  };

  // Toggle row expansion
  const handleRowClick = useCallback((registrationId: string) => {
    setExpandedRowId((prev) => (prev === registrationId ? null : registrationId));
  }, []);

  return (
    <div className="p-6">
      {/* Header with count and export button */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Attendees
          {statistics && (
            <span className="ml-2 text-lg font-normal text-gray-500 dark:text-gray-400">
              ({statistics.total} active)
            </span>
          )}
        </h2>
        {isAdmin && (
          <button
            onClick={handleExport}
            disabled={exporting || !filteredData || filteredData.items.length === 0}
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Error and Success banners */}
      <ErrorBanner
        message={
          error || (queryError ? parseApiError(queryError, 'Failed to load attendees') : null)
        }
      />
      <SuccessBanner message={success} />

      {/* Statistics - Booking Options */}
      {statistics && statistics.byOption.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Attendees by Booking Option
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {statistics.byOption.map((stat) => (
              <div
                key={stat.name}
                className={`border rounded-lg p-3 ${
                  stat.count === 0
                    ? 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 opacity-60'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stat.count}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                  {stat.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statistics - Sessions (Tutorials, Workshops, etc.) */}
      {sessionStatistics && sessionStatistics.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Attendees by Session (Tutorials, Workshops, etc.)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {sessionStatistics.map((stat) => (
              <div
                key={stat.name}
                className={`border rounded-lg p-3 ${
                  stat.count === 0
                    ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 opacity-60'
                    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                }`}
              >
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {stat.count}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 truncate">
                  {stat.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setDebouncedSearch('');
              }}
              className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Statuses</option>
          <option value="registered_pending_invoice">Registered (Pending Invoice)</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {/* Booking option filter */}
        {optionsData && optionsData.length > 0 && (
          <select
            value={filterBookingOption}
            onChange={(e) => setFilterBookingOption(e.target.value)}
            className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All Booking Options</option>
            {optionsData.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner />
      ) : filteredData && filteredData.items.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Booking Option
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Session/Tutorial
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.items.map((reg) => (
                  <>
                    <tr
                      key={reg.id}
                      onClick={() => handleRowClick(reg.id)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          <span>{expandedRowId === reg.id ? '▼' : '▶'}</span>
                          {reg.first_name} {reg.last_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {reg.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {reg.billing_company_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div>
                          <div className="font-medium">{reg.booking_option_name || '—'}</div>
                          {reg.items.length > 0 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {reg.items.map((item) => item.item_name).join(', ')}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {reg.main_session_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={reg.status} />
                      </td>
                    </tr>
                    {expandedRowId === reg.id && selectedReg && (
                      <tr key={`${reg.id}-details`}>
                        <td
                          colSpan={6}
                          className="bg-gray-50 dark:bg-gray-900 p-4 border-t border-gray-200 dark:border-gray-700"
                        >
                          {/* Attendee info */}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 text-sm">
                            {selectedReg.job_title && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Job Title:</span>{' '}
                                <span className="text-gray-900 dark:text-gray-100">
                                  {selectedReg.job_title}
                                </span>
                              </div>
                            )}
                            {selectedReg.department && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">
                                  Department:
                                </span>{' '}
                                <span className="text-gray-900 dark:text-gray-100">
                                  {selectedReg.department}
                                </span>
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
                                    url.searchParams.set(
                                      'invoice',
                                      invoiceMap[selectedReg.billing_profile_id].id
                                    );
                                    window.location.href = url.toString();
                                  }}
                                  className="text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                  {invoiceMap[selectedReg.billing_profile_id].number}
                                </button>
                              ) : (
                                <span className="text-gray-900 dark:text-gray-100">—</span>
                              )}
                            </div>
                            {selectedReg.notes && (
                              <div className="col-span-full">
                                <span className="text-gray-500 dark:text-gray-400">Notes:</span>{' '}
                                <span className="text-gray-900 dark:text-gray-100">
                                  {selectedReg.notes}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Status (read-only, determined by invoice) */}
                          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Status:
                            </label>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                STATUS_COLORS[selectedReg.status] ||
                                'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                              }`}
                            >
                              {STATUS_LABELS[selectedReg.status] || selectedReg.status}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                              {MODE_LABELS[selectedReg.registration_mode] ||
                                selectedReg.registration_mode}
                            </span>
                            <div className="flex-1" />
                            {isAdmin && selectedReg.status === 'registered_pending_invoice' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(selectedReg);
                                }}
                                className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                              >
                                Delete Registration
                              </button>
                            )}
                          </div>

                          {/* Main booking option with session selection */}
                          <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              Main Booking Option
                            </h4>
                            <div className="bg-white dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                                  {selectedReg.booking_option_name || 'Unknown option'}
                                </span>
                              </div>
                              {/* Main session selection */}
                              {selectedReg.booking_option_id && isAdmin && (
                                <OptionSessions
                                  conferenceId={conference.id}
                                  optionId={selectedReg.booking_option_id}
                                  selections={{}}
                                  selectedSessionId={selectedReg.main_session_id}
                                  onChange={(selections) => {
                                    const sessionId =
                                      Object.values(selections).find(Boolean) || null;
                                    updateMainSessionMutation.mutate({
                                      regId: selectedReg.id,
                                      sessionId,
                                    });
                                  }}
                                />
                              )}
                              {!isAdmin && selectedReg.main_session_name && (
                                <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                  Selected: {selectedReg.main_session_name}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Add-on items */}
                          <div className="mb-4">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Add-on Items
                              </h4>
                              {isAdmin && selectedReg.status === 'registered_pending_invoice' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAddItem(!showAddItem);
                                  }}
                                  className="text-sm text-primary-600 hover:text-primary-800"
                                >
                                  {showAddItem ? 'Cancel' : '+ Add Item'}
                                </button>
                              )}
                            </div>

                            {showAddItem && (
                              <div className="flex items-end gap-3 mb-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                    Type
                                  </label>
                                  <select
                                    className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                                    value={addItemType}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setAddItemType(
                                        e.target.value as 'booking_option' | 'tutorial'
                                      );
                                      setAddItemOptionId('');
                                    }}
                                  >
                                    <option value="booking_option">Booking Option</option>
                                    <option value="tutorial">Tutorial</option>
                                  </select>
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                    {addItemType === 'booking_option'
                                      ? 'Option'
                                      : 'Tutorial Session'}
                                  </label>
                                  {addItemType === 'booking_option' ? (
                                    <select
                                      className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                                      value={addItemOptionId}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        setAddItemOptionId(e.target.value);
                                      }}
                                    >
                                      <option value="">Select option...</option>
                                      {optionsData
                                        ?.filter((o) => o.is_active)
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddItem();
                                  }}
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
                              <ul className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                {selectedReg.items.map((item) => (
                                  <li key={item.id} className="py-3 px-3">
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
                                      {isAdmin &&
                                        selectedReg.status === 'registered_pending_invoice' && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeItemMutation.mutate({
                                                regId: selectedReg.id,
                                                itemId: item.id,
                                              });
                                            }}
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
                                        selections={
                                          item.program_session_id
                                            ? { default: item.program_session_id }
                                            : {}
                                        }
                                        onChange={(selections) => {
                                          const sessionId =
                                            Object.values(selections).find(Boolean) || null;
                                          updateItemSessionMutation.mutate({
                                            regId: selectedReg.id,
                                            itemId: item.id,
                                            sessionId,
                                          });
                                        }}
                                      />
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Close button */}
                          <div className="flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRowId(null);
                                setShowAddItem(false);
                                setAddItemOptionId('');
                              }}
                              className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                              Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No attendees match the current filters
        </div>
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
