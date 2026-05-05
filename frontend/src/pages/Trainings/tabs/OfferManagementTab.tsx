/**
 * OfferManagementTab — Shows all customer offers across all customers.
 * Supports filtering by status, search, and inline status updates.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import type { CustomerOffer } from '../../../types/training';
import { OfferRow } from './OfferManagementTabRow';

const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'rejected'] as const;
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

interface OfferStats {
  by_status: Record<string, { count: number; training: number; cert: number; invoiced: number }>;
  total_offers: number;
  total_training: number;
  total_cert: number;
  total_invoiced: number;
}

interface OfferListResponse {
  items: CustomerOffer[];
  total: number;
}

export default function OfferManagementTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [, setSearchParams] = useSearchParams();

  const PAGE_SIZE = 100;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search so typing doesn't hammer the backend.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  // Reset to page 1 whenever the filter/search changes so the user doesn't
  // end up stuck on e.g. page 12 of an empty result set.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const handleOfferClick = useCallback(
    (offer: CustomerOffer) => {
      setSearchParams({
        section: 'customers',
        customerId: offer.customer_id,
        offerId: offer.id,
        tab: 'offers',
      });
    },
    [setSearchParams]
  );

  const handleInvoiceClick = useCallback(
    (invoiceId: string) => {
      setSearchParams({ section: 'invoices', invoiceId });
    },
    [setSearchParams]
  );

  // Stats (counts + totals, grouped by status) come from a dedicated
  // aggregate endpoint so we don't have to materialize every offer row
  // client-side just to render the header cards.
  const { data: stats } = useQuery<OfferStats>({
    queryKey: ['all-offers-stats'],
    queryFn: async () => {
      const res = await api.get<OfferStats>('/trainings/offers/stats');
      return res.data;
    },
    staleTime: 30_000,
  });

  const {
    data: listData,
    isLoading,
    isError,
  } = useQuery<OfferListResponse>({
    queryKey: ['all-offers', debouncedSearch, statusFilter, page, PAGE_SIZE],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<OfferListResponse>('/trainings/offers', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const offers = useMemo(() => listData?.items ?? [], [listData?.items]);
  const totalFiltered = listData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { draft: 0, sent: 0, accepted: 0, rejected: 0 };
    const by = stats?.by_status ?? {};
    for (const s of STATUS_OPTIONS) counts[s] = by[s]?.count ?? 0;
    return counts;
  }, [stats]);

  const totalOffers = stats?.total_offers ?? 0;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ offerId, status }: { offerId: string; status: string }) => {
      await api.put(`/trainings/offers/${offerId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-offers'] });
      queryClient.invalidateQueries({ queryKey: ['all-offers-stats'] });
      showToast('Status updated', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleStatusChange = useCallback(
    (offerId: string, status: string) => {
      updateStatusMutation.mutate({ offerId, status });
    },
    [updateStatusMutation]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Offer Management
          {totalOffers > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({totalOffers})
            </span>
          )}
        </h2>
      </div>

      {/* Stats */}
      {totalOffers > 0 && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {STATUS_OPTIONS.map((s) => {
            const d = stats.by_status[s] ?? { count: 0, training: 0, cert: 0, invoiced: 0 };
            return (
              <div
                key={s}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                  statusFilter === s
                    ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-semibold uppercase ${STATUS_COLORS[s].split(' ').slice(0, 2).join(' ')} px-1.5 py-0.5 rounded-full`}
                  >
                    {s}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {d.count}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Training</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {d.training.toLocaleString('de-DE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cert.</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {d.cert.toLocaleString('de-DE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Invoiced</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {(d.invoiced ?? 0).toLocaleString('de-DE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      €
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Total */}
          <div className="rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-3 col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400">
                Total
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {stats.total_offers}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-0.5">
              <div className="flex justify-between">
                <span>Training Revenue</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {stats.total_training.toLocaleString('de-DE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </span>
              </div>
              <div className="flex justify-between">
                <span>Certification Revenue</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {stats.total_cert.toLocaleString('de-DE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </span>
              </div>
              <div className="flex justify-between">
                <span>Invoiced</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {(stats.total_invoiced ?? 0).toLocaleString('de-DE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-0.5 mt-0.5">
                <span className="font-semibold">Grand Total</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {(stats.total_training + stats.total_cert).toLocaleString('de-DE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by offer number or customer..."
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 w-72"
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !statusFilter
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 border-transparent'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            All ({totalOffers})
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 border-transparent'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)} ({statusCounts[s] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading offers...</div>
      ) : isError ? (
        <div className="text-center py-8 text-red-500 dark:text-red-400">
          Failed to load data. Please try again.
        </div>
      ) : offers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          {totalOffers === 0
            ? 'No offers yet. Create offers from the Customers tab.'
            : 'No offers match the current filter.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Offer #
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Customer
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Trainings
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Training Price
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Cert. Price
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Invoices
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Invoiced
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {offers.map((offer) => (
                <OfferRow
                  key={offer.id}
                  offer={offer}
                  onStatusChange={handleStatusChange}
                  onClick={handleOfferClick}
                  onInvoiceClick={handleInvoiceClick}
                  isUpdating={updateStatusMutation.isPending}
                />
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
              <span>
                Page {page} of {totalPages} · {totalFiltered} offers
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
