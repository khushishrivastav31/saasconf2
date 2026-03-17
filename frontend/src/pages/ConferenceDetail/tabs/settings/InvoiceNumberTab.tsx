import { useState, useEffect, useContext, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../types';
import { DirtyContext } from '../../DirtyContext';

interface InvoiceSettings {
  invoice_number_template: string;
  invoice_counter_reset: 'daily' | 'yearly';
  invoice_counter_value: number;
  cancellation_number_template: string;
  cancellation_counter_reset: 'daily' | 'yearly';
  cancellation_counter_value: number;
  invoice_template_html: string;
  invoice_company_info: Record<string, unknown>;
}

interface NumberSettingsUpdate {
  invoice_number_template?: string;
  invoice_counter_reset?: 'daily' | 'yearly';
  invoice_counter_value?: number;
  cancellation_number_template?: string;
  cancellation_counter_reset?: 'daily' | 'yearly';
  cancellation_counter_value?: number;
}

export default function InvoiceNumberTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Invoice number state
  const [template, setTemplate] = useState('[ConferenceSlug]_[YYYY]_[Count]');
  const [counterReset, setCounterReset] = useState<'daily' | 'yearly'>('yearly');
  const [counterValue, setCounterValue] = useState(1);

  // Cancellation number state
  const [cancTemplate, setCancTemplate] = useState('[ConferenceSlug]_C_[YYYY]_[Count]');
  const [cancCounterReset, setCancCounterReset] = useState<'daily' | 'yearly'>('yearly');
  const [cancCounterValue, setCancCounterValue] = useState(1);

  const [error, setError] = useState<string | null>(null);

  // Fetch settings
  const { data: settings, isLoading } = useQuery<InvoiceSettings>({
    queryKey: queryKeys.invoiceSettings(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/invoice-settings`);
      return res.data;
    },
  });

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      setTemplate(settings.invoice_number_template);
      setCounterReset(settings.invoice_counter_reset);
      setCounterValue(settings.invoice_counter_value);
      setCancTemplate(settings.cancellation_number_template);
      setCancCounterReset(settings.cancellation_counter_reset);
      setCancCounterValue(settings.cancellation_counter_value);
    }
  }, [settings]);

  // Track dirty state for unsaved changes guard
  const isDirty = useMemo(() => {
    if (!settings) return false;
    return (
      template !== settings.invoice_number_template ||
      counterReset !== settings.invoice_counter_reset ||
      counterValue !== settings.invoice_counter_value ||
      cancTemplate !== settings.cancellation_number_template ||
      cancCounterReset !== settings.cancellation_counter_reset ||
      cancCounterValue !== settings.cancellation_counter_value
    );
  }, [
    settings,
    template,
    counterReset,
    counterValue,
    cancTemplate,
    cancCounterReset,
    cancCounterValue,
  ]);

  const reportDirty = useContext(DirtyContext);
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: NumberSettingsUpdate) => {
      const res = await api.put(`/conferences/${conference.id}/settings/invoice-settings`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conference.id) });
      showToast('Number settings saved successfully', 'success');
      setError(null);
    },
    onError: (err) => {
      const errorMessage = parseApiError(err, 'Failed to save number settings');
      setError(errorMessage);
      showToast(errorMessage, 'error');
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      invoice_number_template: template,
      invoice_counter_reset: counterReset,
      invoice_counter_value: counterValue,
      cancellation_number_template: cancTemplate,
      cancellation_counter_reset: cancCounterReset,
      cancellation_counter_value: cancCounterValue,
    });
  };

  // Generate preview number based on template
  const generatePreview = (tmpl: string, count: number) => {
    if (!conference?.abbreviation) return '';

    const now = new Date();
    let preview = tmpl;
    preview = preview.replace('[ConferenceSlug]', conference.abbreviation.toUpperCase());
    preview = preview.replace('[YYYY]', String(now.getFullYear()));
    preview = preview.replace('[MM]', String(now.getMonth() + 1).padStart(2, '0'));
    preview = preview.replace('[DD]', String(now.getDate()).padStart(2, '0'));
    preview = preview.replace('[Count]', String(count).padStart(5, '0'));
    return preview;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed';
  const counterInputClass =
    'w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <ErrorBanner message={error} />

      {/* Invoice Number Template Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Invoice Number Template
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure how invoice numbers are automatically generated.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template
            </label>
            <input
              type="text"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              disabled={!isAdmin}
              placeholder="ATD_[YYYY]_[Count]"
              className={inputClass}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Available variables: [ConferenceSlug], [YYYY], [MM], [DD], [Count]
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Counter Reset
            </label>
            <select
              value={counterReset}
              onChange={(e) => setCounterReset(e.target.value as 'daily' | 'yearly')}
              disabled={!isAdmin}
              className={inputClass}
            >
              <option value="yearly">Yearly (January 1st)</option>
              <option value="daily">Daily (Every Monday)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Current Counter Value
            </label>
            <input
              type="number"
              value={counterValue}
              onChange={(e) => setCounterValue(parseInt(e.target.value) || 1)}
              disabled={!isAdmin}
              min="1"
              className={counterInputClass}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Next invoice will be:{' '}
              <span className="font-mono font-semibold">
                {generatePreview(template, counterValue)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Cancellation Number Template Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Cancellation Number Template
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure how cancellation numbers are generated when invoices are cancelled. Uses a
            separate counter from invoice numbers.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template
            </label>
            <input
              type="text"
              value={cancTemplate}
              onChange={(e) => setCancTemplate(e.target.value)}
              disabled={!isAdmin}
              placeholder="ATD_C_[YYYY]_[Count]"
              className={inputClass}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Available variables: [ConferenceSlug], [YYYY], [MM], [DD], [Count]
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Counter Reset
            </label>
            <select
              value={cancCounterReset}
              onChange={(e) => setCancCounterReset(e.target.value as 'daily' | 'yearly')}
              disabled={!isAdmin}
              className={inputClass}
            >
              <option value="yearly">Yearly (January 1st)</option>
              <option value="daily">Daily (Every Monday)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Current Counter Value
            </label>
            <input
              type="number"
              value={cancCounterValue}
              onChange={(e) => setCancCounterValue(parseInt(e.target.value) || 1)}
              disabled={!isAdmin}
              min="1"
              className={counterInputClass}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Next cancellation will be:{' '}
              <span className="font-mono font-semibold">
                {generatePreview(cancTemplate, cancCounterValue)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
