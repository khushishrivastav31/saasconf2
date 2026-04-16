/**
 * UsersTab — Training portal users with full history and account management.
 *
 * Phase 1: Read-only user list with history (uses existing attendee API).
 * Phase 2: Portal account status, enable/disable, password management.
 * Phase 3: Merge duplicates, impersonate.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';

interface HistoryEvent {
  id: string;
  event_type: string;
  placement_id: string | null;
  training_name: string;
  source_type: string | null;
  notes: string | null;
  created_at: string | null;
}

interface PortalUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  notes: string | null;
  current_training: string;
  current_training_date: string | null;
  portal_user_id: string | null;
  created_at: string | null;
  history: HistoryEvent[];
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  parked: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const EVENT_LABELS: Record<string, string> = {
  registered: 'Registered',
  offer_assigned: 'Assigned (Offer)',
  parked: 'Parked',
  reassigned: 'Reassigned',
  cancelled: 'Cancelled',
  offer_removed: 'Removed (Offer)',
};

const EVENT_COLORS: Record<string, string> = {
  registered: 'text-green-600 dark:text-green-400',
  offer_assigned: 'text-blue-600 dark:text-blue-400',
  parked: 'text-amber-600 dark:text-amber-400',
  reassigned: 'text-primary-600 dark:text-primary-400',
  cancelled: 'text-red-600 dark:text-red-400',
  offer_removed: 'text-gray-500 dark:text-gray-400',
};

const formatDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

export default function UsersTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [page, setPage] = useState(1);

  const toggleAccessMutation = useMutation({
    mutationFn: (portalUserId: string) => api.put(`/trainings/users/${portalUserId}/toggle-access`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-users'] });
      showToast(res.data.message, 'success');
    },
    onError: () => showToast('Failed to update access', 'error'),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (portalUserId: string) =>
      api.post(`/trainings/users/${portalUserId}/resend-invite`),
    onSuccess: () => showToast('Invite email sent', 'success'),
    onError: () => showToast('Failed to send invite', 'error'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (portalUserId: string) =>
      api.post(`/trainings/users/${portalUserId}/reset-password`),
    onSuccess: () => showToast('Password reset email sent', 'success'),
    onError: () => showToast('Failed to send reset email', 'error'),
  });

  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergeSourceEmail, setMergeSourceEmail] = useState('');

  const mergeMutation = useMutation({
    mutationFn: ({ targetId, sourceId }: { targetId: string; sourceId: string }) =>
      api.post(`/trainings/users/${targetId}/merge`, { source_user_id: sourceId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-users'] });
      showToast(res.data.message, 'success');
      setMergeTarget(null);
      setMergeSourceEmail('');
      setSelectedUser(null);
    },
    onError: () => showToast('Failed to merge users', 'error'),
  });

  const impersonateMutation = useMutation({
    mutationFn: (portalUserId: string) => api.post(`/trainings/users/${portalUserId}/impersonate`),
    onSuccess: (res) => {
      const { access_token, portal_user_name } = res.data;
      // Open portal in new tab with the impersonation token
      localStorage.setItem('portal_access_token', access_token);
      const tenantSlug = window.location.pathname.split('/')[2] || '';
      window.open(`/${tenantSlug}/trainings/portal/dashboard`, '_blank');
      showToast(`Viewing portal as ${portal_user_name}`, 'info');
    },
    onError: () => showToast('Failed to impersonate user', 'error'),
  });

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), per_page: '50' };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [search, statusFilter, page]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['training-users', params],
    queryFn: async () => {
      const res = await api.get('/trainings/attendees', { params });
      return res.data as { items: PortalUser[]; total: number; page: number; per_page: number };
    },
    staleTime: 30_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;

  const inputCls =
    'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';

  // Detail panel view
  if (selectedUser) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedUser(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-4"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to users
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* User profile header */}
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-lg">
                {selectedUser.first_name.charAt(0)}
                {selectedUser.last_name.charAt(0)}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {selectedUser.first_name} {selectedUser.last_name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span
                  className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold ${STATUS_COLORS[selectedUser.status] ?? ''}`}
                >
                  {selectedUser.status === 'parked' ? 'Parked' : 'Active'}
                </span>
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Current Training
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {selectedUser.current_training}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Registered Since
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(selectedUser.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Portal Account
                </dt>
                <dd className="mt-1 text-sm">
                  {selectedUser.portal_user_id ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">Linked</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 italic">
                      No portal account
                    </span>
                  )}
                </dd>
              </div>
            </div>
          </div>

          {/* Management actions */}
          {selectedUser.portal_user_id && (
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
              <button
                onClick={() => toggleAccessMutation.mutate(selectedUser.portal_user_id!)}
                disabled={toggleAccessMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40"
              >
                {toggleAccessMutation.isPending ? '...' : 'Toggle Access'}
              </button>
              <button
                onClick={() => resendInviteMutation.mutate(selectedUser.portal_user_id!)}
                disabled={resendInviteMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40"
              >
                {resendInviteMutation.isPending ? '...' : 'Resend Invite'}
              </button>
              <button
                onClick={() => resetPasswordMutation.mutate(selectedUser.portal_user_id!)}
                disabled={resetPasswordMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40"
              >
                {resetPasswordMutation.isPending ? '...' : 'Reset Password'}
              </button>
              <button
                onClick={() => impersonateMutation.mutate(selectedUser.portal_user_id!)}
                disabled={impersonateMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium border border-primary-300 dark:border-primary-700 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 text-primary-700 dark:text-primary-300 disabled:opacity-40"
              >
                {impersonateMutation.isPending ? '...' : 'Impersonate'}
              </button>
              <button
                onClick={() => setMergeTarget(selectedUser.portal_user_id)}
                className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-300"
              >
                Merge with...
              </button>
            </div>
          )}

          {/* History timeline */}
          <div className="px-6 py-5">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
              Activity History
            </h4>
            {selectedUser.history.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No history events.</p>
            ) : (
              <div className="relative pl-6 space-y-4">
                {/* Vertical timeline line */}
                <div className="absolute left-2 top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-700" />

                {selectedUser.history.map((event) => (
                  <div key={event.id} className="relative">
                    {/* Timeline dot */}
                    <div
                      className={`absolute -left-4 top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${
                        event.event_type === 'parked'
                          ? 'bg-amber-400'
                          : event.event_type === 'cancelled'
                            ? 'bg-red-400'
                            : 'bg-green-400'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${EVENT_COLORS[event.event_type] ?? 'text-gray-600 dark:text-gray-400'}`}
                        >
                          {EVENT_LABELS[event.event_type] ?? event.event_type}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatDate(event.created_at)}
                        </span>
                      </div>
                      {event.training_name && event.training_name !== '—' && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          {event.training_name}
                        </p>
                      )}
                      {event.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 italic">
                          {event.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Users
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({total})
            </span>
          )}
        </h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`flex-1 min-w-50 ${inputCls}`}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={inputCls}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="parked">Parked</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : isError ? (
        <div className="text-center py-8 text-red-500 dark:text-red-400">
          Failed to load data. Please try again.
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
                    Current Training
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Events
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Since
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedUser(user);
                      }
                    }}
                  >
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                      {user.first_name} {user.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_COLORS[user.status] ?? ''}`}
                      >
                        {user.status === 'parked' ? 'Parked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm truncate max-w-48">
                      {user.current_training}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                      {user.history.length}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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

      {/* Merge dialog */}
      {mergeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMergeTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Merge Users
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter the email of the <strong>source user</strong> to merge into the selected target.
              All training history, registrations, and offer links will be moved. The source account
              will be deleted.
            </p>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Source user email
            </label>
            <input
              type="email"
              value={mergeSourceEmail}
              onChange={(e) => setMergeSourceEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setMergeTarget(null);
                  setMergeSourceEmail('');
                }}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Find source portal_user_id by email from the loaded items
                  const source = items.find(
                    (u) =>
                      u.email.toLowerCase() === mergeSourceEmail.toLowerCase() && u.portal_user_id
                  );
                  if (!source?.portal_user_id) {
                    showToast('Source user not found or has no portal account', 'error');
                    return;
                  }
                  mergeMutation.mutate({ targetId: mergeTarget, sourceId: source.portal_user_id });
                }}
                disabled={!mergeSourceEmail || mergeMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-40"
              >
                {mergeMutation.isPending ? 'Merging...' : 'Merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
