import React from 'react';
import type { CustomerOffer } from '../../../../../types/training';
import { STATUS_COLORS } from './constants';

const OfferRow = React.memo(function OfferRow({
  offer,
  onClick,
}: {
  offer: CustomerOffer;
  onClick: (offer: CustomerOffer) => void;
}) {
  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
      onClick={() => onClick(offer)}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
        {offer.offer_number}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[offer.status] || STATUS_COLORS.draft}`}
        >
          {offer.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {offer.placements?.length ?? 0}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {offer.training_price != null
          ? `${offer.training_price.toLocaleString()} ${offer.currency}`
          : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {offer.certification_price != null
          ? `${offer.certification_price.toLocaleString()} ${offer.currency}`
          : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        {new Date(offer.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
});

export default OfferRow;
