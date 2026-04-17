import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type { CustomerOffer, AvailablePlacement } from '../../../../../types/training';
import type { OfferType } from './types';

interface Params {
  customerId: string;
  placementTypeFilter: OfferType | undefined;
  placementSearch: string;
}

export function useOffersData({ customerId, placementTypeFilter, placementSearch }: Params) {
  const offersQuery = useQuery<CustomerOffer[]>({
    queryKey: queryKeys.customerOffers(customerId),
    queryFn: async () => {
      const res = await api.get(`/trainings/offers?customer_id=${customerId}`);
      return res.data.items ?? res.data;
    },
  });
  const offers = useMemo(() => offersQuery.data ?? [], [offersQuery.data]);

  const availablePlacementsQuery = useQuery<AvailablePlacement[]>({
    queryKey: queryKeys.availablePlacements(placementTypeFilter),
    queryFn: async () => {
      const params = placementTypeFilter ? `?type=${placementTypeFilter}` : '';
      const res = await api.get(`/trainings/offers/available-placements${params}`);
      return res.data;
    },
    staleTime: 10_000,
  });
  const availablePlacements = useMemo(
    () => availablePlacementsQuery.data ?? [],
    [availablePlacementsQuery.data]
  );

  const placementsByYear = useMemo(() => {
    const searchLower = placementSearch.toLowerCase().trim();
    const filtered = searchLower
      ? availablePlacements.filter(
          (p) =>
            p.training_name.toLowerCase().includes(searchLower) ||
            (p.training_slug?.toLowerCase().includes(searchLower) ?? false) ||
            (p.location_name?.toLowerCase().includes(searchLower) ?? false) ||
            p.start_date.includes(searchLower) ||
            new Date(p.start_date).toLocaleDateString('de-DE').includes(searchLower)
        )
      : availablePlacements;
    const grouped: Record<number, AvailablePlacement[]> = {};
    for (const p of filtered) {
      if (!grouped[p.program_year]) grouped[p.program_year] = [];
      grouped[p.program_year].push(p);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, placements]) => ({ year: Number(year), placements }));
  }, [availablePlacements, placementSearch]);

  return {
    offersQuery,
    offers,
    availablePlacementsQuery,
    placementsByYear,
  };
}
