import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../config/api";
import Modal from "../../components/Modal";
import type {
  PaginatedResponse,
  PlatformCurrency,
  PlatformCurrencyCreate,
} from "../../types";

export default function Settings() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<PlatformCurrency | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        "/admin/settings/currencies",
        { params: { page_size: 100 } },
      );
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (currencyData: PlatformCurrencyCreate) => {
      const response = await api.post<PlatformCurrency>(
        "/admin/settings/currencies",
        currencyData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-currencies"] });
      setIsCreateModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: PlatformCurrencyCreate }) => {
      const response = await api.put<PlatformCurrency>(
        `/admin/settings/currencies/${id}`,
        updateData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-currencies"] });
      setEditingCurrency(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/settings/currencies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-currencies"] });
    },
  });

  const handleDelete = (currency: PlatformCurrency) => {
    if (window.confirm(`Delete currency "${currency.code} - ${currency.name}"?`)) {
      deleteMutation.mutate(currency.id);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage platform-wide configuration
        </p>
      </div>

      {/* Currencies Section */}
      <div className="mb-12">
        <div className="sm:flex sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Currencies</h2>
            <p className="mt-1 text-sm text-gray-500">
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
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data?.items?.map((currency) => (
                  <tr key={currency.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {currency.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {currency.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {currency.symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          currency.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {currency.is_active ? "Active" : "Inactive"}
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
                      className="px-6 py-8 text-center text-sm text-gray-500"
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
              ? (createMutation.error as { response?: { data?: { detail?: string } } })
                  .response?.data?.detail || "Failed to create currency"
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
                ? (updateMutation.error as { response?: { data?: { detail?: string } } })
                    .response?.data?.detail || "Failed to update currency"
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
  const [code, setCode] = useState(currency?.code || "");
  const [name, setName] = useState(currency?.name || "");
  const [symbol, setSymbol] = useState(currency?.symbol || "");
  const [isActive, setIsActive] = useState(currency?.is_active ?? true);

  const isCreateModal = !currency;

  useEffect(() => {
    if (currency) {
      setCode(currency.code);
      setName(currency.name);
      setSymbol(currency.symbol);
      setIsActive(currency.is_active);
    } else {
      setCode("");
      setName("");
      setSymbol("");
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
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div>
          <label
            htmlFor="currency-code"
            className="block text-sm font-medium text-gray-700"
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
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            ISO 4217 currency code (1-3 uppercase letters)
          </p>
        </div>

        <div>
          <label
            htmlFor="currency-name"
            className="block text-sm font-medium text-gray-700"
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
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="currency-symbol"
            className="block text-sm font-medium text-gray-700"
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
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
            className="ml-2 block text-sm text-gray-700"
          >
            Active
          </label>
        </div>
      </div>

      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3 rounded-b-lg">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !code || !name || !symbol}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading
            ? "Saving..."
            : isCreateModal
              ? "Create"
              : "Save"}
        </button>
      </div>
    </form>
  );
}
