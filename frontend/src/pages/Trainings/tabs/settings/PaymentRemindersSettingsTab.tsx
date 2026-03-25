import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';

interface ReminderSettings {
  enabled: boolean;
  first_reminder_days: number;
  second_reminder_days: number;
  notify_admin_after_second: boolean;
}

const DEFAULTS: ReminderSettings = {
  enabled: true,
  first_reminder_days: 2,
  second_reminder_days: 17,
  notify_admin_after_second: true,
};

export default function PaymentRemindersSettingsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<ReminderSettings>({
    queryKey: [...queryKeys.trainingFinance, 'payment-reminders'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/payment-reminders');
      return res.data;
    },
  });

  const [form, setForm] = useState<ReminderSettings>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data && !isDirty) setForm(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const updateField = useCallback(
    <K extends keyof ReminderSettings>(key: K, value: ReminderSettings[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
    },
    []
  );

  const mutation = useMutation({
    mutationFn: async (payload: ReminderSettings) => {
      await api.put('/trainings/finance/payment-reminders', payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Payment reminder settings saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleDiscard = useCallback(() => {
    if (data) {
      setForm(data);
      setIsDirty(false);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Payment Reminders
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure automatic payment reminders for overdue training invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Discard
            </button>
          )}
          <button
            onClick={() => mutation.mutate(form)}
            disabled={!isDirty || mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => updateField('enabled', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Enable automatic payment reminders
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The system sends reminders for overdue invoices on a daily basis.
            </p>
          </div>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              1st Reminder (days after due date)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={form.first_reminder_days}
              onChange={(e) =>
                updateField(
                  'first_reminder_days',
                  Math.max(1, Math.min(90, Number(e.target.value)))
                )
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              2nd Reminder (days after due date)
            </label>
            <input
              type="number"
              min={1}
              max={180}
              value={form.second_reminder_days}
              onChange={(e) =>
                updateField(
                  'second_reminder_days',
                  Math.max(1, Math.min(180, Number(e.target.value)))
                )
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.notify_admin_after_second}
            onChange={(e) => updateField('notify_admin_after_second', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Notify admin after 2nd reminder
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sends an email to the admin when an invoice remains unpaid after the second reminder.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
