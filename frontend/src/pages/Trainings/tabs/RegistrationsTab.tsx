/**
 * Training Registrations Tab
 *
 * Registrations grouped by training (placement). Each group shows training name,
 * date, guaranteed badge, and registration count. Groups are collapsible.
 * Individual registrations expand to show attendee details.
 */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import BulkCancelDialog from '../../../components/trainings/BulkCancelDialog';
import type { OfferAttendeeItem } from './OfferAttendeeRow';
import type { Registration, ExamLanguage } from './RegistrationRow';
import { buildGroups, type Placement } from './registrationGroups';
import TrainingGroupRow from './TrainingGroupRow';

export default function RegistrationsTab() {
  const [, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [maxRegistrations, setMaxRegistrations] = useState('');
  const [trainerFilter, setTrainerFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [showPast, setShowPast] = useState(false);
  const [page, setPage] = useState(1);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRegId, setExpandedRegId] = useState<string | null>(null);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), per_page: '100' };
    if (search) p.search = search;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    return p;
  }, [search, dateFrom, dateTo, page]);

  const { data: langData } = useQuery({
    queryKey: ['training-exam-languages'],
    queryFn: async () => {
      const res = await api.get('/trainings/languages');
      return (res.data.items ?? res.data) as ExamLanguage[];
    },
    staleTime: 60_000,
  });
  const examLanguages = useMemo(() => langData ?? [], [langData]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['training-registrations', params],
    queryFn: async () => {
      const res = await api.get('/trainings/registrations', { params });
      return res.data as {
        items: Registration[];
        offer_attendees: OfferAttendeeItem[];
        placements: Placement[];
        total: number;
        page: number;
        per_page: number;
      };
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const offerAttendees = useMemo(() => data?.offer_attendees ?? [], [data]);
  const placements = useMemo(() => data?.placements ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;
  const allGroups = useMemo(
    () => buildGroups(items, offerAttendees, placements),
    [items, offerAttendees, placements]
  );
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxRegParsed = useMemo(() => {
    const n = parseInt(maxRegistrations, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [maxRegistrations]);
  const trainerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const gr of allGroups) {
      for (const name of gr.trainerNames) set.add(name);
    }
    return Array.from(set).sort();
  }, [allGroups]);
  const groups = useMemo(() => {
    let g = showPast
      ? allGroups
      : allGroups.filter((gr) => !gr.trainingDate || gr.trainingDate >= today);
    if (maxRegParsed !== null) {
      g = g.filter((gr) => gr.registrations.length + gr.offerAttendees.length <= maxRegParsed);
    }
    if (trainerFilter) {
      g = g.filter((gr) => gr.trainerNames.includes(trainerFilter));
    }
    if (activeFilter === 'active') {
      g = g.filter((gr) => gr.isActive);
    } else if (activeFilter === 'inactive') {
      g = g.filter((gr) => !gr.isActive);
    }
    return g;
  }, [allGroups, showPast, today, maxRegParsed, trainerFilter, activeFilter]);
  const hiddenCount = allGroups.length - groups.length;

  const activeMutation = useMutation({
    mutationFn: async ({ yearId, placementId }: { yearId: string; placementId: string }) =>
      api.patch(`/trainings/programs/years/${yearId}/trainings/${placementId}/active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      showToast('Training status updated', 'success');
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr?.response?.status === 409) {
        showToast('Cannot deactivate: training has attendees', 'error');
      } else {
        showToast('Failed to update training status', 'error');
      }
    },
  });

  const guaranteedMutation = useMutation({
    mutationFn: async ({ yearId, placementId }: { yearId: string; placementId: string }) =>
      api.patch(`/trainings/programs/years/${yearId}/trainings/${placementId}/guaranteed`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      showToast('Guaranteed status updated', 'success');
    },
    onError: () => showToast('Failed to update guaranteed status', 'error'),
  });

  const toggleGroup = (placementId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(placementId)) next.delete(placementId);
      else next.add(placementId);
      return next;
    });
  };

  const handleToggleActive = (yearId: string, placementId: string, hasAttendees: boolean) => {
    const group = allGroups.find((g) => g.placementId === placementId);
    if (group?.isActive && hasAttendees) {
      showToast('Cannot deactivate: training has attendees', 'error');
      return;
    }
    activeMutation.mutate({ yearId, placementId });
  };

  const handleNavigateOffer = (customerId: string, offerId: string) => {
    setSearchParams({
      section: 'customers',
      customerId,
      offerId,
      tab: 'offers',
    });
  };

  const inputCls =
    'px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Training Registrations
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({total})
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setBulkCancelOpen(true)}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Filter and bulk-cancel many registrations at once (each gets a credit note)"
        >
          Cancel many…
        </button>
      </div>
      <BulkCancelDialog
        open={bulkCancelOpen}
        onClose={() => setBulkCancelOpen(false)}
        onCompleted={(result) => {
          showToast(
            `Cancelled ${result.cancelled} registration${result.cancelled === 1 ? '' : 's'} (${result.credit_notes_created} credit notes, ${result.emails_sent} emails)`,
            'success'
          );
          queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
        }}
      />

      <div className="flex flex-nowrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search name, email, training..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`flex-1 min-w-0 ${inputCls}`}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          title="Training date from"
          className={`w-32 shrink-0 ${inputCls}`}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          title="Training date to"
          className={`w-32 shrink-0 ${inputCls}`}
        />
        <input
          type="number"
          min={0}
          placeholder="Max"
          value={maxRegistrations}
          onChange={(e) => setMaxRegistrations(e.target.value)}
          title="Show only trainings with at most this many registrations (incl. offer attendees)"
          className={`w-16 shrink-0 ${inputCls}`}
        />
        <select
          value={trainerFilter}
          onChange={(e) => setTrainerFilter(e.target.value)}
          title="Filter by assigned trainer"
          className={`w-32 shrink-0 ${inputCls}`}
        >
          <option value="">All trainers</option>
          {trainerOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as 'active' | 'inactive' | 'all')}
          title="Filter by active status"
          className={`w-24 shrink-0 ${inputCls}`}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          Past{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : isError ? (
        <div className="text-center py-8 text-red-500 dark:text-red-400">
          Failed to load data. Please try again.
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          No registrations found.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[20px_minmax(0,1fr)_100px_120px_90px_minmax(0,200px)_32px] items-center gap-x-4 px-4 pb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <span />
            <span>Training</span>
            <span>Date</span>
            <span className="text-center">Guaranteed</span>
            <span className="text-center">Status</span>
            <span>Trainers</span>
            <span className="text-right">#</span>
          </div>

          <div className="space-y-2">
            {groups.map((group) => (
              <TrainingGroupRow
                key={group.placementId}
                group={group}
                isCollapsed={!expandedGroups.has(group.placementId)}
                onToggle={() => toggleGroup(group.placementId)}
                examLanguages={examLanguages}
                expandedRegId={expandedRegId}
                setExpandedRegId={setExpandedRegId}
                guaranteedPending={guaranteedMutation.isPending}
                activePending={activeMutation.isPending}
                onToggleGuaranteed={(yearId, placementId) =>
                  guaranteedMutation.mutate({ yearId, placementId })
                }
                onToggleActive={handleToggleActive}
                onNavigateOffer={handleNavigateOffer}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
