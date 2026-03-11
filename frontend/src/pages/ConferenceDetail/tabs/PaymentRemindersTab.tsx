import { memo, useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { useToast } from '../../../components/Toast';
import type {
  Conference,
  PaymentReminder,
  PaymentReminderSettings,
  PaymentReminderStats,
} from '../../../types/conference';

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

function PaymentRemindersTab({ conference, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reminderFilter, setReminderFilter] = useState('');
  const debouncedSearch = useRef('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        debouncedSearch.current = value;
        queryClient.invalidateQueries({
          queryKey: queryKeys.paymentReminders.byConference(conference.id),
        });
      }, 300);
    },
    [conference.id, queryClient]
  );

  // Fetch reminders
  const { data, isLoading } = useQuery({
    queryKey: [
      ...queryKeys.paymentReminders.byConference(conference.id),
      statusFilter,
      reminderFilter,
      debouncedSearch.current,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (reminderFilter) params.set('reminder_number', reminderFilter);
      if (debouncedSearch.current) params.set('search', debouncedSearch.current);
      params.set('limit', '200');
      const res = await api.get<{ items: PaymentReminder[]; total: number }>(
        `/conferences/${conference.id}/payment-reminders?${params}`
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: queryKeys.paymentReminders.stats(conference.id),
    queryFn: async () => {
      const res = await api.get<PaymentReminderStats>(
        `/conferences/${conference.id}/payment-reminders/stats`
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: queryKeys.paymentReminders.settings(conference.id),
    queryFn: async () => {
      const res = await api.get<PaymentReminderSettings>(
        `/conferences/${conference.id}/settings/payment-reminder-settings`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  // Resend mutation
  const resendMutation = useMutation({
    mutationFn: async (reminderId: string) => {
      const res = await api.post(
        `/conferences/${conference.id}/payment-reminders/${reminderId}/resend`
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Reminder resent successfully', 'success');
      } else {
        showToast(data.message || 'Failed to resend', 'error');
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.paymentReminders.byConference(conference.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.paymentReminders.stats(conference.id),
      });
    },
    onError: () => {
      showToast('Failed to resend reminder', 'error');
    },
  });

  const reminders = data?.items ?? [];

  const statusBadge = useCallback((status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Payment Reminders
        </h2>
        {settings && !settings.payment_reminders_enabled && (
          <span className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full">
            Reminders disabled in settings
          </span>
        )}
      </div>

      {/* Stats bar */}
      {stats && stats.total > 0 && (
        <div className="flex gap-4 text-sm">
          <span className="text-yellow-600 dark:text-yellow-400">{stats.pending} pending</span>
          <span className="text-green-600 dark:text-green-400">{stats.sent} sent</span>
          <span className="text-red-600 dark:text-red-400">{stats.failed} failed</span>
          <span className="text-gray-500 dark:text-gray-400">{stats.total} total</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search invoice # or recipient..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={reminderFilter}
          onChange={(e) => setReminderFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Reminders</option>
          <option value="1">1st Reminder</option>
          <option value="2">2nd Reminder</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
            />
          </svg>
          <p className="text-lg font-medium">No payment reminders yet</p>
          <p className="text-sm mt-1">
            Reminders are automatically sent for overdue invoices based on your{' '}
            <span className="font-medium">Settings &gt; Payment Reminders</span> configuration.
          </p>
          {settings && (
            <p className="text-xs mt-2 text-gray-400 dark:text-gray-500">
              1st reminder: {settings.first_reminder_days} days after due date | 2nd reminder:{' '}
              {settings.second_reminder_days} days after due date
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Scheduled
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {reminders.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  isAdmin={isAdmin}
                  onResend={() => resendMutation.mutate(r.id)}
                  isResending={resendMutation.isPending}
                  statusBadge={statusBadge}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ReminderRowProps {
  reminder: PaymentReminder;
  isAdmin: boolean;
  onResend: () => void;
  isResending: boolean;
  statusBadge: (status: string) => string;
}

const ReminderRow = memo(function ReminderRow({
  reminder: r,
  isAdmin,
  onResend,
  isResending,
  statusBadge,
}: ReminderRowProps) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
            r.reminder_number === 1
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
          }`}
        >
          {r.reminder_number}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
        {r.invoice_number || '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        <div>{r.recipient_name || '—'}</div>
        {r.recipient_email && (
          <div className="text-xs text-gray-500 dark:text-gray-400">{r.recipient_email}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
        {r.invoice_amount ? `${r.invoice_amount} ${r.currency || ''}` : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {new Date(r.scheduled_date).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {r.sent_at ? new Date(r.sent_at).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}
        >
          {r.status}
        </span>
        {r.error_message && (
          <div className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={r.error_message}>
            {r.error_message}
          </div>
        )}
      </td>
      {isAdmin && (
        <td className="px-4 py-3">
          {(r.status === 'failed' || r.status === 'sent') && (
            <button
              onClick={onResend}
              disabled={isResending}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
            >
              Resend
            </button>
          )}
        </td>
      )}
    </tr>
  );
});

export default memo(PaymentRemindersTab);
