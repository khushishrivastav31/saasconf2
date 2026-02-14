import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../config/api";
import type {
  Conference,
  SponsorPackage,
  SponsorPackageCreate,
  SponsorPackageUpdate,
  PlatformCurrency,
  PaginatedResponse,
} from "../../../../types";
import { parseApiError } from "../../../../utils/apiError";
import Modal from "../../../../components/Modal";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import RichTextEditor from "../../../../components/common/RichTextEditor";
import RichTextDisplay from "../../../../components/common/RichTextDisplay";
import StatusBadge from "../../../../components/common/StatusBadge";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../../components/common/LoadingSpinner";
import ModalFooter from "../../../../components/common/ModalFooter";
import { useSettingsCrud } from "../../../../hooks/useSettingsCrud";
import { EditIcon, DeleteIcon } from "../../icons";

// --- Conference Sponsor Packages Tab -----------------------------------------

function ConferenceSponsorPackagesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SponsorPackage | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<SponsorPackage | null>(null);

  const {
    data,
    isLoading,
    isError,
    queryError,
    createMutation,
    updateMutation,
    deleteMutation,
    error,
    setError,
  } = useSettingsCrud<SponsorPackage, SponsorPackageCreate, SponsorPackageUpdate>({
    conferenceId: conference.id,
    endpoint: "sponsor-packages",
    queryKey: "sponsor-packages",
    onCreateSuccess: () => {
      setIsModalOpen(false);
    },
    onUpdateSuccess: () => {
      setEditingPackage(null);
      setIsModalOpen(false);
    },
  });

  const { data: currenciesData } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        "/admin/settings/currencies",
        { params: { page_size: 100, is_active: true } },
      );
      return response.data;
    },
  });

  const currencyMap = useMemo(() => {
    const map: Record<string, PlatformCurrency> = {};
    for (const c of currenciesData?.items ?? []) {
      map[c.code] = c;
    }
    return map;
  }, [currenciesData]);

  const handleEdit = (pkg: SponsorPackage) => {
    setEditingPackage(pkg);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (pkg: SponsorPackage) => {
    setDeleteTarget(pkg);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPackage(null);
    setError(null);
  };

  const handleSubmit = (formData: SponsorPackageCreate) => {
    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatPrice = (price: number, currencyCode: string | null) => {
    const formatted = new Intl.NumberFormat(undefined, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
    if (currencyCode) {
      const symbol = currencyMap[currencyCode]?.symbol;
      return symbol ? `${symbol} ${formatted}` : `${formatted} ${currencyCode}`;
    }
    return formatted;
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">
            Sponsor Packages
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Define the sponsorship packages available for this conference
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingPackage(null);
              setIsModalOpen(true);
              setError(null);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Add Package
          </button>
        )}
      </div>

      {!isModalOpen && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorBanner message={`Failed to load sponsor packages: ${parseApiError(queryError)}`} />
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items?.map((pkg) => (
                <tr key={pkg.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {pkg.name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <RichTextDisplay content={pkg.description} truncate className="text-sm text-gray-500 max-w-xs" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatPrice(pkg.price, pkg.currency)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={pkg.is_active} />
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(pkg)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => handleDelete(pkg)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Delete"
                      >
                        <DeleteIcon />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No sponsor packages defined yet. Click &quot;Add
                    Package&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConferenceSponsorPackageModal
        key={editingPackage?.id || "create"}
        open={isModalOpen}
        sponsorPackage={editingPackage}
        currencies={currenciesData?.items ?? []}
        conferenceCurrency={conference.currency}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={error}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Sponsor Package"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// --- Conference Sponsor Package Modal ----------------------------------------

function ConferenceSponsorPackageModal({
  open,
  sponsorPackage,
  currencies,
  conferenceCurrency,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  sponsorPackage: SponsorPackage | null;
  currencies: PlatformCurrency[];
  conferenceCurrency?: string | null;
  onClose: () => void;
  onSubmit: (data: SponsorPackageCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  // Use conference currency if set
  const isCurrencyLocked = !!conferenceCurrency;

  const [formData, setFormData] = useState<SponsorPackageCreate>({
    name: "",
    description: "",
    price: 0,
    currency: conferenceCurrency || "",
    is_active: true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        name: sponsorPackage?.name || "",
        description: sponsorPackage?.description || "",
        price: sponsorPackage?.price ?? 0,
        currency: isCurrencyLocked ? conferenceCurrency : (sponsorPackage?.currency || ""),
        is_active: sponsorPackage?.is_active ?? true,
      });
    }
  }, [open, sponsorPackage, isCurrencyLocked, conferenceCurrency]);

  const activeCurrencies = currencies.filter((c) => c.is_active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      currency: formData.currency || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sponsorPackage ? "Edit Sponsor Package" : "Add Sponsor Package"}
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Package Name *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <RichTextEditor
              value={formData.description || ""}
              onChange={(html) =>
                setFormData({ ...formData, description: html })
              }
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Price *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.price}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    price: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Currency
              </label>
              {isCurrencyLocked ? (
                <input
                  type="text"
                  value={conferenceCurrency || ""}
                  disabled
                  title="Set by conference"
                  className="mt-1 block w-full border border-gray-300 rounded-md bg-gray-100 shadow-sm py-2 px-3 text-sm text-gray-600"
                />
              ) : (
                <select
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.currency || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, currency: e.target.value })
                  }
                >
                  <option value="">-- None --</option>
                  {activeCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.symbol})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="conf-sponsor-pkg-active"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.is_active ?? true}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <label
              htmlFor="conf-sponsor-pkg-active"
              className="ml-2 block text-sm text-gray-900"
            >
              Active
            </label>
          </div>
        </div>

        <ModalFooter onCancel={onClose} isLoading={isLoading} />
      </form>
    </Modal>
  );
}

export default ConferenceSponsorPackagesTab;
