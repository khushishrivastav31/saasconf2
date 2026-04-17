import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../config/api';
import Modal from '../../components/Modal';
import { parseApiError } from '../../utils/apiError';
import { validateEmail } from '../../utils/validators';
import type { TenantRole, TenantUserCreate, PaginatedResponse, Conference } from '../../types';

export default function AddMemberModal({
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

  const [tenantRoles, setTenantRoles] = useState<TenantRole[]>([]);
  const isSuperUser = tenantRoles.some((r) => r.scope === 'all' && r.level === 'super_user');
  const hasConferenceRole = isSuperUser || tenantRoles.some((r) => r.scope === 'conferences');

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

      if (tenantRoles.length > 0) {
        await api.put(`/users/${userId}/tenant-roles`, { roles: tenantRoles });
      }

      if (hasAllConferenceAccess) {
        await api.put(`/users/${userId}`, { has_all_conference_access: true });
      } else {
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
