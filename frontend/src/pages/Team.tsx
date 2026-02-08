import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../config/api";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import { parseApiError } from "../utils/apiError";
import type {
  TenantUser,
  TenantUserCreate,
  TenantUserUpdate,
  PaginatedResponse,
  Conference,
  UserConferenceAccessWithDetails,
} from "../types";

export default function Team() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["team-users"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<TenantUser>>(
        "/users?page_size=100",
      );
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      setDeleteTarget(null);
      setError(null);
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
          u.last_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  const roleLabel = (role: string) =>
    role === "tenant_admin" ? "Admin" : "Read-only";
  const roleBadge = (role: string) =>
    role === "tenant_admin"
      ? "bg-purple-100 text-purple-700"
      : "bg-gray-100 text-gray-700";

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage team members.
          </p>
        </div>
        <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Member
          </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
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
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
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
          className="w-full sm:w-80 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-500 text-sm">
          {users.length === 0
            ? "No team members yet. Add your first member."
            : "No members match your search."}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {[user.first_name, user.last_name].filter(Boolean).join(" ") || "-"}
                        {user.pronouns && (
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">({user.pronouns})</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadge(user.role)}`}
                    >
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {user.last_login
                      ? new Date(user.last_login).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
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
                        onClick={() => setDeleteTarget(user)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Deactivate"
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
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
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
              setSuccessMessage(`Team member "${memberName}" has been created successfully.`);
              setTimeout(() => setSuccessMessage(null), 5000);
            }
            // Force refetch to ensure new data is loaded
            queryClient.refetchQueries({ queryKey: ["team-users"] });
          }}
        />
      )}

      {/* Edit Member Modal */}
      {editingUser && (
        <EditMemberModal
          key={`${editingUser.id}-${editingUser.updated_at}`}
          user={editingUser}
          onClose={() => {
            setEditingUserId(null);
            // Force refetch to ensure updated data is loaded
            queryClient.refetchQueries({ queryKey: ["team-users"] });
          }}
        />
      )}

      {/* Confirm Deactivate */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Deactivate Member"
        message={`Are you sure you want to deactivate "${deleteTarget?.email}"? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function AddMemberModal({ onClose }: { onClose: (created?: boolean, memberName?: string) => void }) {
  const [formData, setFormData] = useState<TenantUserCreate>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "user",
  });
  const [errorMessage, setErrorMessage] = useState("");

  const { data: pronounData } = useQuery({
    queryKey: ["user-pronoun-options"],
    queryFn: async () => {
      const res = await api.get<{ id: string; name: string }[]>("/users/pronoun-options");
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TenantUserCreate) => {
      await api.post("/users", data);
      return data;
    },
    onSuccess: (data) => {
      const memberName = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.email;
      onClose(true, memberName);
    },
    onError: (err) => setErrorMessage(parseApiError(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    createMutation.mutate(formData);
  };

  return (
    <Modal open={true} onClose={() => onClose()} title="Add Team Member" size="max-w-md">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email *
            </label>
            <input
              type="email"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
            />
            <p className="mt-1 text-xs text-gray-500">Minimum 8 characters.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                First Name *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData({ ...formData, first_name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Last Name *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData({ ...formData, last_name: e.target.value })
                }
              />
            </div>
          </div>

          {pronounData && pronounData.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Pronouns
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.pronouns || ""}
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

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Access Level
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as "tenant_admin" | "user",
                })
              }
            >
              <option value="user">Read-only</option>
              <option value="tenant_admin">Admin</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Read-only users can view all data but cannot create, edit, or delete.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create Member"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditMemberModal({
  user,
  onClose,
}: {
  user: TenantUser;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<TenantUserUpdate>({
    email: user.email,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    pronouns: user.pronouns || "",
    role: user.role,
    is_active: user.is_active,
    has_all_conference_access: user.has_all_conference_access,
  });
  const [newPassword, setNewPassword] = useState("");

  // Sync formData when user prop changes (e.g., after query refetch)
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      has_all_conference_access: user.has_all_conference_access,
    }));
  }, [user.has_all_conference_access]);

  const { data: pronounData } = useQuery({
    queryKey: ["user-pronoun-options"],
    queryFn: async () => {
      const res = await api.get<{ id: string; name: string }[]>("/users/pronoun-options");
      return res.data;
    },
  });

  // Fetch conferences for assignment
  const { data: conferencesData } = useQuery({
    queryKey: ["conferences-for-access"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Conference>>("/conferences?page_size=100");
      return res.data;
    },
  });

  // Fetch user's current conference access
  const { data: userAccessData, refetch: refetchUserAccess } = useQuery({
    queryKey: ["user-conference-access", user.id],
    queryFn: async () => {
      const res = await api.get<{ items: UserConferenceAccessWithDetails[]; total: number }>(
        `/user-conference-access/user/${user.id}`
      );
      return res.data;
    },
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUserUpdate) => {
      await api.put(`/users/${user.id}`, data);
    },
    onMutate: () => {
      setSaveStatus("saving");
      setErrorMessage("");
    },
    onSuccess: () => {
      setSaveStatus("saved");
      setNewPassword("");
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (err) => {
      setSaveStatus("error");
      setErrorMessage(parseApiError(err));
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  // Grant conference access mutation
  const grantAccessMutation = useMutation({
    mutationFn: async ({ conferenceId, accessLevel }: { conferenceId: string; accessLevel: "admin" | "read_only" }) => {
      // If user currently has all conference access, turn it off first
      if (user.has_all_conference_access) {
        await api.put(`/users/${user.id}`, { has_all_conference_access: false });
      }
      await api.post("/user-conference-access", {
        user_id: user.id,
        conference_id: conferenceId,
        access_level: accessLevel,
      });
    },
    onSuccess: () => {
      refetchUserAccess();
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: (err) => setErrorMessage(parseApiError(err)),
  });

  // Revoke conference access mutation
  const revokeAccessMutation = useMutation({
    mutationFn: async (accessId: string) => {
      await api.delete(`/user-conference-access/${accessId}`);
    },
    onSuccess: () => {
      refetchUserAccess();
    },
    onError: (err) => setErrorMessage(parseApiError(err)),
  });

  // Update access level mutation
  const updateAccessMutation = useMutation({
    mutationFn: async ({ accessId, accessLevel }: { accessId: string; accessLevel: "admin" | "read_only" }) => {
      await api.put(`/user-conference-access/${accessId}`, {
        access_level: accessLevel,
      });
    },
    onSuccess: () => {
      refetchUserAccess();
    },
    onError: (err) => setErrorMessage(parseApiError(err)),
  });

  const handleSave = () => {
    const data: TenantUserUpdate = { ...formData };
    if (newPassword.trim()) {
      data.password = newPassword.trim();
    }
    updateMutation.mutate(data);
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit Team Member" size="max-w-2xl">
      <div className="px-6 pb-2 -mt-2 flex justify-end items-center">
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === "error" && <span className="text-xs text-red-600">Save failed</span>}
        </div>
      </div>

      <div className="px-6 py-4">
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Left column - User details */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email *</label>
              <input
                type="email"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {pronounData && pronounData.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Pronouns</label>
                  <select
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.pronouns || ""}
                    onChange={(e) => setFormData({ ...formData, pronouns: e.target.value || undefined })}
                  >
                    <option value="">Select...</option>
                    {pronounData.map((opt) => (
                      <option key={opt.id} value={opt.name}>{opt.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as "tenant_admin" | "user" })}
                >
                  <option value="user">Read-only</option>
                  <option value="tenant_admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="text-sm font-medium text-gray-700">Active</label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  formData.is_active ? "bg-primary-600" : "bg-gray-200"
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.is_active ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>

            <div className="pt-2 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                minLength={8}
                placeholder="Leave empty to keep current"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Right column - Conference access */}
          <div className="border-l border-gray-200 pl-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Conference Access</h4>

            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={formData.has_all_conference_access}
                onChange={async (e) => {
                  const newValue = e.target.checked;
                  setFormData({ ...formData, has_all_conference_access: newValue });
                  try {
                    await api.put(`/users/${user.id}`, { has_all_conference_access: newValue });
                    queryClient.invalidateQueries({ queryKey: ["team-users"] });
                  } catch (err) {
                    setErrorMessage(parseApiError(err));
                    setFormData({ ...formData, has_all_conference_access: !newValue });
                  }
                }}
                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">All Conferences</span>
            </label>

            {!formData.has_all_conference_access && (
              <div className="border border-gray-200 rounded-lg bg-gray-50 p-2 max-h-48 overflow-y-auto">
                {userAccessData && userAccessData.items.length > 0 ? (
                  <div className="space-y-1.5 mb-2">
                    {userAccessData.items.map((access) => (
                      <div key={access.id} className="flex items-center justify-between bg-white border border-gray-200 rounded px-2 py-1.5">
                        <span className="text-sm text-gray-900 truncate">{access.conference_name}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <select
                            value={access.access_level}
                            onChange={(e) => updateAccessMutation.mutate({ accessId: access.id, accessLevel: e.target.value as "admin" | "read_only" })}
                            className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mb-2">No access granted yet.</p>
                )}

                {conferencesData && (() => {
                  const assignedIds = new Set(userAccessData?.items.map((a) => a.conference_id) || []);
                  const availableConferences = conferencesData.items.filter((c) => !assignedIds.has(c.id));
                  if (availableConferences.length === 0) return null;

                  return (
                    <div className="flex items-center gap-1.5">
                      <select
                        id="add-conference-select"
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        defaultValue=""
                      >
                        <option value="" disabled>Add conference...</option>
                        {availableConferences.map((conf) => (
                          <option key={conf.id} value={conf.id}>{conf.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const select = document.getElementById("add-conference-select") as HTMLSelectElement;
                          if (select.value) {
                            grantAccessMutation.mutate({ conferenceId: select.value, accessLevel: "read_only" });
                            select.value = "";
                          }
                        }}
                        disabled={grantAccessMutation.isPending}
                        className="px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-3 bg-gray-50 rounded-b-lg flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending || (newPassword.length > 0 && newPassword.length < 8)}
          className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}
