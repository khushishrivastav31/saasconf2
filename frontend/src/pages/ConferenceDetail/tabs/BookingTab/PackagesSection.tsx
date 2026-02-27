import { formatCurrency } from '../../../../utils/formatCurrency';
import { EditIcon, DeleteIcon } from '../../icons';
import type { BookingOption, BookingPackage, BookingPeriod } from '../../../../types';

export interface PackagesSectionProps {
  isAdmin: boolean;
  packages: BookingPackage[];
  options: BookingOption[];
  periods: BookingPeriod[];
  conferenceCurrency?: string | null;
  onAddPackage: () => void;
  onEditPackage: (pkg: BookingPackage) => void;
  onDeleteTarget: (target: {
    type: 'period' | 'option' | 'discount' | 'package';
    id: string;
    name: string;
  }) => void;
}

function getPackagePrice(pkg: BookingPackage, period: BookingPeriod): number {
  return pkg.option_ids.reduce((sum, optionId) => {
    const price = period.prices?.[optionId];
    return sum + (price != null ? Number(price) : 0);
  }, 0);
}

export default function PackagesSection({
  isAdmin,
  packages,
  options,
  periods,
  conferenceCurrency,
  onAddPackage,
  onEditPackage,
  onDeleteTarget,
}: PackagesSectionProps) {
  return (
    <div className="mt-10">
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Booking Packages
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Bundles of booking options. Package prices are calculated from component options.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={onAddPackage}
            className="mt-2 sm:mt-0 inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            + Package
          </button>
        )}
      </div>

      {packages.length === 0 ? (
        <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <svg
            className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No booking packages defined yet.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Create packages to bundle multiple options together.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[240px]">
                  Package
                </th>
                {periods.map((period) => (
                  <th
                    key={period.id}
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px]"
                  >
                    {period.name}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[60px]">
                  Active
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[80px]"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {packages.map((pkg) => (
                <tr
                  key={pkg.id}
                  className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {pkg.name}
                      </span>
                      {pkg.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                          {pkg.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {pkg.option_ids.map((optionId) => {
                          const option = options.find((o) => o.id === optionId);
                          return option ? (
                            <span
                              key={optionId}
                              className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300"
                            >
                              {option.name}
                            </span>
                          ) : null;
                        })}
                        {pkg.option_ids.length === 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            No options
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {periods.map((period) => {
                    const price = getPackagePrice(pkg, period);
                    const currency = period.currency || conferenceCurrency || '';
                    return (
                      <td key={period.id} className="px-4 py-3 text-center">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {price > 0 ? formatCurrency(price, currency) : '—'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        pkg.is_active
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {pkg.is_active ? 'Yes' : 'No'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => onEditPackage(pkg)}
                          className="text-gray-400 hover:text-primary-600 transition-colors"
                          title="Edit package"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() =>
                            onDeleteTarget({ type: 'package', id: pkg.id, name: pkg.name })
                          }
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete package"
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
