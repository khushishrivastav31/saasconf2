import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { formatCurrency } from '../../../utils/formatCurrency';
import { useToast } from '../../../components/Toast';
import ComposeModal from './MessagingTab/ComposeModal';
import type { Conference } from '../../../types';
import type {
  SpeakerExpense,
  ExpenseStats,
  SpeakerAllowance,
  AllowanceDefault,
} from '../../../types/conference';
import { EXPENSE_STATUS_COLORS as STATUS_COLORS } from '../../../config/statusColors';

interface SpeakerExpensesTabProps {
  conference: Conference;
  isAdmin: boolean;
}

interface AttachmentItem {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
}

interface SpeakerGroup {
  speakerName: string;
  cfpApplicantId: string;
  expenses: SpeakerExpense[];
  totalAmount: number;
  currency: string;
  statusCounts: Record<string, number>;
}

function groupBySpeaker(expenses: SpeakerExpense[]): SpeakerGroup[] {
  const groups: Record<string, SpeakerGroup> = {};
  for (const expense of expenses) {
    const key = expense.speaker_name;
    if (!groups[key]) {
      groups[key] = {
        speakerName: key,
        cfpApplicantId: expense.cfp_applicant_id,
        expenses: [],
        totalAmount: 0,
        currency: expense.original_currency,
        statusCounts: {},
      };
    }
    groups[key].expenses.push(expense);
    if (expense.status === 'approved' || expense.status === 'paid') {
      groups[key].totalAmount += expense.original_amount;
    }
    groups[key].statusCounts[expense.status] = (groups[key].statusCounts[expense.status] || 0) + 1;
  }
  return Object.values(groups).sort((a, b) => a.speakerName.localeCompare(b.speakerName));
}

export default function SpeakerExpensesTab({ conference, isAdmin }: SpeakerExpensesTabProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<'expenses' | 'allowances' | 'defaults'>('expenses');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedSpeaker, setExpandedSpeaker] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<SpeakerExpense | null>(null);
  const [addExpenseFor, setAddExpenseFor] = useState<{
    speakerName: string;
    cfpApplicantId: string;
  } | null>(null);
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
  });

  const currency = conference.currency || 'EUR';
  const { showToast } = useToast();

  // ── Messaging state ──
  const [messageRecipient, setMessageRecipient] = useState<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null>(null);
  const [messageSending, setMessageSending] = useState(false);

  // ── Queries ──

  const { data: expensesData } = useQuery({
    queryKey: [...queryKeys.speakerExpenses.byConference(conference.id), statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const { data } = await api.get(
        `/conferences/${conference.id}/speaker-expenses?${params.toString()}`
      );
      return data as { items: SpeakerExpense[]; total: number };
    },
    staleTime: 0,
  });

  const { data: stats } = useQuery({
    queryKey: queryKeys.speakerExpenses.stats(conference.id),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/speaker-expenses/stats`);
      return data as ExpenseStats;
    },
    staleTime: 0,
  });

  const { data: allowances } = useQuery({
    queryKey: queryKeys.speakerExpenses.allowances(conference.id),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/speaker-expenses/allowances`);
      return data as SpeakerAllowance[];
    },
  });

  interface ExpenseTierItem {
    id: string;
    name: string;
    max_amount: number;
    currency: string;
  }

  const { data: tiers = [] } = useQuery({
    queryKey: queryKeys.speakerExpenses.tiers(conference.id),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/speaker-expenses/tiers`);
      return data as ExpenseTierItem[];
    },
  });

  // Build lookup: speaker name -> allowance
  const allowanceByApplicant = useMemo(() => {
    const map = new Map<string, SpeakerAllowance>();
    for (const a of allowances || []) {
      if (a.speaker_name) map.set(a.speaker_name, a);
    }
    return map;
  }, [allowances]);

  // ── Send message to speaker ──
  const handleSendMessage = useCallback(
    async (data: {
      recipient_applicant_ids: string[];
      subject: string;
      body_html: string;
      attachment_ids: string[];
      screen_overlay_id?: string | null;
    }) => {
      setMessageSending(true);
      try {
        await api.post(`/conferences/${conference.id}/messaging/threads`, data);
        showToast('Message sent successfully', 'success');
        setMessageRecipient(null);
      } catch {
        showToast('Failed to send message', 'error');
      } finally {
        setMessageSending(false);
      }
    },
    [conference.id, showToast]
  );

  const { data: allowanceDefaults } = useQuery({
    queryKey: queryKeys.speakerExpenses.allowanceDefaults(conference.id),
    queryFn: async () => {
      const { data } = await api.get(
        `/conferences/${conference.id}/speaker-expenses/allowance-defaults`
      );
      return data as AllowanceDefault[];
    },
    enabled: activeView === 'defaults',
  });

  // Attachments for selected expense
  const { data: attachments } = useQuery({
    queryKey: ['attachments', 'speaker_expense', selectedExpense?.id],
    queryFn: async () => {
      const { data } = await api.get(
        `/attachments?entity_type=speaker_expense&entity_id=${selectedExpense!.id}`
      );
      return data.items as AttachmentItem[];
    },
    enabled: !!selectedExpense,
  });

  // ── Mutations ──

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.speakerExpenses.byConference(conference.id),
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.speakerExpenses.stats(conference.id) });
    queryClient.invalidateQueries({
      queryKey: queryKeys.speakerExpenses.allowances(conference.id),
    });
  }, [queryClient, conference.id]);

  const approveExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      await api.post(`/conferences/${conference.id}/speaker-expenses/${expenseId}/approve`);
    },
    onSuccess: invalidate,
  });

  const rejectExpense = useMutation({
    mutationFn: async ({ expenseId, reason }: { expenseId: string; reason: string }) => {
      await api.post(`/conferences/${conference.id}/speaker-expenses/${expenseId}/reject`, {
        reason,
      });
    },
    onSuccess: () => {
      invalidate();
      setRejectId(null);
      setRejectReason('');
    },
  });

  const markPaid = useMutation({
    mutationFn: async (expenseId: string) => {
      await api.post(`/conferences/${conference.id}/speaker-expenses/${expenseId}/mark-paid`, {});
    },
    onSuccess: invalidate,
  });

  const createExpense = useMutation({
    mutationFn: async (data: {
      cfp_applicant_id: string;
      title: string;
      expense_date: string;
      original_amount: number;
      original_currency: string;
      description?: string;
      status: string;
    }) => {
      await api.post(`/conferences/${conference.id}/speaker-expenses`, data);
    },
    onSuccess: () => {
      invalidate();
      setAddExpenseFor(null);
      setNewExpense({
        title: '',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        description: '',
      });
    },
  });

  const assignTier = useMutation({
    mutationFn: async ({
      cfpApplicantId,
      tierId,
      allowanceId,
    }: {
      cfpApplicantId: string;
      tierId: string;
      allowanceId?: string;
    }) => {
      if (allowanceId) {
        // Existing allowance — use the direct assign endpoint
        await api.post(
          `/conferences/${conference.id}/speaker-expenses/allowances/${allowanceId}/assign-tier`,
          { expense_tier_id: tierId }
        );
      } else {
        // No allowance yet — use create-or-assign endpoint
        await api.post(`/conferences/${conference.id}/speaker-expenses/assign-tier`, {
          expense_tier_id: tierId,
          cfp_applicant_id: cfpApplicantId,
        });
      }
    },
    onSuccess: invalidate,
  });

  const statsByStatus = (status: string) => {
    const entry = stats?.by_status.find((s) => s.status === status);
    return { count: entry?.count || 0, amount: entry?.total_amount || 0 };
  };

  const speakerGroups = useMemo(
    () => groupBySpeaker(expensesData?.items || []),
    [expensesData?.items]
  );

  const toggleSpeaker = (name: string) => {
    setExpandedSpeaker(expandedSpeaker === name ? null : name);
  };

  const downloadAttachment = async (attachmentId: string, filename: string) => {
    const { data } = await api.get(`/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Speaker Expenses</h2>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {(['expenses', 'allowances', 'defaults'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`text-sm px-3 py-1.5 rounded-md capitalize ${
                activeView === view
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {view === 'defaults' ? 'Allowance Defaults' : view}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {['draft', 'submitted', 'approved', 'rejected', 'paid'].map((status) => {
          const s = statsByStatus(status);
          return (
            <div
              key={status}
              className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:shadow-sm ${
                statusFilter === status ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{status}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatCurrency(s.amount, currency)}
              </p>
            </div>
          );
        })}
      </div>

      {activeView === 'expenses' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-sm text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          {/* Grouped expenses by speaker */}
          <div className="space-y-3">
            {speakerGroups.map((group) => (
              <div
                key={group.speakerName}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Speaker header row */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSpeaker(group.speakerName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSpeaker(group.speakerName);
                    }
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        expandedSpeaker === group.speakerName ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {group.speakerName}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {group.expenses.length} expense{group.expenses.length !== 1 ? 's' : ''}
                    </span>
                    {/* Status mini-badges */}
                    <div className="flex gap-1">
                      {Object.entries(group.statusCounts).map(([st, count]) => (
                        <span
                          key={st}
                          className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[st] || ''}`}
                        >
                          {count} {st}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nameParts = group.speakerName.split(' ');
                          setMessageRecipient({
                            id: group.cfpApplicantId,
                            first_name: nameParts[0] || '',
                            last_name: nameParts.slice(1).join(' ') || '',
                            email: '',
                          });
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={`Send message to ${group.speakerName}`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                          />
                        </svg>
                      </button>
                    )}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(
                        allowanceByApplicant.get(group.speakerName)?.total_approved ??
                          group.totalAmount,
                        group.currency
                      )}
                    </span>
                  </div>
                </div>

                {/* Tier/Budget bar */}
                {expandedSpeaker === group.speakerName &&
                  (() => {
                    const alloc = allowanceByApplicant.get(group.speakerName);
                    return (
                      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2 flex items-center gap-4 text-sm flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 dark:text-gray-400">Tier:</span>
                          {isAdmin && tiers.length > 0 ? (
                            <select
                              value={alloc?.expense_tier_id || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  assignTier.mutate({
                                    cfpApplicantId: group.cfpApplicantId,
                                    tierId: e.target.value,
                                    allowanceId: alloc?.id,
                                  });
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1"
                            >
                              <option value="">— Select tier —</option>
                              {tiers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({formatCurrency(t.max_amount, t.currency)})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {alloc?.expense_tier_name || 'Not assigned'}
                            </span>
                          )}
                        </div>
                        {alloc && (
                          <>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <span className="text-gray-500 dark:text-gray-400">
                              Budget:{' '}
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {formatCurrency(alloc.max_amount, alloc.currency)}
                              </span>
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <span className="text-gray-500 dark:text-gray-400">
                              Approved:{' '}
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {formatCurrency(alloc.total_approved, alloc.currency)}
                              </span>
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <span
                              className={`font-medium ${alloc.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                            >
                              Remaining: {formatCurrency(alloc.remaining, alloc.currency)}
                            </span>
                          </>
                        )}
                        {!alloc && tiers.length > 0 && (
                          <span className="text-gray-400 dark:text-gray-500 italic">
                            Select a tier to set the budget
                          </span>
                        )}
                        {!alloc && tiers.length === 0 && (
                          <span className="text-gray-400 dark:text-gray-500 italic">
                            Create expense tiers in Settings &gt; Finance &gt; Speaker Expenses
                          </span>
                        )}
                      </div>
                    );
                  })()}

                {/* Expanded expense rows */}
                {expandedSpeaker === group.speakerName && (
                  <div className="border-t border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
                            Date
                          </th>
                          <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
                            Title
                          </th>
                          <th className="text-right px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
                            Amount
                          </th>
                          <th
                            className="text-center px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-10"
                            title="Attachments"
                          >
                            <svg
                              className="w-4 h-4 mx-auto"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={1.5}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                              />
                            </svg>
                          </th>
                          <th className="text-center px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
                            Status
                          </th>
                          {isAdmin && (
                            <th className="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {group.expenses.map((expense) => (
                          <tr
                            key={expense.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                            onClick={() => setSelectedExpense(expense)}
                          >
                            <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                              {expense.expense_date}
                            </td>
                            <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                              {expense.title}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">
                              {formatCurrency(expense.original_amount, expense.original_currency)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {expense.attachment_count > 0 ? (
                                <span
                                  className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400"
                                  title={`${expense.attachment_count} file(s)`}
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                                    />
                                  </svg>
                                  <span className="text-xs font-medium">
                                    {expense.attachment_count}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[expense.status] || ''}`}
                              >
                                {expense.status}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-2">
                                  {expense.status === 'submitted' && (
                                    <>
                                      <button
                                        onClick={() => approveExpense.mutate(expense.id)}
                                        className="text-xs text-green-600 dark:text-green-400 hover:underline"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => setRejectId(expense.id)}
                                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {expense.status === 'approved' && (
                                    <button
                                      onClick={() => markPaid.mutate(expense.id)}
                                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                                    >
                                      Mark Paid
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Add expense button/form */}
                    {isAdmin && (
                      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
                        {addExpenseFor?.cfpApplicantId === group.cfpApplicantId ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="date"
                              value={newExpense.date}
                              onChange={(e) =>
                                setNewExpense((p) => ({ ...p, date: e.target.value }))
                              }
                              className="text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5"
                            />
                            <input
                              type="text"
                              placeholder="Title (e.g. Hotel)"
                              value={newExpense.title}
                              onChange={(e) =>
                                setNewExpense((p) => ({ ...p, title: e.target.value }))
                              }
                              className="flex-1 min-w-32 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5"
                            />
                            <input
                              type="number"
                              placeholder="Amount"
                              value={newExpense.amount}
                              onChange={(e) =>
                                setNewExpense((p) => ({ ...p, amount: e.target.value }))
                              }
                              className="w-28 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5"
                              step="0.01"
                              min="0"
                            />
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {currency}
                            </span>
                            <button
                              onClick={() => {
                                const amount = parseFloat(newExpense.amount);
                                if (
                                  !newExpense.title.trim() ||
                                  isNaN(amount) ||
                                  amount <= 0 ||
                                  !newExpense.date
                                )
                                  return;
                                createExpense.mutate({
                                  cfp_applicant_id: group.cfpApplicantId,
                                  title: newExpense.title.trim(),
                                  expense_date: newExpense.date,
                                  original_amount: amount,
                                  original_currency: currency,
                                  description: newExpense.description || undefined,
                                  status: 'submitted',
                                });
                              }}
                              disabled={createExpense.isPending}
                              className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setAddExpenseFor(null)}
                              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setAddExpenseFor({
                                speakerName: group.speakerName,
                                cfpApplicantId: group.cfpApplicantId,
                              })
                            }
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={1.5}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 4.5v15m7.5-7.5h-15"
                              />
                            </svg>
                            Add Expense
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {speakerGroups.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No expenses found. Speakers submit expenses through the portal.
              </div>
            )}
          </div>
        </>
      )}

      {activeView === 'allowances' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Speaker
                </th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Tier
                </th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Allowance
                </th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Claimed
                </th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Approved
                </th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Remaining
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {allowances?.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                    {a.speaker_name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && tiers.length > 0 ? (
                      <select
                        value={a.expense_tier_id || ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            assignTier.mutate({
                              cfpApplicantId: a.cfp_applicant_id,
                              tierId: e.target.value,
                              allowanceId: a.id,
                            });
                          }
                        }}
                        className="text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1"
                      >
                        <option value="">— Select tier —</option>
                        {tiers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({formatCurrency(t.max_amount, t.currency)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {a.expense_tier_name || '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                    {formatCurrency(a.max_amount, a.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                    {formatCurrency(a.total_claimed, a.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                    {formatCurrency(a.total_approved, a.currency)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${a.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                  >
                    {formatCurrency(a.remaining, a.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!allowances || allowances.length === 0) && (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              No speaker allowances configured. Set up allowance defaults by session type first.
            </div>
          )}
        </div>
      )}

      {activeView === 'defaults' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Set maximum expense allowances per session type. When a speaker is assigned to a
              session, their allowance is automatically set from the session type default.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Session Type
                </th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Max Amount
                </th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  Currency
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {allowanceDefaults?.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                    {d.session_type_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                    {formatCurrency(d.max_amount, d.currency)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!allowanceDefaults || allowanceDefaults.length === 0) && (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              No allowance defaults configured. Use the API to set defaults per session type.
            </div>
          )}
        </div>
      )}

      {/* Expense detail slide-over panel */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedExpense(null)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Expense Details
              </h3>
              <button
                onClick={() => setSelectedExpense(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex px-2.5 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[selectedExpense.status] || ''}`}
                >
                  {selectedExpense.status}
                </span>
                {selectedExpense.rejection_reason && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    Rejected: {selectedExpense.rejection_reason}
                  </span>
                )}
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Speaker</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedExpense.speaker_name}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Date</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedExpense.expense_date}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Title</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedExpense.title}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Category</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedExpense.category_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Amount</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(
                      selectedExpense.original_amount,
                      selectedExpense.original_currency
                    )}
                  </p>
                </div>
                {selectedExpense.session_title && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Session</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {selectedExpense.session_title}
                    </p>
                  </div>
                )}
              </div>

              {/* Description / Notes */}
              {selectedExpense.description && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                    {selectedExpense.description}
                  </p>
                </div>
              )}
              {selectedExpense.notes && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                    {selectedExpense.notes}
                  </p>
                </div>
              )}

              {/* Attachments */}
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Attachments ({selectedExpense.attachment_count})
                </p>
                {attachments && attachments.length > 0 ? (
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <svg
                            className="w-5 h-5 shrink-0 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                            />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                              {att.filename}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(att.file_size)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => downloadAttachment(att.id, att.filename)}
                          className="shrink-0 text-sm text-blue-600 dark:text-blue-400 hover:underline ml-2"
                        >
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                ) : selectedExpense.attachment_count === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No files attached.</p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                )}
              </div>

              {/* Admin actions */}
              {isAdmin && selectedExpense.status === 'submitted' && (
                <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      approveExpense.mutate(selectedExpense.id);
                      setSelectedExpense(null);
                    }}
                    className="flex-1 text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setRejectId(selectedExpense.id);
                      setSelectedExpense(null);
                    }}
                    className="flex-1 text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              )}
              {isAdmin && selectedExpense.status === 'approved' && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      markPaid.mutate(selectedExpense.id);
                      setSelectedExpense(null);
                    }}
                    className="w-full text-sm px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Mark as Paid
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Reject Expense
            </h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectId(null);
                  setRejectReason('');
                }}
                className="text-sm px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectExpense.mutate({ expenseId: rejectId, reason: rejectReason })}
                disabled={!rejectReason.trim()}
                className="text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send message modal */}
      <ComposeModal
        conferenceId={conference.id}
        open={!!messageRecipient}
        onClose={() => setMessageRecipient(null)}
        onSend={handleSendMessage}
        sending={messageSending}
        initialRecipient={messageRecipient}
        initialSubject="Regarding your speaker expenses"
      />
    </div>
  );
}
