import { useState, useEffect, useCallback } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { NUMBER_FORMAT_PRESETS, cardClass } from './CurrencyTaxTab';

export default function NumberFormatSection({ currentPreset }: { currentPreset: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState(currentPreset);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  useEffect(() => {
    setSelectedPreset(currentPreset);
  }, [currentPreset]);

  const saveMutation = useMutation({
    mutationFn: async (preset: string) => {
      await api.put('/trainings/finance/currency-tax', {
        number_format_preset: preset,
      });
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
    },
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const handlePresetChange = useCallback(
    (preset: string) => {
      setSelectedPreset(preset);
      saveMutation.mutate(preset);
    },
    [saveMutation]
  );

  const currentExample =
    NUMBER_FORMAT_PRESETS.find((p) => p.code === selectedPreset)?.example || '1,234,567.89';

  return (
    <div className={cardClass}>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Number Format</h5>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Controls how amounts appear on invoices and in the admin interface.
          </p>
        </div>
        {saveStatus === 'saving' && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <select
          className="block w-64 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          {NUMBER_FORMAT_PRESETS.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Example: <span className="font-mono font-medium">{currentExample}</span>
        </span>
      </div>
    </div>
  );
}
