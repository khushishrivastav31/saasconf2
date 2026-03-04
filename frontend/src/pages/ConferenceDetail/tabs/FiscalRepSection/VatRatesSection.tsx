import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../../../config/api';
import { parseApiError } from '../../../../utils/apiError';
import type { ConferenceVatRate, ConferenceVatRateCreate, TaxInfo } from '../../../../types';

interface VatRatesSectionProps {
  conferenceId: string;
  vatRates: ConferenceVatRate[];
  taxInfo: TaxInfo | undefined;
  isAdmin: boolean;
  setError: (error: string | null) => void;
  invalidateAll: () => void;
}

const emptyVatRate: ConferenceVatRateCreate = {
  rate: 0,
  start_date: '',
  end_date: '',
  description: '',
};

function VatRatesSection({
  conferenceId,
  vatRates,
  taxInfo,
  isAdmin,
  setError,
  invalidateAll,
}: VatRatesSectionProps) {
  const [vatRateForm, setVatRateForm] = useState<ConferenceVatRateCreate | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);

  const createVatRate = useMutation({
    mutationFn: async (data: ConferenceVatRateCreate) => {
      await api.post(`/conferences/${conferenceId}/vat-rates`, data);
    },
    onSuccess: () => {
      setVatRateForm(null);
      invalidateAll();
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const updateVatRate = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConferenceVatRateCreate> }) => {
      await api.put(`/conferences/${conferenceId}/vat-rates/${id}`, data);
    },
    onSuccess: () => {
      setEditingRateId(null);
      setVatRateForm(null);
      invalidateAll();
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteVatRate = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/vat-rates/${id}`);
    },
    onSuccess: () => invalidateAll(),
    onError: (err) => setError(parseApiError(err)),
  });

  const handleSaveVatRate = () => {
    if (!vatRateForm) return;
    if (!vatRateForm.start_date || !vatRateForm.end_date) {
      setError('Start and end dates are required');
      return;
    }
    if (vatRateForm.end_date < vatRateForm.start_date) {
      setError('End date cannot be before start date');
      return;
    }
    setError(null);

    if (editingRateId) {
      updateVatRate.mutate({ id: editingRateId, data: vatRateForm });
    } else {
      createVatRate.mutate(vatRateForm);
    }
  };

  const startEditRate = (rate: ConferenceVatRate) => {
    setEditingRateId(rate.id);
    setVatRateForm({
      rate: rate.rate,
      start_date: rate.start_date,
      end_date: rate.end_date,
      description: rate.description || '',
    });
  };

  const isCurrentRate = (rate: ConferenceVatRate) => {
    const today = new Date().toISOString().split('T')[0];
    return rate.start_date <= today && today <= rate.end_date;
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300">VAT Rates</h6>
        {isAdmin && !vatRateForm && (
          <button
            type="button"
            onClick={() => {
              setVatRateForm({ ...emptyVatRate });
              setEditingRateId(null);
            }}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            + Add VAT Rate
          </button>
        )}
      </div>

      {taxInfo?.current_vat_rate !== null && taxInfo?.current_vat_rate !== undefined && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Current rate:{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {taxInfo.current_vat_rate}%
          </span>
        </p>
      )}

      {vatRates.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="py-1.5 pr-3">Rate</th>
              <th className="py-1.5 pr-3">Start Date</th>
              <th className="py-1.5 pr-3">End Date</th>
              <th className="py-1.5 pr-3">Description</th>
              {isAdmin && <th className="py-1.5 w-20">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {vatRates.map((rate) => (
              <tr
                key={rate.id}
                className={`border-b border-gray-100 dark:border-gray-800 ${
                  isCurrentRate(rate) ? 'bg-green-50 dark:bg-green-900/10' : ''
                }`}
              >
                <td className="py-1.5 pr-3 font-medium">
                  {rate.rate}%
                  {isCurrentRate(rate) && (
                    <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">
                      current
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{rate.start_date}</td>
                <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{rate.end_date}</td>
                <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">
                  {rate.description || '\u2014'}
                </td>
                {isAdmin && (
                  <td className="py-1.5">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEditRate(rate)}
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
                          if (window.confirm('Delete this VAT rate?')) {
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
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !vatRateForm && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No VAT rates defined.</p>
        )
      )}

      {/* VAT Rate Form (Add/Edit) */}
      {vatRateForm && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md space-y-3">
          <h6 className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {editingRateId ? 'Edit VAT Rate' : 'New VAT Rate'}
          </h6>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={vatRateForm.rate}
                onChange={(e) =>
                  setVatRateForm({ ...vatRateForm, rate: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">Start Date</label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={vatRateForm.start_date}
                onChange={(e) => setVatRateForm({ ...vatRateForm, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">End Date</label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={vatRateForm.end_date}
                min={vatRateForm.start_date}
                onChange={(e) => setVatRateForm({ ...vatRateForm, end_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">Description</label>
              <input
                type="text"
                placeholder="e.g. Standard rate 2026"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={vatRateForm.description}
                onChange={(e) => setVatRateForm({ ...vatRateForm, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveVatRate}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
            >
              {editingRateId ? 'Update' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setVatRateForm(null);
                setEditingRateId(null);
              }}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VatRatesSection;
