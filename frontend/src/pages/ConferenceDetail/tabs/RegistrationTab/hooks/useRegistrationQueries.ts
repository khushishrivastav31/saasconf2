import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type {
  Invoice,
  RegistrationListResponse,
  BookingOption,
  BookingPeriod,
} from '../../../../../types';

export function useRegistrationQueries(
  conferenceId: string,
  page: number,
  search: string,
  statusFilter: string
) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.registrations.byConference(conferenceId, page, search, statusFilter),
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await api.get<RegistrationListResponse>(
        `/conferences/${conferenceId}/registrations`,
        { params }
      );
      return response.data;
    },
  });

  const { data: optionsData } = useQuery({
    queryKey: queryKeys.booking.options(conferenceId),
    queryFn: async () => {
      const response = await api.get<{ items: BookingOption[]; total: number }>(
        `/conferences/${conferenceId}/settings/booking-options`
      );
      return response.data.items;
    },
  });

  const { data: periodsData } = useQuery({
    queryKey: queryKeys.booking.periods(conferenceId),
    queryFn: async () => {
      const response = await api.get<{ items: BookingPeriod[]; total: number }>(
        `/conferences/${conferenceId}/settings/booking-periods`
      );
      return response.data.items;
    },
  });

  // Fetch invoices for registrations to display invoice numbers
  const { data: invoicesData } = useQuery({
    queryKey: [...queryKeys.invoices.byConference(conferenceId), 'registration'],
    queryFn: async () => {
      const response = await api.get<{ items: Invoice[]; total: number }>(
        `/conferences/${conferenceId}/invoices`,
        { params: { recipient_source_type: 'registration', page_size: 100 } }
      );
      return response.data;
    },
    enabled: data !== undefined, // Only fetch invoices after registrations are loaded
  });

  const options = useMemo(() => optionsData || [], [optionsData]);
  const periods = useMemo(() => periodsData || [], [periodsData]);

  // Map invoice data by billing_profile_id
  const invoiceMap = useMemo(() => {
    const map: Record<string, { number: string; id: string }> = {};
    if (invoicesData?.items) {
      invoicesData.items.forEach((inv) => {
        if (inv.recipient_source_id && inv.invoice_number && inv.id) {
          map[inv.recipient_source_id] = { number: inv.invoice_number, id: inv.id };
        }
      });
    }
    return map;
  }, [invoicesData]);

  return { data, isLoading, options, periods, invoiceMap };
}
