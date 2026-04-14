/**
 * Training Registrations Tab
 *
 * Registrations grouped by training (placement). Each group shows training name,
 * date, guaranteed badge, and registration count. Groups are collapsible.
 * Individual registrations expand to show attendee details.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';

interface Attendee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  include_exam: boolean;
  exam_mode: string | null;
  exam_language: string | null;
  extra_time: boolean;
}

interface Registration {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
  is_guaranteed: boolean;
  status: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  company_name: string | null;
  payment_method: string;
  total: string | null;
  currency: string;
  attendee_count: number;
  created_at: string | null;
  attendees: Attendee[];
}

interface OfferAttendeeItem {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
  is_guaranteed: boolean;
  first_name: string;
  last_name: string;
  email: string | null;
  offer_id: string;
  offer_number: string;
  customer_id: string;
  customer_name: string;
  certification: boolean;
  exam_mode: string | null;
  exam_language: string | null;
  extra_time: boolean;
}

interface TrainingGroup {
  placementId: string;
  trainingName: string;
  trainingDate: string | null;
  isGuaranteed: boolean;
  registrations: Registration[];
  offerAttendees: OfferAttendeeItem[];
  totalAttendees: number;
}

const STATUS_COLORS: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  invoiced: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const formatDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

const formatAmount = (amt: string | null, currency: string) => {
  if (!amt) return '—';
  const sym = currency === 'EUR' ? '€' : currency;
  return `${sym}\u00A0${Number(amt).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
};

function buildGroups(items: Registration[], offerAtts: OfferAttendeeItem[]): TrainingGroup[] {
  const map = new Map<string, TrainingGroup>();
  for (const reg of items) {
    const existing = map.get(reg.placement_id);
    if (existing) {
      existing.registrations.push(reg);
      existing.totalAttendees += reg.attendee_count;
    } else {
      map.set(reg.placement_id, {
        placementId: reg.placement_id,
        trainingName: reg.training_name,
        trainingDate: reg.training_date,
        isGuaranteed: reg.is_guaranteed,
        registrations: [reg],
        offerAttendees: [],
        totalAttendees: reg.attendee_count,
      });
    }
  }
  // Merge offer attendees into groups (or create new groups)
  for (const oa of offerAtts) {
    const existing = map.get(oa.placement_id);
    if (existing) {
      existing.offerAttendees.push(oa);
      existing.totalAttendees += 1;
    } else {
      map.set(oa.placement_id, {
        placementId: oa.placement_id,
        trainingName: oa.training_name,
        trainingDate: oa.training_date,
        isGuaranteed: oa.is_guaranteed,
        registrations: [],
        offerAttendees: [oa],
        totalAttendees: 1,
      });
    }
  }
  // Sort by training date ascending (nearest future first, nulls last)
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (!a.trainingDate && !b.trainingDate) return 0;
    if (!a.trainingDate) return 1;
    if (!b.trainingDate) return -1;
    return a.trainingDate.localeCompare(b.trainingDate);
  });
  return groups;
}

// ── Main component ────────────────────────────────────────────────────────────
interface ExamLanguage {
  id: string;
  name: string;
}

export default function RegistrationsTab() {
  const [, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [page, setPage] = useState(1);

  // Track collapsed groups (all groups expanded by default)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Track expanded registration rows (for attendee details)
  const [expandedRegId, setExpandedRegId] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), per_page: '100' };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    return p;
  }, [search, statusFilter, dateFrom, dateTo, page]);

  const { data: langData } = useQuery({
    queryKey: ['training-exam-languages'],
    queryFn: async () => {
      const res = await api.get('/trainings/languages');
      return (res.data.items ?? res.data) as ExamLanguage[];
    },
    staleTime: 60_000,
  });
  const examLanguages = useMemo(() => langData ?? [], [langData]);

  const { data, isLoading } = useQuery({
    queryKey: ['training-registrations', params],
    queryFn: async () => {
      const res = await api.get('/trainings/registrations', { params });
      return res.data as {
        items: Registration[];
        offer_attendees: OfferAttendeeItem[];
        total: number;
        page: number;
        per_page: number;
      };
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const offerAttendees = useMemo(() => data?.offer_attendees ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;
  const allGroups = useMemo(() => buildGroups(items, offerAttendees), [items, offerAttendees]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const groups = useMemo(
    () =>
      showPast ? allGroups : allGroups.filter((g) => !g.trainingDate || g.trainingDate >= today),
    [allGroups, showPast, today]
  );
  const hiddenCount = allGroups.length - groups.length;

  const toggleGroup = (placementId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(placementId)) next.delete(placementId);
      else next.add(placementId);
      return next;
    });
  };

  const inputCls =
    'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';

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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, company, training..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`flex-1 min-w-50 ${inputCls}`}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={inputCls}
        >
          <option value="">All statuses</option>
          <option value="registered">Registered</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          title="Training date from"
          className={inputCls}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          title="Training date to"
          className={inputCls}
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          Show past{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          No registrations found.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {groups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.placementId);
              return (
                <div
                  key={group.placementId}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.placementId)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
                  >
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                      {group.trainingName}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(group.trainingDate)}
                    </span>
                    {group.isGuaranteed && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Guaranteed
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      {group.registrations.length > 0 && (
                        <>
                          {group.registrations.length} registration
                          {group.registrations.length !== 1 ? 's' : ''}
                        </>
                      )}
                      {group.registrations.length > 0 &&
                        group.offerAttendees.length > 0 &&
                        ' \u00B7 '}
                      {group.offerAttendees.length > 0 && (
                        <>
                          {group.offerAttendees.length} offer attendee
                          {group.offerAttendees.length !== 1 ? 's' : ''}
                        </>
                      )}
                      {(group.registrations.length > 0 || group.offerAttendees.length > 0) &&
                        ' \u00B7 '}
                      {group.totalAttendees} total
                    </span>
                  </button>

                  {/* Registration rows */}
                  {!isCollapsed && (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-t border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide w-8" />
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                            Contact
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                            Email
                          </th>
                          <th className="px-3 py-2 text-center font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                            Attendees
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                            Status
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                            Payment
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {group.registrations.map((reg) => {
                          const isExpanded = expandedRegId === reg.id;
                          return (
                            <RegistrationRow
                              key={reg.id}
                              reg={reg}
                              examLanguages={examLanguages}
                              expanded={isExpanded}
                              onToggle={() => setExpandedRegId(isExpanded ? null : reg.id)}
                            />
                          );
                        })}
                        {groupOfferAttendeesByOffer(group.offerAttendees).map((oag) => {
                          const oaExpanded = expandedRegId === `oa-${oag.offerId}`;
                          return (
                            <OfferAttendeeRow
                              key={`oag-${oag.offerId}`}
                              group={oag}
                              examLanguages={examLanguages}
                              expanded={oaExpanded}
                              onToggle={() =>
                                setExpandedRegId(oaExpanded ? null : `oa-${oag.offerId}`)
                              }
                              onNavigate={() =>
                                setSearchParams({
                                  section: 'customers',
                                  customerId: oag.customerId,
                                  offerId: oag.offerId,
                                  tab: 'offers',
                                })
                              }
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
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

// ── Registration row with expandable attendees ────────────────────────────────
function RegistrationRow({
  reg,
  expanded,
  onToggle,
  examLanguages,
}: {
  reg: Registration;
  expanded: boolean;
  onToggle: () => void;
  examLanguages: ExamLanguage[];
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const updateAttendee = useMutation({
    mutationFn: ({
      attId,
      payload,
    }: {
      attId: string;
      payload: Record<string, string | boolean | null>;
    }) => api.patch(`/trainings/registrations/${reg.id}/attendees/${attId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      showToast('Attendee updated', 'success');
    },
    onError: () => showToast('Failed to update attendee', 'error'),
  });

  const handleChange = useCallback(
    (attId: string, field: string, value: string | boolean) => {
      const payload: Record<string, string | boolean | null> = { [field]: value };
      // Sync include_exam flag with exam_mode
      if (field === 'exam_mode') {
        if (value === 'none') {
          payload.exam_mode = null;
          payload.include_exam = false;
        } else {
          payload.include_exam = true;
        }
      }
      updateAttendee.mutate({ attId, payload });
    },
    [updateAttendee]
  );

  const selectCls =
    'px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100';

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 text-gray-400">
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
          {reg.contact_first_name} {reg.contact_last_name}
          {reg.company_name && (
            <span className="ml-1 text-xs text-gray-400">({reg.company_name})</span>
          )}
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{reg.contact_email}</td>
        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
          {reg.attendee_count}
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[reg.status] || 'bg-gray-100 text-gray-700'}`}
          >
            {reg.status}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 capitalize">
          {reg.payment_method?.replace('_', ' ')}
        </td>
        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
          {formatAmount(reg.total, reg.currency)}
        </td>
      </tr>
      {expanded && reg.attendees.length > 0 && (
        <tr>
          <td colSpan={7} className="px-0 py-0">
            <div className="bg-gray-50 dark:bg-gray-900/50 px-8 py-3 border-t border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400 uppercase text-[10px]">
                    <th className="text-left py-1 pr-4">Name</th>
                    <th className="text-left py-1 pr-4">Email</th>
                    <th className="text-left py-1 pr-4">Exam</th>
                    <th className="text-left py-1 pr-4">Language</th>
                    <th className="text-left py-1">Extra Time</th>
                  </tr>
                </thead>
                <tbody>
                  {reg.attendees.map((att) => (
                    <tr key={att.id} className="text-gray-700 dark:text-gray-300">
                      <td className="py-1 pr-4">
                        {att.first_name} {att.last_name}
                      </td>
                      <td className="py-1 pr-4">{att.email}</td>
                      <td className="py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls}
                          value={att.exam_mode || 'none'}
                          onChange={(e) => handleChange(att.id, 'exam_mode', e.target.value)}
                        >
                          <option value="none">—</option>
                          <option value="online">Online</option>
                          <option value="onsite">Onsite</option>
                        </select>
                      </td>
                      <td className="py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls}
                          value={att.exam_language || ''}
                          onChange={(e) => handleChange(att.id, 'exam_language', e.target.value)}
                        >
                          <option value="">—</option>
                          {examLanguages.map((el) => (
                            <option key={el.id} value={el.name}>
                              {el.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={att.extra_time}
                          onChange={(e) => handleChange(att.id, 'extra_time', e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Offer attendee grouping + row ─────────────────────────────────────────────
interface OfferAttendeeGroup {
  offerId: string;
  offerNumber: string;
  customerId: string;
  customerName: string;
  attendees: OfferAttendeeItem[];
}

function groupOfferAttendeesByOffer(items: OfferAttendeeItem[]): OfferAttendeeGroup[] {
  const map = new Map<string, OfferAttendeeGroup>();
  for (const oa of items) {
    const existing = map.get(oa.offer_id);
    if (existing) {
      existing.attendees.push(oa);
    } else {
      map.set(oa.offer_id, {
        offerId: oa.offer_id,
        offerNumber: oa.offer_number,
        customerId: oa.customer_id,
        customerName: oa.customer_name,
        attendees: [oa],
      });
    }
  }
  return Array.from(map.values());
}

function OfferAttendeeRow({
  group,
  expanded,
  onToggle,
  onNavigate,
  examLanguages,
}: {
  group: OfferAttendeeGroup;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  examLanguages: ExamLanguage[];
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const updateMutation = useMutation({
    mutationFn: ({
      attId,
      payload,
    }: {
      attId: string;
      payload: Record<string, string | boolean | null>;
    }) => api.patch(`/trainings/offers/${group.offerId}/attendees/${attId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['offer-attendees'] });
      showToast('Attendee updated', 'success');
    },
    onError: () => showToast('Failed to update attendee', 'error'),
  });

  const handleChange = useCallback(
    (attId: string, field: string, value: string | boolean) => {
      const payload: Record<string, string | boolean | null> = { [field]: value };
      // Sync certification flag with exam_mode
      if (field === 'exam_mode') {
        if (value === 'none') {
          payload.exam_mode = null;
          payload.certification = false;
        } else {
          payload.certification = true;
        }
      }
      updateMutation.mutate({ attId, payload });
    },
    [updateMutation]
  );

  const selectCls =
    'px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100';

  return (
    <>
      <tr
        className="bg-purple-50/40 dark:bg-purple-900/5 hover:bg-purple-50 dark:hover:bg-purple-900/10 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-gray-400">
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{group.customerName}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
          {group.attendees[0]?.email || '—'}
        </td>
        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
          {group.attendees.length}
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate();
            }}
            className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
          >
            {group.offerNumber}
          </button>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">—</td>
        <td className="px-3 py-2 text-right text-xs text-gray-400">—</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="px-0 py-0">
            <div className="bg-purple-50/30 dark:bg-purple-900/5 px-8 py-3 border-t border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400 uppercase text-[10px]">
                    <th className="text-left py-1 pr-4">Name</th>
                    <th className="text-left py-1 pr-4">Email</th>
                    <th className="text-left py-1 pr-4">Exam</th>
                    <th className="text-left py-1 pr-4">Language</th>
                    <th className="text-left py-1">Extra Time</th>
                  </tr>
                </thead>
                <tbody>
                  {group.attendees.map((att) => (
                    <tr key={att.id} className="text-gray-700 dark:text-gray-300">
                      <td className="py-1 pr-4">
                        {att.first_name} {att.last_name}
                      </td>
                      <td className="py-1 pr-4">{att.email || '—'}</td>
                      <td className="py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls}
                          value={att.exam_mode || 'none'}
                          onChange={(e) => handleChange(att.id, 'exam_mode', e.target.value)}
                        >
                          <option value="none">—</option>
                          <option value="online">Online</option>
                          <option value="onsite">Onsite</option>
                        </select>
                      </td>
                      <td className="py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls}
                          value={att.exam_language || ''}
                          onChange={(e) => handleChange(att.id, 'exam_language', e.target.value)}
                        >
                          <option value="">—</option>
                          {examLanguages.map((el) => (
                            <option key={el.id} value={el.name}>
                              {el.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={att.extra_time}
                          onChange={(e) => handleChange(att.id, 'extra_time', e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
