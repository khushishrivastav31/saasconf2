/**
 * Training Card
 *
 * Displays a single training in the search results list with expandable
 * Description and Content tabs (rich text).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { sanitizeHtml } from '../../../utils/richText';
import type { PublicTraining } from '../TrainingSearch';

interface TrainingCardProps {
  training: PublicTraining;
  tenantSlug: string;
  t: (key: string) => string;
}

type ExpandTab = null | 'description' | 'content';

const TrainingCard = React.memo(function TrainingCard({
  training: tr,
  tenantSlug,
  t,
}: TrainingCardProps) {
  const navigate = useNavigate();
  const [expandedTab, setExpandedTab] = useState<ExpandTab>(null);
  const price = tr.early_bird_price || tr.regular_price;
  const startDate = tr.start_date
    ? new Date(tr.start_date + 'T00:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const hasDescription = !!tr.training_description;
  const hasContent = !!tr.training_content;

  const toggleTab = (tab: 'description' | 'content') => {
    setExpandedTab((prev) => (prev === tab ? null : tab));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="p-4 sm:p-5">
        <div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
          <div className="flex-1 min-w-0">
            {/* Training name */}
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="truncate">{tr.training_name}</span>
              {tr.is_guaranteed && (
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  {t('guaranteed')}
                </span>
              )}
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

              {tr.location_city && (
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
                  {tr.location_city}
                </span>
              )}
            </div>

            {/* Tags */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tr.language_name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  {tr.language_name}
                </span>
              )}

              {tr.syllabus_name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                  {tr.syllabus_name}
                </span>
              )}
            </div>

            {/* Trainers */}
            {tr.trainers.length > 0 && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Trainer{tr.trainers.length > 1 ? 's' : ''}: {tr.trainers.join(', ')}
              </p>
            )}

            {/* Description / Content toggle tabs */}
            {(hasDescription || hasContent) && (
              <div className="mt-3 flex gap-2">
                {hasDescription && (
                  <button
                    type="button"
                    onClick={() => toggleTab('description')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                      expandedTab === 'description'
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {expandedTab === 'description'
                      ? t('label_hide_description')
                      : t('label_description')}
                  </button>
                )}
                {hasContent && (
                  <button
                    type="button"
                    onClick={() => toggleTab('content')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                      expandedTab === 'content'
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {expandedTab === 'content' ? t('label_hide_content') : t('label_content')}
                  </button>
                )}
              </div>
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
                      {Number(tr.regular_price).toLocaleString('de-DE', {
                        minimumFractionDigits: 0,
                      })}
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

      {/* Expanded description / content */}
      {expandedTab && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 sm:px-5 py-4">
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(
                expandedTab === 'description'
                  ? (tr.training_description ?? '')
                  : (tr.training_content ?? '')
              ),
            }}
          />
        </div>
      )}
    </div>
  );
});

export default TrainingCard;
