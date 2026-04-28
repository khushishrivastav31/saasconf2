import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';

type MessagingMode = 'in_app' | 'email_only';

interface MessagingSettingsResponse {
  messaging_mode: MessagingMode;
}

/**
 * Trainings → Settings → Messaging tab.
 *
 * Mirrors the per-conference Messaging Mode toggle so the trainings
 * admin gets the same options. Stored on
 * ``tenant.settings.training_messaging_settings.messaging_mode``;
 * defaults to ``email_only`` because that's the historical
 * training-broadcast behavior (full subject + body land directly in the
 * recipient's inbox). Switching to ``in_app`` makes broadcasts send a
 * notification email with a portal link instead — same as conferences.
 */
export default function MessagingSettingsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['training-messaging-settings'],
    queryFn: async (): Promise<MessagingSettingsResponse> => {
      const resp = await api.get<MessagingSettingsResponse>('/trainings/messaging-settings');
      return resp.data;
    },
    staleTime: 30_000,
  });

  const [mode, setMode] = useState<MessagingMode>('email_only');

  // Sync local state with server state whenever the query refreshes.
  useEffect(() => {
    if (data?.messaging_mode) setMode(data.messaging_mode);
  }, [data?.messaging_mode]);

  const updateMutation = useMutation({
    mutationFn: async (newMode: MessagingMode) => {
      const resp = await api.put<MessagingSettingsResponse>('/trainings/messaging-settings', {
        messaging_mode: newMode,
      });
      return resp.data;
    },
    onSuccess: (resp) => {
      setMode(resp.messaging_mode);
      queryClient.invalidateQueries({ queryKey: ['training-messaging-settings'] });
      showToast('Messaging mode saved', 'success');
    },
    onError: () => showToast('Failed to save messaging mode', 'error'),
  });

  const handleChange = (newMode: MessagingMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    updateMutation.mutate(newMode);
  };

  if (isLoading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Loading…</div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messaging Mode</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose how training broadcasts are delivered.
        </p>
      </div>

      <div className="space-y-4 max-w-xl">
        <label
          className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
            mode === 'in_app'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            name="training-messaging-mode"
            value="in_app"
            checked={mode === 'in_app'}
            onChange={() => handleChange('in_app')}
            className="mt-1 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">In-App Messaging</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Broadcasts are delivered within the platform. Recipients receive an email notification
              with a link to view the message in their portal.
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
            mode === 'email_only'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            name="training-messaging-mode"
            value="email_only"
            checked={mode === 'email_only'}
            onChange={() => handleChange('email_only')}
            className="mt-1 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Email Only</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Broadcasts are sent directly as emails. The full message content goes into the email
              body. Threads are still recorded for your reference in the admin Messages tab.{' '}
              <span className="font-medium">This is the default for trainings.</span>
            </p>
          </div>
        </label>
      </div>

      {updateMutation.isPending && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Saving…</p>
      )}
    </div>
  );
}
