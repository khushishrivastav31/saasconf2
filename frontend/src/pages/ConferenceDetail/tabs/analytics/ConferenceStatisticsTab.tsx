import type { Conference } from '../../../../types';

interface ConferenceStatisticsTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function ConferenceStatisticsTab({ conference }: ConferenceStatisticsTabProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Conference Statistics
      </h2>
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 20V10" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 20V4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 20v-6" />
        </svg>
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Coming Soon</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          View statistics and insights for {conference.name}.
        </p>
      </div>
    </div>
  );
}
