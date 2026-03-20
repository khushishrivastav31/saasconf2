import { useQuery } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import type { PlatformCurrency, PaginatedResponse } from '../../types';

/**
 * Fetch active platform currencies for use in currency selectors.
 *
 * Returns just the items array (not the pagination wrapper) since this is
 * always used to populate dropdowns. This exact query is duplicated in 7+
 * places across the codebase (DetailsTab, InvoicesTab, SponsorsTab,
 * BookingTab, SponsorPackagesTab, ModulesTab, etc.).
 */
export function usePlatformCurrencies() {
  return useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
    staleTime: 60 * 60 * 1000,
  });
}
