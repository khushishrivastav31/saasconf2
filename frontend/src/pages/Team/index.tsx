import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { parseApiError } from '../../utils/apiError';
import { formatDate } from '../../utils/formatDate';
import type { TenantUser, PaginatedResponse } from '../../types';
import AddMemberModal from './AddMemberModal';
import EditMemberModal from './EditMemberModal';

export default function Team() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TenantUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['team-users'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<TenantUser>>('/users?page_size=100');
      return res.data;
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}?permanent=true`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
      setRemoveTarget(null);
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/users/${userId}/resend-invite`);
    },
    onSuccess: () => {
      setSuccessMessage('Invite email has been resent.');
      setTimeout(() => setSuccessMessage(null), 5000);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const users = data?.items ?? [];
  const editingUser = editingUserId ? users.find((u) => u.id === editingUserId) : null;
  const filteredUsers = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
          u.last_name?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const scopeLabels: Record<string, string> = {
    all: 'Super User',
    conferences: 'Conferences',
    trainings: 'Trainings',
    accounting: 'Accounting',
  };
  const levelLabels: Record<string, string> = {
    super_user: 'Super User',
    admin: 'Admin',
    member: 'Member',
  };
  const roleBadgeColor = (scope: string, level: string) => {
    if (scope === 'all' && level === 'super_user')
      return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
    if (level === 'admin')
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
    return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Team</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage team members.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Member
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded text-sm">
          {successMessage}
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-2 text-green-500 hover:text-green-700 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400 text-sm">
          {users.length === 0
            ? 'No team members yet. Add your first member.'
            : 'No members match your search.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {[user.first_name, user.last_name].filter(Boolean).join(' ') || '-'}
                        {user.pronouns && (
                          <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 font-normal">
                            ({user.pronouns})
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.tenant_roles && user.tenant_roles.length > 0 ? (
                        user.tenant_roles.map((r) => (
                          <span
                            key={r.scope}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColor(r.scope, r.level)}`}
                          >
                            {r.scope === 'all'
                              ? scopeLabels.all
                              : `${scopeLabels[r.scope] || r.scope} ${levelLabels[r.level] || r.level}`}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No roles</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {user.last_login ? formatDate(user.last_login) : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!user.last_login && user.is_active && (
                        <button
                          onClick={() => resendInviteMutation.mutate(user.id)}
                          disabled={resendInviteMutation.isPending}
                          className="text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          title="Resend invite email"
                        >
                          Resend Invite
                        </button>
                      )}
                      <button
                        onClick={() => setEditingUserId(user.id)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                        title="Edit"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => setRemoveTarget(user)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Remove member"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal
          onClose={(created?: boolean, memberName?: string) => {
            setShowAddModal(false);
            if (created && memberName) {
              setSuccessMessage(
                `Team member "${memberName}" has been invited. They will receive an email to set their password.`
              );
              setTimeout(() => setSuccessMessage(null), 5000);
            }
            queryClient.refetchQueries({ queryKey: ['team-users'] });
          }}
        />
      )}

      {/* Edit Member Modal */}
      {editingUser && (
        <EditMemberModal
          key={editingUser.id}
          user={editingUser}
          onClose={() => {
            setEditingUserId(null);
            queryClient.refetchQueries({ queryKey: ['team-users'] });
          }}
        />
      )}

      {/* Confirm Remove */}
      <ConfirmDialog
        open={!!removeTarget}
        title="Remove Team Member"
        message={`Are you sure you want to permanently remove "${removeTarget?.email}" from the team? This will delete the user account and cannot be undone.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget.id);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
