import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { parseApiError } from '../../utils/apiError';
import { useToast } from '../../components/Toast';
import type { EmailFailureList } from './types';

const EMAIL_TYPE_LABELS: Record<string, string> = {
  general: 'General',
  verification: 'Email Verification',
  submission_confirmation: 'Submission Confirmation',
  cospeaker_invitation: 'Co-Speaker Invitation',
  password_reset: 'Password Reset',
  tenant_welcome: 'Tenant Welcome',
  team_invitation: 'Team Invitation',
  deadline_reminder: 'Deadline Reminder',
  direct_message: 'Direct Message',
  message_notification: 'Message Notification',
  registration_invoice: 'Registration Invoice',
  attendee_welcome: 'Attendee Welcome',
  invoice: 'Invoice',
  cancellation: 'Cancellation',
  payment_reminder: 'Payment Reminder',
  admin_notification: 'Admin Notification',
  sponsor_contract: 'Sponsor Contract',
  registration_replacement: 'Registration Replacement',
};

export default function EmailFailuresSection() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);

  const { data: failures, isLoading } = useQuery<EmailFailureList>({
    queryKey: ['email-failures', page],
    queryFn: async () => {
      const res = await api.get('/my-company/email-failures', {
        params: { page, page_size: 10, acknowledged: false },
      });
      return res.data;
    },
    refetchInterval: 60000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/my-company/email-failures/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-failures'] });
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      await api.post('/my-company/email-failures/acknowledge-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-failures'] });
      showToast('All failures acknowledged', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  if (isLoading) return null;
  if (!failures || failures.total_unacknowledged === 0) return null;

  const totalPages = Math.ceil(failures.total / failures.page_size);

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Email Delivery Failures
          </h5>
          <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
            {failures.total_unacknowledged}
          </span>
        </div>
        {failures.total_unacknowledged > 1 && (
          <button
            onClick={() => acknowledgeAllMutation.mutate()}
            disabled={acknowledgeAllMutation.isPending}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Acknowledge All
          </button>
        )}
      </div>

      <div className="space-y-2">
        {failures.items.map((failure) => (
          <div
            key={failure.id}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
                    {failure.status === 'not_configured' ? 'Not Configured' : 'Failed'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {EMAIL_TYPE_LABELS[failure.email_type] || failure.email_type}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(failure.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100 truncate">
                  To: {failure.recipient_email}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                  Subject: {failure.subject}
                </p>
                {failure.error_message && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {failure.error_message}
                  </p>
                )}
              </div>
              <button
                onClick={() => acknowledgeMutation.mutate(failure.id)}
                disabled={acknowledgeMutation.isPending}
                className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                title="Acknowledge"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
