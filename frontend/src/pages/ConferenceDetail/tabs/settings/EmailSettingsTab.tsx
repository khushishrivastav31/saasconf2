import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type { Conference } from '../../../../types';

function EmailSettingsTab({ conference, isAdmin }: { conference: Conference; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const emailSendingEnabled = (conference.settings?.email_sending_enabled as boolean) ?? true;

  const toggleEmailSending = useMutation({
    mutationFn: async () => {
      const newSettings = {
        ...conference.settings,
        email_sending_enabled: !emailSendingEnabled,
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast(
        emailSendingEnabled ? 'Email sending disabled' : 'Email sending enabled',
        'success'
      );
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to update setting'), 'error');
    },
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Settings</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Control outgoing email notifications for this conference.
        </p>
      </div>

      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex items-center h-6">
            <input
              type="checkbox"
              id="email-sending-enabled"
              checked={emailSendingEnabled}
              onChange={() => toggleEmailSending.mutate()}
              disabled={!isAdmin || toggleEmailSending.isPending}
              className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="email-sending-enabled"
              className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
            >
              Enable email sending
            </label>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              When enabled, the system will send email notifications to recipients via Resend (e.g.
              submission confirmations, co-speaker invitations, message notifications). When
              disabled, all outgoing emails for this conference are suppressed.
            </p>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Note: Account verification and password reset emails are always sent regardless of
              this setting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailSettingsTab;
