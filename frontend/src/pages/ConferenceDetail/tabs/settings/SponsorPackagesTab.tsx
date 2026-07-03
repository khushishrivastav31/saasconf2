import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  Conference,
  SponsorPackage,
  SponsorPackageCreate,
  SponsorPackageUpdate,
  PlatformCurrency,
  PaginatedResponse,
} from '../../../../types';
import { queryKeys } from '../../../../config/queryKeys';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';
import StatusBadge from '../../../../components/common/StatusBadge';
import CRUDSettingsTab, { type ColumnConfig } from './CRUDSettingsTab';
import SponsorPackageForm from './SponsorPackageForm';

// --- Tab component ----------------------------------------------------------

function ConferenceSponsorPackagesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { data: currenciesData } = useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
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
      style: 'decimal',
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
        key: 'name',
        label: 'Name',
        render: (pkg: SponsorPackage) => (
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{pkg.name}</div>
        ),
      },
      {
        key: 'description',
        label: 'Description',
        cellClassName: '',
        render: (pkg: SponsorPackage) => (
          <RichTextDisplay
            content={pkg.description}
            truncate
            className="text-sm text-gray-500 dark:text-gray-400 max-w-xs"
          />
        ),
      },
      {
        key: 'price',
        label: 'Price',
        headerAlign: 'text-right',
        render: (pkg: SponsorPackage) => (
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right">
            {formatPrice(pkg.price, pkg.currency)}
          </div>
        ),
      },
      {
        key: 'is_active',
        label: 'Active',
        render: (pkg: SponsorPackage) => <StatusBadge isActive={pkg.is_active} />,
      },
    ],
    [currencyMap] // eslint-disable-line react-hooks/exhaustive-deps
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
