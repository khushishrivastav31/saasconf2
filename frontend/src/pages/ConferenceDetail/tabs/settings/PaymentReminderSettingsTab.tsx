import { useCallback, useContext, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type { Conference, PaymentReminderSettings } from '../../../../types/conference';
import { DirtyContext } from '../../DirtyContext';

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

const DEFAULTS: PaymentReminderSettings = {
  payment_reminders_enabled: true,
  first_reminder_days: 2,
  second_reminder_days: 17,
  notify_admin_after_second: true,
};

export default function PaymentReminderSettingsTab({ conference, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const reportDirty = useContext(DirtyContext);

  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.paymentReminders.settings(conference.id),
    queryFn: async () => {
      const res = await api.get<PaymentReminderSettings>(
        `/conferences/${conference.id}/settings/payment-reminder-settings`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const [form, setForm] = useState<PaymentReminderSettings>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  // Sync server data when not dirty
  useEffect(() => {
    if (settings && !isDirty) {
      setForm(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Report dirty state to parent for tab-switch guarding
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  const mutation = useMutation({
    mutationFn: async (data: PaymentReminderSettings) => {
      await api.put(`/conferences/${conference.id}/settings/payment-reminder-settings`, data);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({
        queryKey: queryKeys.paymentReminders.settings(conference.id),
      });
    },
  });

  const updateField = useCallback(
    <K extends keyof PaymentReminderSettings>(key: K, value: PaymentReminderSettings[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(() => {
    mutation.mutate(form);
  }, [form, mutation]);

  const handleDiscard = useCallback(() => {
    if (settings) {
      setForm(settings);
      setIsDirty(false);
    }
  }, [settings]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Payment Reminders
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure automatic payment reminders for overdue invoices.
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
            onClick={handleSave}
            disabled={!isDirty || mutation.isPending || !isAdmin}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-6">
        {/* Enable/disable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.payment_reminders_enabled}
            onChange={(e) => updateField('payment_reminders_enabled', e.target.checked)}
            disabled={!isAdmin}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Enable automatic payment reminders
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              When enabled, the system sends payment reminders for overdue invoices on a daily
              basis.
            </p>
          </div>
        </label>

        {/* Timing settings */}
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
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              A friendly reminder is sent this many days after the invoice due date (default: 2).
            </p>
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
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              A firmer reminder is sent this many days after the invoice due date (default: 17).
            </p>
          </div>
        </div>

        {/* Admin notification toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.notify_admin_after_second}
            onChange={(e) => updateField('notify_admin_after_second', e.target.checked)}
            disabled={!isAdmin}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Notify admin after 2nd reminder
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sends an email to the conference admin when an invoice remains unpaid after the second
              reminder.
            </p>
          </div>
        </label>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">How it works</h4>
        <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>The system checks overdue invoices daily and sends reminders automatically.</li>
          <li>Each invoice receives at most one 1st reminder and one 2nd reminder.</li>
          <li>
            Reminders are only sent for active invoices with status &quot;sent&quot; or
            &quot;overdue&quot;.
          </li>
          <li>Credit notes and paid/cancelled invoices are excluded.</li>
          <li>You can customize the email templates under Settings &gt; System Email Templates.</li>
        </ul>
      </div>
    </div>
  );
}
