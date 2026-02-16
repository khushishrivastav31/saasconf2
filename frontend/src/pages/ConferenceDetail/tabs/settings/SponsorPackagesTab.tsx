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
import RichTextEditor from "../../../../components/common/RichTextEditor";
import RichTextDisplay from "../../../../components/common/RichTextDisplay";
import StatusBadge from "../../../../components/common/StatusBadge";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import ModalFooter from "../../../../components/common/ModalFooter";
import CRUDSettingsTab, { type ColumnConfig } from "./CRUDSettingsTab";

// --- Modal form body --------------------------------------------------------

function SponsorPackageForm({
  item,
  currencies,
  conferenceCurrency,
  onSubmit,
  onClose,
  isLoading,
  error,
}: {
  item: SponsorPackage | null;
  currencies: PlatformCurrency[];
  conferenceCurrency?: string | null;
  onSubmit: (data: SponsorPackageCreate) => void;
  onClose: () => void;
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
    setFormData({
      name: item?.name || "",
      description: item?.description || "",
      price: item?.price ?? 0,
      currency: isCurrencyLocked ? conferenceCurrency : (item?.currency || ""),
      is_active: item?.is_active ?? true,
    });
  }, [item, isCurrencyLocked, conferenceCurrency]);

  const activeCurrencies = currencies.filter((c) => c.is_active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      currency: formData.currency || undefined,
    });
  };

  return (
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
  );
}

// --- Tab component ----------------------------------------------------------

function ConferenceSponsorPackagesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { data: currenciesData } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        "/admin/settings/currencies",
        { params: { page_size: 100, is_active: true } },
      );
      return response.data.items;
    },
  });

  const currencyMap = useMemo(() => {
    const map: Record<string, PlatformCurrency> = {};
    for (const c of currenciesData ?? []) {
      map[c.code] = c;
    }
    return map;
  }, [currenciesData]);

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

  const columns: ColumnConfig<SponsorPackage>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Name",
        render: (pkg: SponsorPackage) => (
          <div className="text-sm font-medium text-gray-900">{pkg.name}</div>
        ),
      },
      {
        key: "description",
        label: "Description",
        cellClassName: "",
        render: (pkg: SponsorPackage) => (
          <RichTextDisplay content={pkg.description} truncate className="text-sm text-gray-500 max-w-xs" />
        ),
      },
      {
        key: "price",
        label: "Price",
        headerAlign: "text-right",
        render: (pkg: SponsorPackage) => (
          <div className="text-sm font-medium text-gray-900 text-right">
            {formatPrice(pkg.price, pkg.currency)}
          </div>
        ),
      },
      {
        key: "is_active",
        label: "Active",
        render: (pkg: SponsorPackage) => <StatusBadge isActive={pkg.is_active} />,
      },
    ],
    [currencyMap], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <CRUDSettingsTab<SponsorPackage, SponsorPackageCreate, SponsorPackageUpdate>
      conference={conference}
      isAdmin={isAdmin}
      endpoint="sponsor-packages"
      queryKey="sponsor-packages"
      title="Sponsor Packages"
      description="Define the sponsorship packages available for this conference"
      entityName="Sponsor Package"
      addButtonLabel="Add Package"
      columns={columns}
      renderForm={(ctx) => (
        <SponsorPackageForm
          item={ctx.item}
          currencies={currenciesData ?? []}
          conferenceCurrency={conference.currency}
          onSubmit={ctx.onSubmit}
          onClose={ctx.onClose}
          isLoading={ctx.isLoading}
          error={ctx.error}
        />
      )}
    />
  );
}

export default ConferenceSponsorPackagesTab;
