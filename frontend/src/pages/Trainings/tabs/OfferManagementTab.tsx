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

const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'rejected'] as const;
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatPrice(val: number | null, currency: string): string {
  if (val == null) return '—';
  return `${val.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${currency}`;
}

const OfferRow = React.memo(function OfferRow({
  offer,
  onStatusChange,
  onClick,
  isUpdating,
}: {
  offer: CustomerOffer;
  onStatusChange: (offerId: string, status: string) => void;
  onClick: (offer: CustomerOffer) => void;
  isUpdating: boolean;
}) {
  return (
    <tr
      className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
      onClick={() => onClick(offer)}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
        {offer.offer_number}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{offer.customer_name}</td>
      <td className="px-4 py-3">
        <select
          value={offer.status}
          onChange={(e) => onStatusChange(offer.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={isUpdating}
          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[offer.status] || STATUS_COLORS.draft}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-center">
        {offer.placements.length}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
        {formatPrice(offer.training_price, offer.currency)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
        {formatPrice(offer.certification_price, offer.currency)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        {formatDate(offer.created_at)}
      </td>
    </tr>
  );
});

export default function OfferManagementTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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

  const { data: offersRaw, isLoading } = useQuery<CustomerOffer[]>({
    queryKey: ['all-offers', search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '500' };
      if (search) params.search = search;
      const res = await api.get('/trainings/offers', { params });
      return res.data.items ?? res.data;
    },
  });

  const offers = useMemo(() => {
    const all = offersRaw ?? [];
    if (!statusFilter) return all;
    return all.filter((o) => o.status === statusFilter);
  }, [offersRaw, statusFilter]);

  const statusCounts = useMemo(() => {
    const all = offersRaw ?? [];
    const counts: Record<string, number> = { draft: 0, sent: 0, accepted: 0, rejected: 0 };
    for (const o of all) counts[o.status] = (counts[o.status] || 0) + 1;
    return counts;
  }, [offersRaw]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ offerId, status }: { offerId: string; status: string }) => {
      await api.put(`/trainings/offers/${offerId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-offers'] });
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
          {offers.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({offers.length})
            </span>
          )}
        </h2>
      </div>

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
            All ({(offersRaw ?? []).length})
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
      ) : offers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          {(offersRaw ?? []).length === 0
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
                  isUpdating={updateStatusMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
