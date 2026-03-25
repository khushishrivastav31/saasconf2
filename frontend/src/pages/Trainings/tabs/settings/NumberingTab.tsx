import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';

interface NumberingSettings {
  invoice_number_template: string;
  invoice_counter_reset: 'yearly' | 'daily';
  invoice_counter_value: number;
  cancellation_number_template: string;
  cancellation_counter_reset: 'yearly' | 'daily';
  cancellation_counter_value: number;
}

const DEFAULTS: NumberingSettings = {
  invoice_number_template: 'TRN_[YYYY]_[Count]',
  invoice_counter_reset: 'yearly',
  invoice_counter_value: 1,
  cancellation_number_template: 'TRN_C_[YYYY]_[Count]',
  cancellation_counter_reset: 'yearly',
  cancellation_counter_value: 1,
};

export default function NumberingTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<NumberingSettings>({
    queryKey: [...queryKeys.trainingFinance, 'numbering'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/numbering');
      return res.data;
    },
  });

  const [form, setForm] = useState<NumberingSettings>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data);
      setIsDirty(false);
    }
  }, [data]);

  const update = <K extends keyof NumberingSettings>(key: K, value: NumberingSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const mutation = useMutation({
    mutationFn: async (payload: NumberingSettings) => {
      await api.put('/trainings/finance/numbering', payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Numbering settings saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleDiscard = () => {
    if (data) {
      setForm(data);
      setIsDirty(false);
    }
  };

  const preview = (tmpl: string, count: number) => {
    const now = new Date();
    return tmpl
      .replace('[YYYY]', String(now.getFullYear()))
      .replace('[MM]', String(now.getMonth() + 1).padStart(2, '0'))
      .replace('[DD]', String(now.getDate()).padStart(2, '0'))
      .replace('[Count]', String(count).padStart(5, '0'));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-primary-500 focus:border-primary-500';

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Invoice &amp; Cancellation Numbering
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure how invoice and cancellation numbers are generated for trainings.
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

      {/* Invoice Numbering */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Invoice Number Template
          </h4>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template
            </label>
            <input
              type="text"
              value={form.invoice_number_template}
              onChange={(e) => update('invoice_number_template', e.target.value)}
              placeholder="TRN_[YYYY]_[Count]"
              className={inputClass}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Variables: [YYYY], [MM], [DD], [Count]
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Counter Reset
            </label>
            <select
              value={form.invoice_counter_reset}
              onChange={(e) =>
                update('invoice_counter_reset', e.target.value as 'yearly' | 'daily')
              }
              className={inputClass}
            >
              <option value="yearly">Yearly (January 1st)</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Counter Value
            </label>
            <input
              type="number"
              min={1}
              value={form.invoice_counter_value}
              onChange={(e) => update('invoice_counter_value', parseInt(e.target.value) || 1)}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Next:{' '}
              <span className="font-mono font-semibold">
                {preview(form.invoice_number_template, form.invoice_counter_value)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Cancellation Numbering */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Cancellation Number Template
          </h4>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template
            </label>
            <input
              type="text"
              value={form.cancellation_number_template}
              onChange={(e) => update('cancellation_number_template', e.target.value)}
              placeholder="TRN_C_[YYYY]_[Count]"
              className={inputClass}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Variables: [YYYY], [MM], [DD], [Count]
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Counter Reset
            </label>
            <select
              value={form.cancellation_counter_reset}
              onChange={(e) =>
                update('cancellation_counter_reset', e.target.value as 'yearly' | 'daily')
              }
              className={inputClass}
            >
              <option value="yearly">Yearly (January 1st)</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Counter Value
            </label>
            <input
              type="number"
              min={1}
              value={form.cancellation_counter_value}
              onChange={(e) => update('cancellation_counter_value', parseInt(e.target.value) || 1)}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Next:{' '}
              <span className="font-mono font-semibold">
                {preview(form.cancellation_number_template, form.cancellation_counter_value)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
