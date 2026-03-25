import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';

interface ZugferdSettings {
  zugferd_enabled: boolean;
}

export default function ZugferdTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<ZugferdSettings>({
    queryKey: [...queryKeys.trainingFinance, 'zugferd'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/zugferd');
      return res.data;
    },
  });

  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (data) setEnabled(data.zugferd_enabled);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (value: boolean) => {
      await api.put('/trainings/finance/zugferd', { zugferd_enabled: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('ZUGFeRD settings saved', 'success');
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err), 'error');
    },
  });

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    mutation.mutate(checked);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          ZUGFeRD/Factur-X E-Invoicing
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Enable hybrid e-invoicing with embedded XML for EU compliance.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Enable ZUGFeRD/Factur-X
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Invoices will include embedded XML data for automated processing.
            </p>
          </div>
        </label>

        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
            Auto-Configured
          </h4>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            All ZUGFeRD parameters (profile, seller VAT ID, payment terms, tax category, invoice
            type) are automatically determined from your training and company data. No additional
            configuration is needed.
          </p>
        </div>
      </div>
    </div>
  );
}
