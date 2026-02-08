import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../config/api";
import type {
  Conference,
  TeamMember,
  TenantUser,
  PaginatedResponse,
} from "../../../types";
import { validatePhone } from "../../../utils/validators";
import { parseApiError } from "../../../utils/apiError";
import { ErrorBanner } from "../../../components/common/ErrorBanner";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { EditIcon, DeleteIcon } from "../icons";

function ConferenceTeamTab({
  conference,
  onUpdate,
  isAdmin,
}: {
  conference: Conference;
  onUpdate: () => void;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(
    conference.team_members || [],
  );
  const [newMember, setNewMember] = useState<TeamMember>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "",
    is_manager: false,
  });
  const [newPassword, setNewPassword] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TeamMember>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "",
    is_manager: false,
  });
  const [editPassword, setEditPassword] = useState("");
  const [editPhoneError, setEditPhoneError] = useState<string | null>(null);
  const [newPhoneError, setNewPhoneError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [userError, setUserError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ index: number; member: TeamMember } | null>(null);

  // Sync local state when conference data changes (e.g., after refetch)
  useEffect(() => {
    setTeamMembers(conference.team_members || []);
  }, [conference.team_members]);

  // Fetch existing tenant users to match team members
  const { data: usersData } = useQuery({
    queryKey: ["team-users"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<TenantUser>>(
        "/users?page_size=200",
      );
      return res.data;
    },
  });

  const usersByEmail: Record<string, TenantUser> = {};
  const usersById: Record<string, TenantUser> = {};
  for (const u of usersData?.items ?? []) {
    usersByEmail[u.email.toLowerCase()] = u;
    usersById[u.id] = u;
  }

  const findUserForMember = (member: TeamMember, originalEmail?: string): TenantUser | undefined => {
    // First, try to find by user_id (most reliable)
    if (member.user_id && usersById[member.user_id]) {
      return usersById[member.user_id];
    }
    // Then try by current email
    if (member.email) {
      const user = usersByEmail[member.email.toLowerCase()];
      if (user) return user;
    }
    // Finally, try by original email (handles email change scenarios)
    if (originalEmail) {
      return usersByEmail[originalEmail.toLowerCase()];
    }
    return undefined;
  };

  const updateMutation = useMutation({
    mutationFn: async (members: TeamMember[]) => {
      const response = await api.put(`/conferences/${conference.id}`, {
        team_members: members,
      });
      return response.data;
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      onUpdate();
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (error) => {
      setSaveStatus("error");
      setUserError(parseApiError(error));
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const addMember = async () => {
    if (!newMember.first_name.trim() || !newMember.last_name.trim()) return;
    setUserError(null);

    let userId: string | undefined;
    const emailLower = newMember.email?.trim().toLowerCase();

    // Check if a user with this email already exists
    const existingUser = emailLower ? usersByEmail[emailLower] : undefined;

    if (existingUser) {
      // Link to existing user instead of creating a new one
      userId = existingUser.id;
    } else if (newMember.email?.trim() && newPassword.trim()) {
      // No existing user, but email + password provided → create new user
      try {
        const res = await api.post<TenantUser>("/users", {
          email: newMember.email.trim(),
          password: newPassword.trim(),
          first_name: newMember.first_name.trim(),
          last_name: newMember.last_name.trim(),
          role: newMember.is_manager ? "tenant_admin" : "user",
        });
        userId = res.data.id;
        queryClient.invalidateQueries({ queryKey: ["team-users"] });
      } catch (err) {
        setUserError(parseApiError(err));
        return;
      }
    }

    const memberToAdd: TeamMember = { ...newMember };
    if (userId) {
      memberToAdd.user_id = userId;
    }

    const newMembers = [...teamMembers, memberToAdd];
    setTeamMembers(newMembers);
    setNewMember({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role: "",
      is_manager: false,
    });
    setNewPassword("");
    setNewPhoneError(null);
    updateMutation.mutate(newMembers);
  };

  const confirmRemoveMember = () => {
    if (removeTarget === null) return;
    const newMembers = teamMembers.filter((_, i) => i !== removeTarget.index);
    setTeamMembers(newMembers);
    updateMutation.mutate(newMembers);
    setRemoveTarget(null);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditForm({ ...teamMembers[index] });
    setEditPassword("");
    setEditPhoneError(null);
    setUserError(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditPhoneError(null);
    setUserError(null);
  };

  const saveEdit = async () => {
    if (editingIndex === null || !editForm.first_name.trim() || !editForm.last_name.trim()) return;
    setUserError(null);

    const existingMember = teamMembers[editingIndex];
    // Try to find the user by user_id first, then by original email (handles email changes)
    const existingUser = findUserForMember(existingMember, existingMember.email);

    // If the member has a linked user account, update role/password
    if (existingUser) {
      const updates: Record<string, unknown> = {};
      const newRole = editForm.is_manager ? "tenant_admin" : "user";
      if (existingUser.role !== newRole) {
        updates.role = newRole;
      }
      if (editForm.email && editForm.email !== existingUser.email) {
        updates.email = editForm.email;
      }
      if (editForm.first_name && editForm.first_name !== existingUser.first_name) {
        updates.first_name = editForm.first_name;
      }
      if (editForm.last_name && editForm.last_name !== existingUser.last_name) {
        updates.last_name = editForm.last_name;
      }
      if (editPassword.trim()) {
        updates.password = editPassword.trim();
      }
      if (Object.keys(updates).length > 0) {
        try {
          await api.put(`/users/${existingUser.id}`, updates);
          queryClient.invalidateQueries({ queryKey: ["team-users"] });
        } catch (err) {
          setUserError(parseApiError(err));
          return;
        }
      }
      // Always preserve/set user_id on the team member to prevent future lookup issues
      editForm.user_id = existingUser.id;
    } else if (editForm.email?.trim()) {
      // No linked user yet but email provided — check if user exists to link
      const existingUserWithEmail = usersByEmail[editForm.email.toLowerCase()];
      if (existingUserWithEmail) {
        // Link to existing user instead of creating a new one
        editForm.user_id = existingUserWithEmail.id;
      } else if (editPassword.trim()) {
        // No existing user, but password provided → create new user
        try {
          const res = await api.post<TenantUser>("/users", {
            email: editForm.email.trim(),
            password: editPassword.trim(),
            first_name: editForm.first_name.trim(),
            last_name: editForm.last_name.trim(),
            role: editForm.is_manager ? "tenant_admin" : "user",
          });
          editForm.user_id = res.data.id;
          queryClient.invalidateQueries({ queryKey: ["team-users"] });
        } catch (err) {
          setUserError(parseApiError(err));
          return;
        }
      }
    }

    const newMembers = [...teamMembers];
    newMembers[editingIndex] = { ...editForm };
    setTeamMembers(newMembers);
    setEditingIndex(null);
    setEditPassword("");
    updateMutation.mutate(newMembers);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900">
            Conference Team
          </h4>
          <p className="mt-0.5 text-xs text-gray-500">
            Conference Managers have admin rights. Other members have read-only
            access. Members with a password can log in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="animate-spin h-3 w-3"
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
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
        </div>
      </div>

      {/* Existing Team Members */}
      {teamMembers.length > 0 && (
        <div className="mb-4 space-y-2">
          {teamMembers.map((member, index) =>
            editingIndex === index ? (
              <div
                key={index}
                className="bg-blue-50 border border-blue-200 rounded-lg p-4"
              >
                <h5 className="text-sm font-medium text-blue-900 mb-3">
                  Edit Team Member
                </h5>

                <ErrorBanner message={userError} />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.first_name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, first_name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.last_name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, last_name: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Conference Chair"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.role || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, role: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.email || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, email: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="+491234545 or 00491234566"
                      className={`w-full border ${editPhoneError ? "border-red-300" : "border-gray-300"} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                      value={editForm.phone || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEditForm({ ...editForm, phone: value });
                        setEditPhoneError(validatePhone(value));
                      }}
                    />
                    {editPhoneError && (
                      <p className="mt-1 text-xs text-red-600">
                        {editPhoneError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Login access section */}
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {findUserForMember(teamMembers[editingIndex], teamMembers[editingIndex]?.email)
                          ? "New Password"
                          : "Password"}
                      </label>
                      <input
                        type="password"
                        placeholder={
                          findUserForMember(teamMembers[editingIndex], teamMembers[editingIndex]?.email)
                            ? "Leave empty to keep current"
                            : "Set to enable login"
                        }
                        minLength={8}
                        className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                      />
                      {editPassword && editPassword.length < 8 && (
                        <p className="mt-1 text-xs text-red-600">
                          Minimum 8 characters
                        </p>
                      )}
                    </div>
                    <div className="flex items-end pb-1">
                      {findUserForMember(teamMembers[editingIndex], teamMembers[editingIndex]?.email) ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
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
                              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                          </svg>
                          Has login access
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          Enter email + password to grant login access
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`edit_member_manager_${index}`}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      checked={editForm.is_manager}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          is_manager: e.target.checked,
                        })
                      }
                    />
                    <label
                      htmlFor={`edit_member_manager_${index}`}
                      className="ml-2 block text-sm text-gray-700"
                    >
                      Conference Manager
                    </label>
                    <span className="ml-2 text-xs text-gray-500">
                      ({editForm.is_manager ? "Admin rights" : "Read-only"})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={
                        !editForm.first_name.trim() ||
                        !editForm.last_name.trim() ||
                        !!editPhoneError ||
                        (editPassword.length > 0 && editPassword.length < 8)
                      }
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={index}
                className="bg-gray-50 border border-gray-200 rounded-lg p-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {[member.first_name, member.last_name].filter(Boolean).join(" ")}
                      </span>
                      {member.role && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                          {member.role}
                        </span>
                      )}
                      {member.is_manager && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Manager
                        </span>
                      )}
                      {findUserForMember(member) ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            member.is_manager
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {member.is_manager ? "Admin" : "Read-only"}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-gray-500 space-x-3">
                      {member.email && <span>{member.email}</span>}
                      {member.phone && <span>{member.phone}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(index)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveTarget({ index, member })}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Remove from team"
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Add Team Member */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h5 className="text-sm font-medium text-blue-900 mb-3">
            Add Team Member
          </h5>

          {editingIndex === null && <ErrorBanner message={userError} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                First Name *
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={newMember.first_name}
                onChange={(e) =>
                  setNewMember({ ...newMember, first_name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={newMember.last_name}
                onChange={(e) =>
                  setNewMember({ ...newMember, last_name: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Role
              </label>
              <input
                type="text"
                placeholder="e.g., Conference Chair"
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={newMember.role}
                onChange={(e) =>
                  setNewMember({ ...newMember, role: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Email
              </label>
              <input
                type="email"
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={newMember.email}
                onChange={(e) =>
                  setNewMember({ ...newMember, email: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Phone
              </label>
              <input
                type="tel"
                placeholder="+491234545 or 00491234566"
                className={`w-full border ${newPhoneError ? "border-red-300" : "border-gray-300"} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                value={newMember.phone}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewMember({ ...newMember, phone: value });
                  setNewPhoneError(validatePhone(value));
                }}
              />
              {newPhoneError && (
                <p className="mt-1 text-xs text-red-600">{newPhoneError}</p>
              )}
            </div>
          </div>

          {/* Login access section */}
          <div className="mt-3 pt-3 border-t border-blue-200">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Password
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="password"
                placeholder="Set to enable login"
                minLength={8}
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <div className="flex items-center">
                <span className="text-xs text-gray-500">
                  {newMember.email && newPassword.length >= 8
                    ? "Login account will be created"
                    : "Enter email + password (min. 8 chars) to grant login access"}
                </span>
              </div>
            </div>
            {newPassword && newPassword.length < 8 && (
              <p className="mt-1 text-xs text-red-600">
                Minimum 8 characters
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="new_member_manager"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={newMember.is_manager}
                onChange={(e) =>
                  setNewMember({ ...newMember, is_manager: e.target.checked })
                }
              />
              <label
                htmlFor="new_member_manager"
                className="ml-2 block text-sm text-gray-700"
              >
                Conference Manager
              </label>
              <span className="ml-2 text-xs text-gray-500">
                ({newMember.is_manager ? "Admin rights" : "Read-only"})
              </span>
            </div>
            <button
              type="button"
              onClick={addMember}
              disabled={
                !newMember.first_name.trim() ||
                !newMember.last_name.trim() ||
                !!newPhoneError ||
                (newPassword.length > 0 && newPassword.length < 8)
              }
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              <svg
                className="w-4 h-4 mr-1.5"
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
        </div>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove Team Member"
        message={
          removeTarget
            ? `Are you sure you want to remove "${[removeTarget.member.first_name, removeTarget.member.last_name].filter(Boolean).join(" ")}" from this conference's team? This only removes them from this conference - their user account (if any) will not be affected.`
            : ""
        }
        confirmLabel="Remove from Team"
        onConfirm={confirmRemoveMember}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

export default ConferenceTeamTab;
