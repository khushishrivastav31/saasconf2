/**
 * Training Registrations Tab
 *
 * Registrations grouped by training (placement). Each group shows training name,
 * date, guaranteed badge, and registration count. Groups are collapsible.
 * Individual registrations expand to show attendee details.
 */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import RegistrationRow from './RegistrationRow';
import OfferAttendeeRow, { groupOfferAttendeesByOffer } from './OfferAttendeeRow';
import type { OfferAttendeeItem } from './OfferAttendeeRow';
import type { Registration, ExamLanguage } from './RegistrationRow';

interface TrainingGroup {
  placementId: string;
  trainingName: string;
  trainingDate: string | null;
  isGuaranteed: boolean;
  registrations: Registration[];
  offerAttendees: OfferAttendeeItem[];
  totalAttendees: number;
}

const formatDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

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
                    <table className="min-w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-8" />
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '15%' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-t border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
                          <th className="px-3 py-2" />
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
