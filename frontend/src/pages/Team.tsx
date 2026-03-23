import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../config/api';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { parseApiError } from '../utils/apiError';
import { formatDate } from '../utils/formatDate';
import { validateEmail } from '../utils/validators';
import { useSaveStatus } from '../hooks/useSaveStatus';
import type {
  TenantUser,
  TenantRole,
  TenantUserCreate,
  TenantUserUpdate,
  PaginatedResponse,
  Conference,
  UserConferenceAccessWithDetails,
} from '../types';

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
  // Look up editingUser from fresh query data to avoid stale state
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
            // Force refetch to ensure new data is loaded
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
            // Force refetch to ensure updated data is loaded
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

function AddMemberModal({
  onClose,
}: {
  onClose: (created?: boolean, memberName?: string) => void;
}) {
  const [formData, setFormData] = useState<TenantUserCreate>({
    email: '',
    first_name: '',
    last_name: '',
    role: 'user',
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  // Roles state
  const [tenantRoles, setTenantRoles] = useState<TenantRole[]>([]);
  const isSuperUser = tenantRoles.some((r) => r.scope === 'all' && r.level === 'super_user');
  const hasConferenceRole = isSuperUser || tenantRoles.some((r) => r.scope === 'conferences');

  // Conference access state
  const [hasAllConferenceAccess, setHasAllConferenceAccess] = useState(true);
  const [selectedConferences, setSelectedConferences] = useState<
    { conferenceId: string; accessLevel: 'admin' | 'read_only' }[]
  >([]);

  const { data: pronounData } = useQuery({
    queryKey: ['user-pronoun-options'],
    queryFn: async () => {
      const res = await api.get<{ id: string; name: string }[]>('/users/pronoun-options');
      return res.data;
    },
  });

  const { data: conferencesData } = useQuery({
    queryKey: ['conferences-for-access'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Conference>>('/conferences?page_size=100');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TenantUserCreate) => {
      const res = await api.post<{ id: string }>('/users', data);
      const userId = res.data.id;

      // Set tenant roles if any
      if (tenantRoles.length > 0) {
        await api.put(`/users/${userId}/tenant-roles`, { roles: tenantRoles });
      }

      // Set conference access
      if (hasAllConferenceAccess) {
        await api.put(`/users/${userId}`, { has_all_conference_access: true });
      } else {
        // Grant individual conference access
        for (const conf of selectedConferences) {
          await api.post('/user-conference-access', {
            user_id: userId,
            conference_id: conf.conferenceId,
            access_level: conf.accessLevel,
          });
        }
      }

      return data;
    },
    onSuccess: (data) => {
      const memberName = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email;
      onClose(true, memberName);
    },
    onError: (err) => setErrorMessage(parseApiError(err)),
  });

  const handleRoleToggle = (scope: TenantRole['scope'], level: TenantRole['level']) => {
    const existing = tenantRoles.find((r) => r.scope === scope);
    if (existing) {
      if (existing.level === level) {
        setTenantRoles(tenantRoles.filter((r) => r.scope !== scope));
      } else {
        setTenantRoles(tenantRoles.map((r) => (r.scope === scope ? { ...r, level } : r)));
      }
    } else {
      setTenantRoles([...tenantRoles, { scope, level }]);
    }
  };

  const handleSuperUserToggle = () => {
    if (isSuperUser) {
      setTenantRoles(tenantRoles.filter((r) => !(r.scope === 'all' && r.level === 'super_user')));
    } else {
      setTenantRoles([{ scope: 'all', level: 'super_user' }]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError) return;
    setErrorMessage('');
    createMutation.mutate(formData);
  };

  const assignedIds = new Set(selectedConferences.map((c) => c.conferenceId));
  const availableConferences = conferencesData?.items.filter((c) => !assignedIds.has(c.id)) || [];

  return (
    <Modal open={true} onClose={() => onClose()} title="Add Team Member" size="max-w-4xl">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4">
          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-300 mb-4">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-[2fr_3fr] gap-6">
            {/* Left column - User details */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm ${emailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  onBlur={(e) => setEmailError(validateEmail(e.target.value))}
                />
                {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
              </div>

              {pronounData && pronounData.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Pronouns
                  </label>
                  <select
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                    value={formData.pronouns || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, pronouns: e.target.value || undefined })
                    }
                  >
                    <option value="">Select pronouns...</option>
                    {pronounData.map((opt) => (
                      <option key={opt.id} value={opt.name}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Roles */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Roles</h4>

                {/* Super User toggle */}
                <div className="flex items-center justify-between mb-2 py-1 px-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                  <div>
                    <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                      Super User
                    </span>
                    <p className="text-xs text-purple-500 dark:text-purple-400">
                      Full access to everything
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSuperUserToggle}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                      isSuperUser ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSuperUser ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

                {/* Per-scope roles (only shown when not Super User) */}
                {!isSuperUser && (
                  <div className="space-y-1.5">
                    {(
                      [
                        { scope: 'conferences' as const, label: 'Conferences' },
                        { scope: 'trainings' as const, label: 'Trainings' },
                        { scope: 'accounting' as const, label: 'Accounting' },
                      ] as const
                    ).map(({ scope, label }) => {
                      const current = tenantRoles.find((r) => r.scope === scope);
                      return (
                        <div
                          key={scope}
                          className="flex items-center justify-between py-1 px-2 bg-gray-50 dark:bg-gray-900 rounded"
                        >
                          <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                          <div className="flex gap-1">
                            {(
                              [
                                { level: 'admin' as const, label: 'Admin' },
                                { level: 'member' as const, label: 'Member' },
                              ] as const
                            ).map(({ level, label: lvlLabel }) => (
                              <button
                                key={level}
                                type="button"
                                onClick={() => handleRoleToggle(scope, level)}
                                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                                  current?.level === level
                                    ? level === 'admin'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-gray-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                                }`}
                              >
                                {lvlLabel}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right column - Conference access */}
            <div className="border-l border-gray-200 dark:border-gray-700 pl-6 min-w-0">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Conference Access
              </h4>

              {!hasConferenceRole ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  Assign a Conferences role to configure access.
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={hasAllConferenceAccess}
                      onChange={(e) => setHasAllConferenceAccess(e.target.checked)}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      All Conferences
                    </span>
                  </label>

                  {!hasAllConferenceAccess && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 p-2 max-h-48 overflow-y-auto">
                      {selectedConferences.length > 0 ? (
                        <div className="space-y-1.5 mb-2">
                          {selectedConferences.map((access) => {
                            const conf = conferencesData?.items.find(
                              (c) => c.id === access.conferenceId
                            );
                            return (
                              <div
                                key={access.conferenceId}
                                className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5"
                              >
                                <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                                  {conf?.name || access.conferenceId}
                                </span>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <select
                                    value={access.accessLevel}
                                    onChange={(e) =>
                                      setSelectedConferences((prev) =>
                                        prev.map((c) =>
                                          c.conferenceId === access.conferenceId
                                            ? {
                                                ...c,
                                                accessLevel: e.target.value as
                                                  | 'admin'
                                                  | 'read_only',
                                              }
                                            : c
                                        )
                                      )
                                    }
                                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                                  >
                                    <option value="read_only">Read-only</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedConferences((prev) =>
                                        prev.filter((c) => c.conferenceId !== access.conferenceId)
                                      )
                                    }
                                    className="text-red-500 hover:text-red-700 p-0.5"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          No access granted yet.
                        </p>
                      )}

                      {availableConferences.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <select
                            id="add-conference-select-create"
                            className="flex-1 min-w-0 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Add conference...
                            </option>
                            {availableConferences.map((conf) => (
                              <option key={conf.id} value={conf.id}>
                                {conf.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const select = document.getElementById(
                                'add-conference-select-create'
                              ) as HTMLSelectElement;
                              if (select.value) {
                                setSelectedConferences((prev) => [
                                  ...prev,
                                  { conferenceId: select.value, accessLevel: 'read_only' },
                                ]);
                                select.value = '';
                              }
                            }}
                            className="shrink-0 px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose()}
            className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || !!emailError}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Inviting...' : 'Invite Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditMemberModal({ user, onClose }: { user: TenantUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<TenantUserUpdate>({
    email: user.email,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    pronouns: user.pronouns || '',
    role: user.role,
    is_active: user.is_active,
    has_all_conference_access: user.has_all_conference_access,
  });
  const [newPassword, setNewPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  // Tenant roles state — initialized from user prop
  const [tenantRoles, setTenantRoles] = useState<TenantRole[]>(user.tenant_roles || []);
  const isSuperUser = tenantRoles.some((r) => r.scope === 'all' && r.level === 'super_user');
  const hasConferenceRole = isSuperUser || tenantRoles.some((r) => r.scope === 'conferences');

  // Sync formData when user prop changes (e.g., after query refetch)
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      has_all_conference_access: user.has_all_conference_access,
    }));
  }, [user.has_all_conference_access]);

  // Sync tenant roles when user prop changes
  useEffect(() => {
    setTenantRoles(user.tenant_roles || []);
  }, [user.tenant_roles]);

  const { data: pronounData } = useQuery({
    queryKey: ['user-pronoun-options'],
    queryFn: async () => {
      const res = await api.get<{ id: string; name: string }[]>('/users/pronoun-options');
      return res.data;
    },
  });

  // Fetch conferences for assignment
  const { data: conferencesData } = useQuery({
    queryKey: ['conferences-for-access'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Conference>>('/conferences?page_size=100');
      return res.data;
    },
  });

  // Fetch user's current conference access
  const { data: userAccessData, refetch: refetchUserAccess } = useQuery({
    queryKey: ['user-conference-access', user.id],
    queryFn: async () => {
      const res = await api.get<{ items: UserConferenceAccessWithDetails[]; total: number }>(
        `/user-conference-access/user/${user.id}`
      );
      return res.data;
    },
  });

  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const [errorMessage, setErrorMessage] = useState('');

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUserUpdate) => {
      await api.put(`/users/${user.id}`, data);
    },
    onSuccess: () => {
      setSaved();
      setNewPassword('');
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
    onError: (err) => {
      setSaveError();
      setErrorMessage(parseApiError(err));
    },
  });

  // Grant conference access mutation
  const grantAccessMutation = useMutation({
    mutationFn: async ({
      conferenceId,
      accessLevel,
    }: {
      conferenceId: string;
      accessLevel: 'admin' | 'read_only';
    }) => {
      // If user currently has all conference access, turn it off first
      if (user.has_all_conference_access) {
        await api.put(`/users/${user.id}`, { has_all_conference_access: false });
      }
      await api.post('/user-conference-access', {
        user_id: user.id,
        conference_id: conferenceId,
        access_level: accessLevel,
      });
    },
    onMutate: () => {
      setSaving();
    },
    onSuccess: () => {
      refetchUserAccess();
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
      setSaved();
    },
    onError: (err) => {
      setSaveError();
      setErrorMessage(parseApiError(err));
    },
  });

  // Revoke conference access mutation
  const revokeAccessMutation = useMutation({
    mutationFn: async (accessId: string) => {
      await api.delete(`/user-conference-access/${accessId}`);
    },
    onMutate: () => {
      setSaving();
    },
    onSuccess: () => {
      refetchUserAccess();
      setSaved();
    },
    onError: (err) => {
      setSaveError();
      setErrorMessage(parseApiError(err));
    },
  });

  // Save tenant roles mutation
  const saveRolesMutation = useMutation({
    mutationFn: async (roles: TenantRole[]) => {
      await api.put(`/users/${user.id}/tenant-roles`, { roles });
    },
    onMutate: () => {
      setSaving();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
      setSaved();
    },
    onError: (err) => {
      setSaveError();
      setErrorMessage(parseApiError(err));
    },
  });

  const handleRoleToggle = (scope: TenantRole['scope'], level: TenantRole['level']) => {
    let newRoles: TenantRole[];
    const existing = tenantRoles.find((r) => r.scope === scope);
    if (existing) {
      // Remove if same level, update if different
      if (existing.level === level) {
        newRoles = tenantRoles.filter((r) => r.scope !== scope);
      } else {
        newRoles = tenantRoles.map((r) => (r.scope === scope ? { ...r, level } : r));
      }
    } else {
      newRoles = [...tenantRoles, { scope, level }];
    }
    setTenantRoles(newRoles);
    saveRolesMutation.mutate(newRoles);
  };

  const handleSuperUserToggle = () => {
    let newRoles: TenantRole[];
    if (isSuperUser) {
      newRoles = tenantRoles.filter((r) => !(r.scope === 'all' && r.level === 'super_user'));
    } else {
      // Super user replaces all other roles
      newRoles = [{ scope: 'all', level: 'super_user' }];
    }
    setTenantRoles(newRoles);
    saveRolesMutation.mutate(newRoles);
  };

  // Update access level mutation
  const updateAccessMutation = useMutation({
    mutationFn: async ({
      accessId,
      accessLevel,
    }: {
      accessId: string;
      accessLevel: 'admin' | 'read_only';
    }) => {
      await api.put(`/user-conference-access/${accessId}`, {
        access_level: accessLevel,
      });
    },
    onMutate: () => {
      setSaving();
    },
    onSuccess: () => {
      refetchUserAccess();
      setSaved();
    },
    onError: (err) => {
      setSaveError();
      setErrorMessage(parseApiError(err));
    },
  });

  const handleSave = () => {
    if (emailError) return;
    setSaving();
    setErrorMessage('');

    const data: TenantUserUpdate = { ...formData };
    if (newPassword.trim()) {
      data.password = newPassword.trim();
    }
    updateMutation.mutate(data);
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit Team Member" size="max-w-4xl">
      <div className="px-6 py-4">
        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-300 mb-4">
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-[2fr_3fr] gap-6">
          {/* Left column - User details */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email *
              </label>
              <input
                type="email"
                required
                className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm ${emailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                onBlur={(e) => setEmailError(validateEmail(e.target.value))}
              />
              {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  First Name *
                </label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>

            {pronounData && pronounData.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pronouns
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                  value={formData.pronouns || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, pronouns: e.target.value || undefined })
                  }
                >
                  <option value="">Select...</option>
                  {pronounData.map((opt) => (
                    <option key={opt.id} value={opt.name}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Roles */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Roles</h4>

              {/* Super User toggle */}
              <div className="flex items-center justify-between mb-2 py-1 px-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                <div>
                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    Super User
                  </span>
                  <p className="text-xs text-purple-500 dark:text-purple-400">
                    Full access to everything
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSuperUserToggle}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    isSuperUser ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSuperUser ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              {/* Per-scope roles (only shown when not Super User) */}
              {!isSuperUser && (
                <div className="space-y-1.5">
                  {(
                    [
                      { scope: 'conferences' as const, label: 'Conferences' },
                      { scope: 'trainings' as const, label: 'Trainings' },
                      { scope: 'accounting' as const, label: 'Accounting' },
                    ] as const
                  ).map(({ scope, label }) => {
                    const current = tenantRoles.find((r) => r.scope === scope);
                    return (
                      <div
                        key={scope}
                        className="flex items-center justify-between py-1 px-2 bg-gray-50 dark:bg-gray-900 rounded"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                        <div className="flex gap-1">
                          {(
                            [
                              { level: 'admin' as const, label: 'Admin' },
                              { level: 'member' as const, label: 'Member' },
                            ] as const
                          ).map(({ level, label: lvlLabel }) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => handleRoleToggle(scope, level)}
                              className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                                current?.level === level
                                  ? level === 'admin'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-600 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              {lvlLabel}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  formData.is_active ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.is_active ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                New Password
              </label>
              <input
                type="password"
                minLength={8}
                placeholder="Leave empty to keep current"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Right column - Conference access */}
          <div className="border-l border-gray-200 dark:border-gray-700 pl-6 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              Conference Access
            </h4>

            {!hasConferenceRole ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                Assign a Conferences role to configure access.
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={formData.has_all_conference_access}
                    onChange={async (e) => {
                      const newValue = e.target.checked;
                      setFormData({ ...formData, has_all_conference_access: newValue });
                      setSaving();
                      try {
                        await api.put(`/users/${user.id}`, {
                          has_all_conference_access: newValue,
                        });
                        queryClient.invalidateQueries({ queryKey: ['team-users'] });
                        setSaved();
                      } catch (err) {
                        setSaveError();
                        setErrorMessage(parseApiError(err));
                        setFormData({ ...formData, has_all_conference_access: !newValue });
                      }
                    }}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">All Conferences</span>
                </label>

                {!formData.has_all_conference_access && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 p-2 max-h-48 overflow-y-auto">
                    {userAccessData && userAccessData.items.length > 0 ? (
                      <div className="space-y-1.5 mb-2">
                        {userAccessData.items.map((access) => (
                          <div
                            key={access.id}
                            className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5"
                          >
                            <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                              {access.conference_name}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <select
                                value={access.access_level}
                                onChange={(e) =>
                                  updateAccessMutation.mutate({
                                    accessId: access.id,
                                    accessLevel: e.target.value as 'admin' | 'read_only',
                                  })
                                }
                                className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                              >
                                <option value="read_only">Read-only</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => revokeAccessMutation.mutate(access.id)}
                                disabled={revokeAccessMutation.isPending}
                                className="text-red-500 hover:text-red-700 p-0.5"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        No access granted yet.
                      </p>
                    )}

                    {conferencesData &&
                      (() => {
                        const assignedIds = new Set(
                          userAccessData?.items.map((a) => a.conference_id) || []
                        );
                        const availableConferences = conferencesData.items.filter(
                          (c) => !assignedIds.has(c.id)
                        );
                        if (availableConferences.length === 0) return null;

                        return (
                          <div className="flex items-center gap-1.5">
                            <select
                              id="add-conference-select"
                              className="flex-1 min-w-0 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Add conference...
                              </option>
                              {availableConferences.map((conf) => (
                                <option key={conf.id} value={conf.id}>
                                  {conf.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const select = document.getElementById(
                                  'add-conference-select'
                                ) as HTMLSelectElement;
                                if (select.value) {
                                  grantAccessMutation.mutate({
                                    conferenceId: select.value,
                                    accessLevel: 'read_only',
                                  });
                                  select.value = '';
                                }
                              }}
                              disabled={grantAccessMutation.isPending}
                              className="shrink-0 px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        );
                      })()}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={
            updateMutation.isPending ||
            !!emailError ||
            (newPassword.length > 0 && newPassword.length < 8)
          }
          className={`px-4 py-1.5 text-sm font-medium text-white border border-transparent rounded-md transition-colors duration-200 disabled:opacity-50 ${
            saveStatus === 'saved'
              ? 'bg-green-600'
              : saveStatus === 'error'
                ? 'bg-red-600'
                : 'bg-primary-600 hover:bg-primary-700'
          }`}
        >
          {saveStatus === 'saving' ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
              Saving...
            </span>
          ) : saveStatus === 'saved' ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          ) : saveStatus === 'error' ? (
            'Save failed'
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </Modal>
  );
}
