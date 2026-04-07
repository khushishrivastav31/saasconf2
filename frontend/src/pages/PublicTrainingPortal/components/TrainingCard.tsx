/**
 * Training Card
 *
 * Displays a single training in the search results list.
 */
import React from 'react';
import { useNavigate } from 'react-router';
import type { PublicTraining } from '../TrainingSearch';

interface TrainingCardProps {
  training: PublicTraining;
  tenantSlug: string;
  t: (key: string) => string;
}

const TrainingCard = React.memo(function TrainingCard({
  training: tr,
  tenantSlug,
  t,
}: TrainingCardProps) {
  const navigate = useNavigate();
  const price = tr.early_bird_price || tr.regular_price;
  const startDate = tr.start_date
    ? new Date(tr.start_date + 'T00:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-5 hover:shadow-md transition-shadow">
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div className="flex-1 min-w-0">
          {/* Training name */}
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
            {tr.training_name}
          </h3>

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {startDate && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
                {startDate}
                {tr.duration && tr.duration > 1 && (
                  <span className="text-gray-400 dark:text-gray-500">({tr.duration} days)</span>
                )}
              </span>
            )}

            {(tr.location_name || tr.location_city) && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
                {[tr.location_name, tr.location_city].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Tags */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* Placement type */}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                tr.placement_type === 'hybrid'
                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              }`}
            >
              {tr.placement_type === 'hybrid' ? 'Hybrid' : 'Open'}
            </span>

            {tr.language_name && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {tr.language_name}
              </span>
            )}

            {tr.certification_body_name && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {tr.certification_body_name}
              </span>
            )}

            {tr.theme_name && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {tr.theme_name}
              </span>
            )}
          </div>

          {/* Trainers */}
          {tr.trainers.length > 0 && (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Trainer{tr.trainers.length > 1 ? 's' : ''}: {tr.trainers.join(', ')}
            </p>
          )}

          {/* Description excerpt */}
          {tr.training_description && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {tr.training_description}
            </p>
          )}
        </div>

        {/* Price + Register button */}
        <div className="mt-3 sm:mt-0 sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2">
          {price && (
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {tr.currency === 'EUR' ? '\u20AC' : tr.currency === 'USD' ? '$' : tr.currency}{' '}
                {Number(price).toLocaleString('de-DE', { minimumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('per_person')}</p>
              {tr.early_bird_price &&
                tr.regular_price &&
                tr.early_bird_price !== tr.regular_price && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 line-through">
                    {tr.currency === 'EUR' ? '\u20AC' : tr.currency}{' '}
                    {Number(tr.regular_price).toLocaleString('de-DE', { minimumFractionDigits: 0 })}
                  </p>
                )}
            </div>
          )}
          <button
            onClick={() => navigate(`/${tenantSlug}/trainings/register/${tr.placement_id}/form`)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors whitespace-nowrap"
          >
            {t('btn_register')}
          </button>
        </div>
      </div>
    </div>
  );
});

export default TrainingCard;
