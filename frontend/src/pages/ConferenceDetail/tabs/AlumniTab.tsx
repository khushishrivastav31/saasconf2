import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { parseApiError } from '../../../utils/apiError';
import { useUrlFilters } from '../../../hooks/useUrlFilters';
import type { Conference } from '../../../types';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useToast } from '../../../components/Toast';
import { SearchIcon } from '../icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConferenceRef {
  id: string;
  name: string;
  year: number | null;
}

interface AlumniEntry {
  email_hash: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  roles: string[];
  conferences: ConferenceRef[];
}

interface AlumniListResponse {
  items: AlumniEntry[];
  total: number;
}

interface AlumniTabProps {
  conference: Conference;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 100;

type AlumniRole = 'attendee' | 'speaker' | 'committee';

const ROLE_BADGES: Record<AlumniRole, { bg: string; text: string; label: string }> = {
  attendee: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-800 dark:text-blue-200',
    label: 'Attendee',
  },
  speaker: {
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    text: 'text-purple-800 dark:text-purple-200',
    label: 'Speaker',
  },
  committee: {
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-800 dark:text-amber-200',
    label: 'Committee',
  },
};

const ROLES: AlumniRole[] = ['attendee', 'speaker', 'committee'];

// ---------------------------------------------------------------------------
// Row component (memoized for list performance)
// ---------------------------------------------------------------------------

const AlumniRow = React.memo(function AlumniRow({ entry }: { entry: AlumniEntry }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
        {[entry.first_name, entry.last_name].filter(Boolean).join(' ') || '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
        {entry.email || '—'}
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <div className="flex flex-wrap gap-1">
          {entry.roles.map((role) => {
            const badge = ROLE_BADGES[role as AlumniRole];
            if (!badge) return null;
            return (
              <span
                key={role}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
            );
          })}
        </div>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <div className="flex flex-wrap gap-1">
          {entry.conferences.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              title={c.name}
            >
              {c.year ? `${c.name} ${c.year}` : c.name}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AlumniTab({ isAdmin }: AlumniTabProps) {
  const { showToast } = useToast();

  const { search, setSearch, debouncedSearch, page, setPage } = useUrlFilters({
    search: '',
    page: 1,
  });

  const [conferenceFilter, setConferenceFilter] = React.useState<string>('');
  const [roleFilter, setRoleFilter] = React.useState<string>('');

  const skip = (page - 1) * PAGE_SIZE;

  const params: Record<string, string | number> = { skip, limit: PAGE_SIZE };
  if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
  if (conferenceFilter) params.conference_id = conferenceFilter;
  if (roleFilter) params.role = roleFilter;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.alumni.list(params),
    queryFn: async () => {
      const response = await api.get<AlumniListResponse>('/alumni', { params });
      return response.data;
    },
  });

  // Load past conferences for the filter dropdown (from the list items' conferences)
  const pastConferences = React.useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, ConferenceRef>();
    for (const entry of data.items) {
      for (const c of entry.conferences) {
        if (!seen.has(c.id)) seen.set(c.id, c);
      }
    }
    return [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }, [data]);

  const handleExport = async () => {
    try {
      const exportParams: Record<string, string> = {};
      if (conferenceFilter) exportParams.conference_id = conferenceFilter;
      if (roleFilter) exportParams.role = roleFilter;
      if (debouncedSearch.trim()) exportParams.search = debouncedSearch.trim();

      const response = await api.get('/alumni/export.csv', {
        responseType: 'blob',
        params: exportParams,
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'alumni.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast(parseApiError(err, 'Failed to export CSV'), 'error');
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];

  if (isLoading && page === 1 && !debouncedSearch && !conferenceFilter && !roleFilter) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Alumni
          {total > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {total}
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          People who attended, spoke at, or served on the committee of past conferences.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Conference filter */}
        <select
          value={conferenceFilter}
          onChange={(e) => {
            setConferenceFilter(e.target.value);
            setPage(1);
          }}
          className="py-2 pl-3 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All conferences</option>
          {pastConferences.map((c) => (
            <option key={c.id} value={c.id}>
              {c.year ? `${c.name} ${c.year}` : c.name}
            </option>
          ))}
        </select>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="py-2 pl-3 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_BADGES[r].label}
            </option>
          ))}
        </select>

        {/* Export button */}
        {isAdmin && (
          <button
            type="button"
            onClick={handleExport}
            className="sm:ml-auto inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Table */}
      {items.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <svg
            className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            {debouncedSearch || conferenceFilter || roleFilter ? 'No Results' : 'No Alumni Yet'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            {debouncedSearch || conferenceFilter || roleFilter
              ? 'No alumni matched your filters. Try adjusting the search or filter.'
              : 'Alumni appear automatically once a conference has ended and has registrations, speakers, or committee members.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Roles
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Conferences
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((entry) => (
                <AlumniRow key={entry.email_hash} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Showing {skip + 1}&ndash;{Math.min(skip + PAGE_SIZE, total)} of {total} alumni
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
