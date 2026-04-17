import type { CustomerOffer } from '../../../../../types/training';
import OfferRow from './OfferRow';
import type { OfferType } from './types';

interface Props {
  offers: CustomerOffer[];
  isLoading: boolean;
  onCreate: (type: OfferType) => void;
  onSelect: (offer: CustomerOffer) => void;
}

export default function OffersListView({ offers, isLoading, onCreate, onSelect }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Offers</h4>
          {offers.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {offers.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCreate('inhouse')}
            className="px-3 py-1.5 text-sm font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-md hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
          >
            + Inhouse/Hybrid Offer
          </button>
          <button
            type="button"
            onClick={() => onCreate('open')}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            + Open Training Offer
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
      ) : offers.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Offer Number
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Trainings
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Training Price
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Cert. Price
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {offers.map((offer) => (
                <OfferRow key={offer.id} offer={offer} onClick={onSelect} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No offers yet. Create one to get started.
        </div>
      )}
    </div>
  );
}
