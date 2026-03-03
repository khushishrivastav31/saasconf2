import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type { Conference } from '../../../../types';

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

export default function MessagingSettingsTab({ conference, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const currentMode: string =
    ((conference.settings as Record<string, unknown>)?.messaging_mode as string) ?? 'in_app';
  const [mode, setMode] = useState(currentMode);

  const updateMutation = useMutation({
    mutationFn: async (newMode: string) => {
      const currentSettings = (conference.settings as Record<string, unknown>) ?? {};
      await api.put(`/conferences/${conference.id}`, {
        settings: { ...currentSettings, messaging_mode: newMode },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conferences.detail(conference.id) });
    },
  });

  const handleChange = (newMode: string) => {
    setMode(newMode);
    updateMutation.mutate(newMode);
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messaging Mode</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose how messages are delivered for this conference.
        </p>
      </div>

      <div className="space-y-4 max-w-xl">
        <label
          className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
            mode === 'in_app'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          } ${!isAdmin ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input
            type="radio"
            name="messaging_mode"
            value="in_app"
            checked={mode === 'in_app'}
            onChange={() => handleChange('in_app')}
            disabled={!isAdmin}
            className="mt-1 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">In-App Messaging</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Messages are delivered within the platform. Recipients receive email notifications
              with a link to view the message. This is the default mode.
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
            mode === 'email_only'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          } ${!isAdmin ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input
            type="radio"
            name="messaging_mode"
            value="email_only"
            checked={mode === 'email_only'}
            onChange={() => handleChange('email_only')}
            disabled={!isAdmin}
            className="mt-1 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Email Only</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Messages are sent directly as emails. The full message content is included in the
              email body. No in-app thread is visible to recipients, but threads are still recorded
              for your reference.
            </p>
            {conference.contact_email ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                <svg
                  className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Reply-to address:{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {conference.contact_email}
                </span>
              </p>
            ) : (
              <p className="text-sm text-amber-600 mt-2 flex items-center gap-1.5">
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                No contact email set. Configure one in Conference Details so recipients can reply.
              </p>
            )}
          </div>
        </label>
      </div>

      {updateMutation.isPending && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Saving...</p>
      )}
      {updateMutation.isError && (
        <p className="mt-4 text-sm text-red-600">Failed to save. Please try again.</p>
      )}
      {updateMutation.isSuccess && !updateMutation.isPending && (
        <p className="mt-4 text-sm text-green-600">Saved successfully.</p>
      )}
    </div>
  );
}
