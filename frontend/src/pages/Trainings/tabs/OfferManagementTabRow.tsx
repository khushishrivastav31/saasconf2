import React from 'react';
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

export const OfferRow = React.memo(function OfferRow({
  offer,
  onStatusChange,
  onClick,
  onInvoiceClick,
  isUpdating,
}: {
  offer: CustomerOffer;
  onStatusChange: (offerId: string, status: string) => void;
  onClick: (offer: CustomerOffer) => void;
  onInvoiceClick: (invoiceId: string) => void;
  isUpdating: boolean;
}) {
  const invoiceCount = offer.invoice_numbers?.length ?? 0;
  const firstInvoiceNumber = invoiceCount > 0 ? offer.invoice_numbers[0] : null;
  const firstInvoiceId = invoiceCount > 0 ? offer.invoice_ids?.[0] : null;
  const extraCount = invoiceCount > 1 ? invoiceCount - 1 : 0;

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
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {firstInvoiceNumber && firstInvoiceId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInvoiceClick(firstInvoiceId);
            }}
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            {firstInvoiceNumber}
            {extraCount > 0 && (
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">+{extraCount}</span>
            )}
          </button>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
        {invoiceCount > 0 ? formatPrice(offer.invoiced_total, offer.currency) : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        {formatDate(offer.created_at)}
      </td>
    </tr>
  );
});
