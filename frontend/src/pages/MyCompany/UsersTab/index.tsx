import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import type { PortalUserListItem, PortalUserListResponse } from '../types';
import { formatDate } from './constants';
import UserDetailPanel from './UserDetailPanel';

export default function UsersTab() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), per_page: '50' };
    if (search) p.search = search;
    return p;
  }, [search, page]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['portal-users', params],
    queryFn: async () => {
      const res = await api.get('/portal-users', { params });
      return res.data as PortalUserListResponse;
    },
    staleTime: 30_000,
  });

  const items: PortalUserListItem[] = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  const inputCls =
    'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';

  if (selectedUserId) {
    return (
      <UserDetailPanel
        userId={selectedUserId}
        items={items}
        onBack={() => setSelectedUserId(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Portal Users
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({total})
            </span>
          )}
        </h2>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`flex-1 min-w-[200px] ${inputCls}`}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : isError ? (
        <div className="text-center py-8 text-red-500 dark:text-red-400">
          Failed to load users. Please try again.
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">No users found.</div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Links
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Last login
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Since
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((user) => {
                  const links: string[] = [];
                  if (user.training_attendee_status) links.push('Training');
                  if (user.has_cfp_link) links.push('CFP');
                  if (user.has_registration_link) links.push('Registration');
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => setSelectedUserId(user.id)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedUserId(user.id);
                        }
                      }}
                    >
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                        {user.first_name || ''} {user.last_name || ''}
                        {!user.first_name && !user.last_name && (
                          <span className="italic text-gray-500 dark:text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                            user.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                        {links.length > 0 ? links.join(' · ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                        {formatDate(user.last_login_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="min-h-[44px] px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="min-h-[44px] px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
