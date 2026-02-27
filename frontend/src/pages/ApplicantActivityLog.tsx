import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import { formatDateTime } from '../utils/formatDate';
import type { ApplicantGroupedActivity, PaginatedResponse } from '../types';

interface ActivityFilters {
  search: string;
  activityType: string;
  startDate: string;
  endDate: string;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  registered: 'Registered',
  confirmation_sent: 'Confirmation Sent',
  email_verified: 'Email Verified',
  account_deleted: 'Account Deleted',
};

const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-800',
  confirmation_sent: 'bg-yellow-100 text-yellow-800',
  email_verified: 'bg-green-100 text-green-800',
  account_deleted: 'bg-red-100 text-red-800',
};

export default function ApplicantActivityLog() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filters, setFilters] = useState<ActivityFilters>({
    search: '',
    activityType: '',
    startDate: '',
    endDate: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<ActivityFilters>({
    search: '',
    activityType: '',
    startDate: '',
    endDate: '',
  });
  const [isExporting, setIsExporting] = useState(false);
  const [expandedApplicant, setExpandedApplicant] = useState<string | null>(null);

  // Build query params
  const buildQueryParams = (f: ActivityFilters) => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    if (f.search) params.append('search', f.search);
    if (f.activityType) params.append('activity_type', f.activityType);
    if (f.startDate) params.append('start_date', new Date(f.startDate).toISOString());
    if (f.endDate) params.append('end_date', new Date(f.endDate).toISOString());
    return params.toString();
  };

  const { data, isLoading } = useQuery({
    queryKey: ['applicant-activity-grouped', page, pageSize, appliedFilters],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ApplicantGroupedActivity>>(
        `/applicant-activity/grouped?${buildQueryParams(appliedFilters)}`
      );
      return response.data;
    },
  });

  // Fetch activity types for filter dropdown
  const { data: activityTypes } = useQuery({
    queryKey: ['applicant-activity-types'],
    queryFn: async () => {
      const response = await api.get<string[]>('/applicant-activity/activity-types');
      return response.data;
    },
  });

  const formatDateCol = (dateString: string) => {
    return formatDateTime(dateString);
  };

  const formatApplicantName = (first: string, last: string): string => {
    const names = [first, last].filter(Boolean);
    return names.length > 0 ? names.join(' ') : 'Unknown';
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters });
  };

  const handleClearFilters = () => {
    const cleared = {
      search: '',
      activityType: '',
      startDate: '',
      endDate: '',
    };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setPage(1);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.search) params.append('search', appliedFilters.search);
      if (appliedFilters.activityType) params.append('activity_type', appliedFilters.activityType);
      if (appliedFilters.startDate)
        params.append('start_date', new Date(appliedFilters.startDate).toISOString());
      if (appliedFilters.endDate)
        params.append('end_date', new Date(appliedFilters.endDate).toISOString());

      const response = await api.get(`/applicant-activity/export?${params.toString()}`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `applicant_activity_${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Export failed — UI already reflects via isExporting state
    } finally {
      setIsExporting(false);
    }
  };

  const hasFilters = Object.values(appliedFilters).some((v) => v !== '');

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Applicant Activity Log
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track applicant registration, verification, and account events
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
        >
          {isExporting ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Exporting...
            </>
          ) : (
            <>
              <svg
                className="-ml-1 mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export CSV
            </>
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <form onSubmit={handleSearch}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by email or name..."
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>

            {/* Activity Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Activity Type
              </label>
              <select
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={filters.activityType}
                onChange={(e) => setFilters({ ...filters, activityType: e.target.value })}
              >
                <option value="">All Activities</option>
                {activityTypes?.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_TYPE_LABELS[type] || type}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Date
              </label>
              <input
                type="date"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To Date
              </label>
              <input
                type="date"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              <svg
                className="-ml-1 mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Search
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Clear Filters
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results Count */}
      {data && (
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, data.total)} of{' '}
          {data.total} applicants
        </div>
      )}

      {/* Activity List */}
      {isLoading ? (
        <div className="flex justify-center py-12" role="status" aria-label="Loading">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.items?.map((group) => (
            <div
              key={group.applicant_email}
              className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedApplicant(
                    expandedApplicant === group.applicant_email ? null : group.applicant_email
                  )
                }
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-700 font-medium text-sm">
                      {group.applicant_first_name?.[0]?.toUpperCase() || '?'}
                      {group.applicant_last_name?.[0]?.toUpperCase() || ''}
                    </span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatApplicantName(group.applicant_first_name, group.applicant_last_name)}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {group.applicant_email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex flex-wrap gap-1">
                    {group.activities.slice(0, 3).map((activity) => (
                      <span
                        key={activity.id}
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${ACTIVITY_TYPE_COLORS[activity.activity_type] || 'bg-gray-100 text-gray-800'}`}
                      >
                        {ACTIVITY_TYPE_LABELS[activity.activity_type] || activity.activity_type}
                      </span>
                    ))}
                    {group.activities.length > 3 && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        +{group.activities.length - 3}
                      </span>
                    )}
                  </div>
                  <svg
                    className={`h-5 w-5 text-gray-400 dark:text-gray-500 transition-transform ${
                      expandedApplicant === group.applicant_email ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {expandedApplicant === group.applicant_email && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-6 py-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Activity Timeline
                  </h4>
                  <div className="space-y-3">
                    {group.activities.map((activity, index) => (
                      <div key={activity.id} className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div
                            className={`h-2 w-2 mt-2 rounded-full ${
                              activity.activity_type === 'registered'
                                ? 'bg-blue-500'
                                : activity.activity_type === 'confirmation_sent'
                                  ? 'bg-yellow-500'
                                  : activity.activity_type === 'email_verified'
                                    ? 'bg-green-500'
                                    : activity.activity_type === 'account_deleted'
                                      ? 'bg-red-500'
                                      : 'bg-gray-400'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${ACTIVITY_TYPE_COLORS[activity.activity_type] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {ACTIVITY_TYPE_LABELS[activity.activity_type] ||
                                activity.activity_type}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDateCol(activity.created_at)}
                            </span>
                          </div>
                        </div>
                        {index < group.activities.length - 1 && (
                          <div className="absolute left-[1.15rem] top-6 h-full w-px bg-gray-200 dark:bg-gray-700" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {data?.items.length === 0 && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg px-6 py-12 text-center text-gray-500 dark:text-gray-400">
              No applicant activity found matching your criteria.
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="mt-6 bg-white dark:bg-gray-800 shadow rounded-lg px-4 py-3 flex items-center justify-between sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Page <span className="font-medium">{page}</span> of{' '}
                <span className="font-medium">{data.pages}</span>
              </p>
            </div>
            <div>
              <nav
                className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                aria-label="Pagination"
              >
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="sr-only">First</span>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-2 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page === data.pages}
                  className="relative inline-flex items-center px-2 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setPage(data.pages)}
                  disabled={page === data.pages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="sr-only">Last</span>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 5l7 7-7 7M5 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
