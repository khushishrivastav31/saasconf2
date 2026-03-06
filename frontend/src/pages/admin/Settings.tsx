import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import Modal from '../../components/Modal';
import type {
  PaginatedResponse,
  PlatformCurrency,
  PlatformCurrencyCreate,
  VatRateByCountry,
} from '../../types';

export default function Settings() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<PlatformCurrency | null>(null);
  const [editingVatRate, setEditingVatRate] = useState<VatRateByCountry | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['platform-currencies'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100 } }
      );
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (currencyData: PlatformCurrencyCreate) => {
      const response = await api.post<PlatformCurrency>('/admin/settings/currencies', currencyData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-currencies'] });
      setIsCreateModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: PlatformCurrencyCreate }) => {
      const response = await api.put<PlatformCurrency>(
        `/admin/settings/currencies/${id}`,
        updateData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-currencies'] });
      setEditingCurrency(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/settings/currencies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-currencies'] });
    },
  });

  const handleDelete = (currency: PlatformCurrency) => {
    if (window.confirm(`Delete currency "${currency.code} - ${currency.name}"?`)) {
      deleteMutation.mutate(currency.id);
    }
  };

  // VAT Rates queries and mutations
  const { data: vatRates, isLoading: isLoadingVatRates } = useQuery({
    queryKey: ['vat-rates'],
    queryFn: async () => {
      const response = await api.get<VatRateByCountry[]>('/vat-rates');
      return response.data;
    },
  });

  const updateVatRateMutation = useMutation({
    mutationFn: async ({
      country_code,
      standard_rate,
    }: {
      country_code: string;
      standard_rate: number;
    }) => {
      const response = await api.put<VatRateByCountry>(`/vat-rates/${country_code}`, {
        standard_rate,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-rates'] });
      setEditingVatRate(null);
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage platform-wide configuration
        </p>
      </div>

      {/* Currencies Section */}
      <div className="mb-12">
        <div className="sm:flex sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Currencies</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Global currency definitions available across all conferences
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Add Currency
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data?.items?.map((currency) => (
                  <tr key={currency.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {currency.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {currency.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {currency.symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          currency.is_active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                        }`}
                      >
                        {currency.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button
                        onClick={() => setEditingCurrency(currency)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(currency)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No currencies defined yet. Click "Add Currency" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* VAT Rates Section */}
      <div className="mb-12">
        <div className="sm:flex sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">EU VAT Rates</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Standard VAT rates for EU countries (used for automatic invoice VAT calculation)
            </p>
          </div>
        </div>

        {isLoadingVatRates ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Country
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Standard Rate (%)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {vatRates?.map((rate) => (
                  <tr key={rate.country_code}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {rate.country_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {rate.country_code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {Number(rate.standard_rate).toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(rate.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setEditingVatRate(rate)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {vatRates?.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No VAT rates configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add Currency"
        size="max-w-md"
      >
        <CurrencyForm
          onSubmit={(formData) => createMutation.mutate(formData)}
          onCancel={() => setIsCreateModalOpen(false)}
          isLoading={createMutation.isPending}
          error={
            createMutation.error
              ? (createMutation.error as { response?: { data?: { detail?: string } } }).response
                  ?.data?.detail || 'Failed to create currency'
              : null
          }
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editingCurrency}
        onClose={() => setEditingCurrency(null)}
        title="Edit Currency"
        size="max-w-md"
      >
        {editingCurrency && (
          <CurrencyForm
            currency={editingCurrency}
            onSubmit={(formData) =>
              updateMutation.mutate({ id: editingCurrency.id, data: formData })
            }
            onCancel={() => setEditingCurrency(null)}
            isLoading={updateMutation.isPending}
            error={
              updateMutation.error
                ? (updateMutation.error as { response?: { data?: { detail?: string } } }).response
                    ?.data?.detail || 'Failed to update currency'
                : null
            }
          />
        )}
      </Modal>

      {/* Edit VAT Rate Modal */}
      <Modal
        open={!!editingVatRate}
        onClose={() => setEditingVatRate(null)}
        title={`Edit VAT Rate - ${editingVatRate?.country_name}`}
        size="max-w-md"
      >
        {editingVatRate && (
          <VatRateForm
            vatRate={editingVatRate}
            onSubmit={(standard_rate) =>
              updateVatRateMutation.mutate({
                country_code: editingVatRate.country_code,
                standard_rate,
              })
            }
            onCancel={() => setEditingVatRate(null)}
            isLoading={updateVatRateMutation.isPending}
            error={
              updateVatRateMutation.error
                ? (updateVatRateMutation.error as { response?: { data?: { detail?: string } } })
                    .response?.data?.detail || 'Failed to update VAT rate'
                : null
            }
          />
        )}
      </Modal>
    </div>
  );
}

function CurrencyForm({
  currency,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: {
  currency?: PlatformCurrency;
  onSubmit: (data: PlatformCurrencyCreate) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState(currency?.code || '');
  const [name, setName] = useState(currency?.name || '');
  const [symbol, setSymbol] = useState(currency?.symbol || '');
  const [isActive, setIsActive] = useState(currency?.is_active ?? true);

  const isCreateModal = !currency;

  useEffect(() => {
    if (currency) {
      setCode(currency.code);
      setName(currency.name);
      setSymbol(currency.symbol);
      setIsActive(currency.is_active);
    } else {
      setCode('');
      setName('');
      setSymbol('');
      setIsActive(true);
    }
  }, [currency]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      code: code.toUpperCase(),
      name,
      symbol,
      is_active: isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="p-6 space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div>
          <label
            htmlFor="currency-code"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Code
          </label>
          <input
            id="currency-code"
            type="text"
            required
            maxLength={3}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="USD"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            ISO 4217 currency code (1-3 uppercase letters)
          </p>
        </div>

        <div>
          <label
            htmlFor="currency-name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Name
          </label>
          <input
            id="currency-name"
            type="text"
            required
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="US Dollar"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        <div>
          <label
            htmlFor="currency-symbol"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Symbol
          </label>
          <input
            id="currency-symbol"
            type="text"
            required
            maxLength={5}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="$"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        <div className="flex items-center">
          <input
            id="currency-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label
            htmlFor="currency-active"
            className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
          >
            Active
          </label>
        </div>
      </div>

      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 rounded-b-lg">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !code || !name || !symbol}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : isCreateModal ? 'Create' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function VatRateForm({
  vatRate,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: {
  vatRate: VatRateByCountry;
  onSubmit: (standard_rate: number) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [standardRate, setStandardRate] = useState(vatRate.standard_rate.toString());

  useEffect(() => {
    setStandardRate(vatRate.standard_rate.toString());
  }, [vatRate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(standardRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return;
    }
    onSubmit(rate);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="p-6 space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Country
          </label>
          <p className="text-sm text-gray-900 dark:text-gray-100">
            {vatRate.country_name} ({vatRate.country_code})
          </p>
        </div>

        <div>
          <label
            htmlFor="vat-rate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Standard VAT Rate (%)
          </label>
          <input
            id="vat-rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            value={standardRate}
            onChange={(e) => setStandardRate(e.target.value)}
            placeholder="20.00"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Changes affect future invoices only. Existing invoices are not recalculated.
          </p>
        </div>
      </div>

      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 rounded-b-lg">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !standardRate}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
