import type { Conference } from '../../../types';

interface CostManagementTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function CostManagementTab({ conference }: CostManagementTabProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Cost Management</h2>
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Coming Soon</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Track and manage costs for {conference.name}.
        </p>
      </div>
    </div>
  );
}
