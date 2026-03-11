/**
 * Conference Header Component
 *
 * Collapsible header showing conference information at the top of the registration form.
 * Displays logo, name, dates, location, and description.
 */
import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '../../ConferenceDetail/icons';
import type { PublicConference } from '../../../types/publicRegistration';
import { formatDate } from '../../../utils/formatDate';
import { sanitizeHtml } from '../../../utils/richText';
import ConferenceLogo from '../../../components/ConferenceLogo';
import publicApi from '../../../config/publicApi';

interface ConferenceHeaderProps {
  conference: PublicConference;
}

export default function ConferenceHeader({ conference }: ConferenceHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
      {/* Header with toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          {conference.logo_url && (
            <div className="h-16 sm:h-20 md:h-24 w-auto max-w-32 sm:max-w-40 md:max-w-48 shrink-0">
              <ConferenceLogo
                logoUrl={conference.logo_url}
                alt={`${conference.name} logo`}
                className="h-16 sm:h-20 md:h-24 w-auto max-w-32 sm:max-w-40 md:max-w-48 object-contain rounded"
                apiInstance={publicApi}
                showPlaceholder={false}
              />
            </div>
          )}
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {conference.name}
          </h1>
        </div>
        <span className="text-gray-400 ml-2 shrink-0">
          {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </span>
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div className="px-4 sm:px-6 pb-6 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* Left column */}
            <div className="space-y-4">
              {conference.start_date && conference.end_date && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Dates
                  </h3>
                  <p className="text-gray-900 dark:text-gray-100">
                    {formatDate(conference.start_date)} - {formatDate(conference.end_date)}
                  </p>
                </div>
              )}

              {conference.location && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Location
                  </h3>
                  <p className="text-gray-900 dark:text-gray-100">{conference.location}</p>
                </div>
              )}

              {conference.website && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Website
                  </h3>
                  <a
                    href={conference.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {conference.website}
                  </a>
                </div>
              )}
            </div>

            {/* Right column */}
            <div>
              {conference.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    About
                  </h3>
                  <div
                    className="text-gray-700 dark:text-gray-300 text-sm prose dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(conference.description) }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
