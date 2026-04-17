import type { OfferLink } from '../types';
import { sectionCls, sectionHeadingCls } from './styles';

interface Props {
  offerLinks: OfferLink[];
}

export default function OfferLinksTable({ offerLinks }: Props) {
  if (offerLinks.length === 0) return null;

  return (
    <div className={sectionCls}>
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h4 className={sectionHeadingCls}>
          Offer Links
          <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
            ({offerLinks.length})
          </span>
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Offer #
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Training
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Exam Mode
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Language
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Extra Time
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Certification
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {offerLinks.map((offer) => (
              <tr key={offer.offer_number}>
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                  {offer.offer_number}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {offer.training_name}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {offer.exam_mode ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {offer.exam_language ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {offer.extra_time ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {offer.certification ? 'Yes' : 'No'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
