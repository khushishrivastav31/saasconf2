import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type {
  Conference,
  ConferenceUpdate,
  PlatformCurrency,
  PaginatedResponse,
} from '../../../../types';
import FiscalRepSection from '../FiscalRepSection';

function FinancialSettingsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const [formData, setFormData] = useState({
    currency: conference.currency || '',
    invoice_currency: conference.invoice_currency || '',
  });

  const { data: currencyOptions } = useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
  });

  const { showToast } = useToast();
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const [debounceTimeout, setDebounceTimeout] = useState<ReturnType<typeof setTimeout> | null>(
    null
  );

  const updateMutation = useMutation({
    mutationFn: async (data: ConferenceUpdate) => {
      const payload = {
        ...data,
        currency: data.currency || null,
        invoice_currency: data.invoice_currency || null,
      };
      await api.put(`/conferences/${conference.id}`, payload);
    },
    onMutate: () => setSaving(),
    onSuccess: () => setSaved(),
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const handleFieldChange = (field: 'currency' | 'invoice_currency', value: string) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    if (debounceTimeout) clearTimeout(debounceTimeout);

    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setDebounceTimeout(timeout);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Currency & Tax</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Configure currencies and tax representation for this conference.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Save failed
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Currency Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Currencies</h5>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Primary Currency
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.currency}
                onChange={(e) => handleFieldChange('currency', e.target.value)}
                disabled={!isAdmin}
              >
                <option value="">Select currency...</option>
                {(currencyOptions || []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used for all pricing in this conference.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Second Currency
                <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(optional)</span>
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.invoice_currency}
                onChange={(e) => handleFieldChange('invoice_currency', e.target.value)}
                disabled={!isAdmin}
              >
                <option value="">Same as primary</option>
                {(currencyOptions || []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Alternative currency for invoices.
              </p>
            </div>
          </div>
        </div>

        {/* Tax & VAT */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <FiscalRepSection
            conferenceId={conference.id}
            conferenceCountry={conference.country}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </div>
  );
}

export default FinancialSettingsTab;
