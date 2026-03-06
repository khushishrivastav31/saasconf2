import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { parseApiError } from '../../../../utils/apiError';
import type {
  VatRateByCountry,
  VatRateByCountryCreate,
  VatRateByCountryUpdate,
} from '../../../../types';

const emptyVatRate: VatRateByCountryCreate = {
  country_code: '',
  country_name: '',
  standard_rate: 0,
};

function EuVatRatesReference() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [vatRateForm, setVatRateForm] = useState<VatRateByCountryCreate | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);

  const { data: euRates, isLoading } = useQuery({
    queryKey: ['vat-rates'],
    queryFn: async () => {
      const res = await api.get<VatRateByCountry[]>('/vat-rates');
      return res.data;
    },
  });

  const createVatRate = useMutation({
    mutationFn: async (data: VatRateByCountryCreate) => {
      await api.post('/vat-rates', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-rates'] });
      setVatRateForm(null);
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const updateVatRate = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VatRateByCountryUpdate }) => {
      await api.put(`/vat-rates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-rates'] });
      setVatRateForm(null);
      setEditingRateId(null);
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteVatRate = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vat-rates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-rates'] });
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleSave = () => {
    if (!vatRateForm) return;

    if (!vatRateForm.country_code || vatRateForm.country_code.length !== 2) {
      setError('Country code must be exactly 2 characters (ISO code)');
      return;
    }
    if (!vatRateForm.country_name) {
      setError('Country name is required');
      return;
    }
    if (vatRateForm.standard_rate < 0 || vatRateForm.standard_rate > 100) {
      setError('Tax rate must be between 0 and 100');
      return;
    }

    setError(null);

    if (editingRateId) {
      updateVatRate.mutate({
        id: editingRateId,
        data: {
          country_name: vatRateForm.country_name,
          standard_rate: vatRateForm.standard_rate,
        },
      });
    } else {
      createVatRate.mutate(vatRateForm);
    }
  };

  const startEdit = (rate: VatRateByCountry) => {
    setEditingRateId(rate.id);
    setVatRateForm({
      country_code: rate.country_code,
      country_name: rate.country_name,
      standard_rate: rate.standard_rate,
    });
  };

  if (isLoading) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mt-4">
        <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Country VAT/Tax Rates
        </h6>
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mt-4">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Country VAT/Tax Rates
          </h6>
          {!vatRateForm && (
            <button
              type="button"
              onClick={() => {
                setVatRateForm({ ...emptyVatRate });
                setEditingRateId(null);
              }}
              className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              + Add Country Rate
            </button>
          )}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <p>
            Manage VAT/GST/Sales Tax rates for all countries. These rates are used for automatic
            invoice calculation and as suggestions when setting up conference tax rates.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-900">
            ×
          </button>
        </div>
      )}

      {vatRateForm && (
        <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md space-y-3">
          <h6 className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {editingRateId ? 'Edit Country Rate' : 'New Country Rate'}
          </h6>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">
                Country Code (ISO)
              </label>
              <input
                type="text"
                maxLength={2}
                placeholder="e.g. DE"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 uppercase"
                value={vatRateForm.country_code}
                onChange={(e) =>
                  setVatRateForm({ ...vatRateForm, country_code: e.target.value.toUpperCase() })
                }
                disabled={!!editingRateId}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">Country Name</label>
              <input
                type="text"
                placeholder="e.g. Germany"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={vatRateForm.country_name}
                onChange={(e) => setVatRateForm({ ...vatRateForm, country_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="19.00"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={vatRateForm.standard_rate}
                onChange={(e) =>
                  setVatRateForm({ ...vatRateForm, standard_rate: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
            >
              {editingRateId ? 'Update' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setVatRateForm(null);
                setEditingRateId(null);
                setError(null);
              }}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {euRates && euRates.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-1.5 pr-3">Country</th>
                <th className="py-1.5 pr-3">Code</th>
                <th className="py-1.5 pr-3">Rate</th>
                <th className="py-1.5 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {euRates.map((rate) => (
                <tr key={rate.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                    {rate.country_name}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400 font-mono">
                    {rate.country_code}
                  </td>
                  <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-gray-100">
                    {rate.standard_rate}%
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(rate)}
                        className="text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                        title="Edit"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${rate.country_name} rate? This cannot be undone.`
                            )
                          ) {
                            deleteVatRate.mutate(rate.id);
                          }
                        }}
                        className="text-gray-500 hover:text-red-600"
                        title="Delete"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !vatRateForm && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No country tax rates defined. Click "+ Add Country Rate" to create one.
          </p>
        )
      )}
    </div>
  );
}

export default EuVatRatesReference;
