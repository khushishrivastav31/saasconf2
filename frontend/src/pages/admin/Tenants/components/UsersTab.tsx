import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import Modal from '../../../../components/Modal';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { validateEmail } from '../../../../utils/validators';
import { parseApiError } from '../../../../utils/apiError';
import type {
  TenantUser,
  TenantRole,
  TenantUserCreate,
  TenantUserUpdate,
  PaginatedResponse,
} from '../../../../types';

export default function UsersTab({
  tenantId,
  onAddUser,
  onSuperUserChange,
}: {
  tenantId: string;
  onAddUser: () => void;
  onSuperUserChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TenantUser | null>(null);
  const [unlockToast, setUnlockToast] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<TenantUser>>(`/users?tenant_id=${tenantId}`);
      return response.data;
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}?permanent=true`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
      onSuperUserChange();
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post<{
        message: string;
        was_locked: boolean;
        attempts_cleared: number;
      }>(`/users/${userId}/unlock-login`);
      return res.data;
    },
    onSuccess: (data) => {
      setUnlockToast(data.message);
      window.setTimeout(() => setUnlockToast(null), 4000);
    },
    onError: (err) => {
      setUnlockToast(parseApiError(err));
      window.setTimeout(() => setUnlockToast(null), 4000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {unlockToast && (
        <div className="mb-3 px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          {unlockToast}
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Users</h4>
        <button
          onClick={onAddUser}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-primary-600 hover:bg-primary-700"
        >
          Add User
        </button>
      </div>

      {data && data.items.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Pronouns
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {data.items.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {`${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {user.pronouns || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {user.tenant_roles && user.tenant_roles.length > 0 ? (
                        user.tenant_roles.map((r) => (
                          <span
                            key={r.scope}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              r.scope === 'all' && r.level === 'super_user'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                : r.level === 'admin'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {r.scope === 'all'
                              ? 'Super User'
                              : `${r.scope.charAt(0).toUpperCase() + r.scope.slice(1)} ${r.level.charAt(0).toUpperCase() + r.level.slice(1)}`}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No roles</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.is_active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingUser(user)}
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
                        onClick={() => unlockMutation.mutate(user.id)}
                        disabled={unlockMutation.isPending}
                        className="text-gray-400 hover:text-amber-500 p-1 rounded transition-colors disabled:opacity-50"
                        title="Reset failed-login counter (unlock account)"
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
                            d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => setRemoveTarget(user)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Delete user"
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
      ) : (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No users found.</p>
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          tenantId={tenantId}
          onSuperUserChange={onSuperUserChange}
          onClose={() => {
            setEditingUser(null);
            queryClient.invalidateQueries({
              queryKey: ['tenant-users', tenantId],
            });
          }}
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="Delete User"
        message={`Are you sure you want to permanently delete "${removeTarget?.email}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget.id);
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

function EditUserModal({
  user,
  tenantId,
  onSuperUserChange,
  onClose,
}: {
  user: TenantUser;
  tenantId: string;
  onSuperUserChange: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<TenantUserUpdate>({
    email: user.email,
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    pronouns: user.pronouns ?? '',
    role: user.role,
    is_active: user.is_active,
  });
  const [newPassword, setNewPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const [errorMessage, setErrorMessage] = useState('');

  // Tenant roles state
  const [tenantRoles, setTenantRoles] = useState<TenantRole[]>(user.tenant_roles || []);
  const isSuperUser = tenantRoles.some((r) => r.scope === 'all' && r.level === 'super_user');

  useEffect(() => {
    setTenantRoles(user.tenant_roles || []);
  }, [user.tenant_roles]);

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUserUpdate) => {
      await api.put(`/users/${user.id}`, data);
    },
    onMutate: () => {
      setSaving();
      setErrorMessage('');
    },
    onSuccess: () => {
      setSaved();
      setNewPassword('');
    },
    onError: (error: unknown) => {
      setSaveError();
      const err = error as { response?: { data?: { detail?: string } } };
      setErrorMessage(err.response?.data?.detail || 'Failed to update user');
    },
  });

  const saveRolesMutation = useMutation({
    mutationFn: async (roles: TenantRole[]) => {
      await api.put(`/users/${user.id}/tenant-roles`, { roles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
      onSuperUserChange();
    },
    onError: (err) => {
      setErrorMessage(parseApiError(err));
    },
  });

  const handleRoleToggle = (scope: TenantRole['scope'], level: TenantRole['level']) => {
    let newRoles: TenantRole[];
    const existing = tenantRoles.find((r) => r.scope === scope);
    if (existing) {
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
      newRoles = [{ scope: 'all', level: 'super_user' }];
    }
    setTenantRoles(newRoles);
    saveRolesMutation.mutate(newRoles);
  };

  const handleSave = () => {
    if (emailError) return;
    const data: TenantUserUpdate = { ...formData };
    if (newPassword.trim()) {
      data.password = newPassword.trim();
    }
    updateMutation.mutate(data);
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit User" size="max-w-md" zIndex="z-[60]">
      <div className="px-6 pb-2 -mt-2 flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === 'error' && <span className="text-xs text-red-600">Save failed</span>}
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            type="email"
            className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${emailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            onBlur={(e) => setEmailError(validateEmail(e.target.value))}
          />
          {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            First Name
          </label>
          <input
            type="text"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Last Name
          </label>
          <input
            type="text"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Pronouns
          </label>
          <input
            type="text"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.pronouns}
            onChange={(e) => setFormData({ ...formData, pronouns: e.target.value })}
            placeholder="e.g., they/them"
          />
        </div>

        {/* Roles */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Roles</h4>

          {/* Super User toggle */}
          <div className="flex items-center justify-between mb-2 py-1.5 px-2 bg-purple-50 dark:bg-purple-900/20 rounded">
            <div>
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Super User
              </span>
              <p className="text-xs text-purple-500 dark:text-purple-400">
                Full access + Stripe keys, deletion
              </p>
            </div>
            <button
              type="button"
              onClick={handleSuperUserToggle}
              disabled={saveRolesMutation.isPending}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 ${
                isSuperUser ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isSuperUser ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Per-scope roles */}
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

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</label>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              formData.is_active ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.is_active ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            New Password
          </label>
          <input
            type="password"
            minLength={8}
            placeholder="Leave empty to keep current password"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Minimum 8 characters. Only fill in to change the password.
          </p>
        </div>
      </div>

      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
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
          className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50 transition-colors duration-200 ${
            saveStatus === 'saved'
              ? 'bg-green-600 hover:bg-green-700'
              : saveStatus === 'error'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary-600 hover:bg-primary-700'
          }`}
        >
          {saveStatus === 'saving' ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          ) : saveStatus === 'saved' ? (
            <span className="flex items-center gap-2">
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
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </Modal>
  );
}

function AddUserModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [formData, setFormData] = useState<TenantUserCreate>({
    email: '',
    first_name: '',
    last_name: '',
    pronouns: '',
    role: 'user',
  });
  const [emailError, setEmailError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: TenantUserCreate) => {
      await api.post(`/users?tenant_id=${tenantId}`, data);
    },
    onSuccess: () => {
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError) return;
    createMutation.mutate(formData);
  };

  return (
    <Modal open={true} onClose={onClose} title="Add User" size="max-w-md" zIndex="z-[60]">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <input
              type="email"
              required
              className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${emailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onBlur={(e) => setEmailError(validateEmail(e.target.value))}
            />
            {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              First Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Last Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Pronouns
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.pronouns}
              onChange={(e) => setFormData({ ...formData, pronouns: e.target.value })}
              placeholder="e.g., they/them"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Role
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'tenant_admin' | 'user',
                })
              }
            >
              <option value="user">User</option>
              <option value="tenant_admin">Tenant Admin</option>
            </select>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || !!emailError}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export { EditUserModal, AddUserModal };
