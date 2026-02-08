import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import api from "../../../config/api";
import { validatePhone } from "../../../utils/validators";
import type {
  Conference,
  Volunteer,
  VolunteerCreate,
  VolunteerUpdate,
  VolunteerRole,
  VolunteerStatus,
  PaginatedResponse,
} from "../../../types";
import { parseApiError } from "../../../utils/apiError";
import Modal from "../../../components/Modal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import RichTextEditor from "../../../components/common/RichTextEditor";
import AttachmentList from "../../../components/AttachmentList";
import { ErrorBanner } from "../../../components/common/ErrorBanner";
import { EditIcon, DeleteIcon } from "../icons";

function ConferenceVolunteersTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createPhoneError, setCreatePhoneError] = useState<string | null>(null);
  const [editPhoneError, setEditPhoneError] = useState<string | null>(null);
  const [editEmergencyPhoneError, setEditEmergencyPhoneError] = useState<string | null>(null);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(
    null,
  );
  const [deleteVolunteerTarget, setDeleteVolunteerTarget] =
    useState<Volunteer | null>(null);
  const [editForm, setEditForm] = useState<VolunteerUpdate>({});
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "",
    tshirt_size: "",
    notes: "",
  });

  // Fetch linked volunteers
  const { data, isLoading } = useQuery({
    queryKey: ["conference-volunteers", conference.id],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Volunteer>>(
        `/conferences/${conference.id}/volunteers`,
      );
      return response.data;
    },
  });

  // Fetch all tenant volunteers for linking
  const { data: allVolunteers } = useQuery({
    queryKey: ["all-volunteers"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Volunteer>>(
        `/volunteers?page_size=100`,
      );
      return response.data;
    },
  });

  const { data: rolesData } = useQuery({
    queryKey: ["volunteer-roles", conference.id],
    queryFn: async () => {
      const response = await api.get<{ items: VolunteerRole[]; total: number }>(
        `/conferences/${conference.id}/settings/volunteer-roles`,
      );
      return response.data;
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (volunteerId: string) => {
      await api.post(`/conferences/${conference.id}/volunteers`, {
        id: volunteerId,
      });
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to link volunteer"));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: VolunteerCreate) => {
      await api.post("/volunteers", data);
    },
    onSuccess: () => {
      setLinkError(null);
      setShowCreateForm(false);
      setCreatePhoneError(null);
      setCreateForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        role: "",
        tshirt_size: "",
        notes: "",
      });
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to create volunteer"));
    },
  });

  const volunteerUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VolunteerUpdate }) => {
      await api.put(`/volunteers/${id}`, data);
    },
    onSuccess: () => {
      setEditingVolunteer(null);
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to update volunteer"));
    },
  });

  const volunteerDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/volunteers/${id}`);
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to delete volunteer"));
    },
  });

  const openEditVolunteer = (volunteer: Volunteer) => {
    setEditingVolunteer(volunteer);
    setEditPhoneError(null);
    setEditEmergencyPhoneError(null);
    setEditForm({
      first_name: volunteer.first_name,
      last_name: volunteer.last_name,
      email: volunteer.email,
      phone: volunteer.phone || "",
      status: volunteer.status,
      role: volunteer.role || "",
      tshirt_size: volunteer.tshirt_size || "",
      notes: volunteer.notes || "",
      emergency_contact_name: volunteer.emergency_contact_name || "",
      emergency_contact_phone: volunteer.emergency_contact_phone || "",
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVolunteer) return;
    if (editPhoneError || editEmergencyPhoneError) return;
    volunteerUpdateMutation.mutate({ id: editingVolunteer.id, data: editForm });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createPhoneError) return;
    createMutation.mutate({
      ...createForm,
      conference_id: conference.id,
    });
  };

  const linkedIds = new Set(data?.items?.map((v) => v.id) || []);
  const unlinkableVolunteers =
    allVolunteers?.items?.filter((v) => !linkedIds.has(v.id)) || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Linked Volunteers ({data?.total || 0})
        </h4>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {unlinkableVolunteers.length > 0 && (
              <select
                className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    linkMutation.mutate(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Link existing...</option>
                {unlinkableVolunteers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name} ({v.email})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              {showCreateForm ? "Cancel" : "Create New"}
            </button>
          </div>
        )}
      </div>

      <ErrorBanner message={linkError} />

      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                First Name *
              </label>
              <input
                type="text"
                required
                value={createForm.first_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, first_name: e.target.value })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Last Name *
              </label>
              <input
                type="text"
                required
                value={createForm.last_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, last_name: e.target.value })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Email *
              </label>
              <input
                type="email"
                required
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Phone
              </label>
              <input
                type="tel"
                value={createForm.phone}
                onChange={(e) => {
                  const value = e.target.value;
                  setCreateForm({ ...createForm, phone: value });
                  setCreatePhoneError(validatePhone(value));
                }}
                className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${createPhoneError ? "border-red-300" : "border-gray-300"}`}
                placeholder="+491234545 or 00491234566"
              />
              {createPhoneError && <p className="mt-1 text-xs text-red-600">{createPhoneError}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Role
              </label>
              <select
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm({ ...createForm, role: e.target.value })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select a role...</option>
                {rolesData?.items
                  ?.filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                T-Shirt Size
              </label>
              <select
                value={createForm.tshirt_size}
                onChange={(e) =>
                  setCreateForm({ ...createForm, tshirt_size: e.target.value })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select size</option>
                {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Comments
            </label>
            <RichTextEditor
              value={createForm.notes}
              onChange={(html) =>
                setCreateForm({ ...createForm, notes: html })
              }
              placeholder="Any notes or comments about this volunteer..."
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending || !!createPhoneError}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Volunteer"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.items.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {volunteer.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {volunteer.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        volunteer.status === "active"
                          ? "bg-green-100 text-green-700"
                          : volunteer.status === "approved"
                            ? "bg-blue-100 text-blue-700"
                            : volunteer.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {volunteer.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {volunteer.role || "-"}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditVolunteer(volunteer)}
                          className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => setDeleteVolunteerTarget(volunteer)}
                          disabled={volunteerDeleteMutation.isPending}
                          className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
          No volunteers linked to this conference yet.
        </div>
      )}

      {/* Edit Volunteer Modal */}
      <Modal
        open={!!editingVolunteer}
        onClose={() => setEditingVolunteer(null)}
        title="Edit Volunteer"
      >
        {editingVolunteer && (
          <form onSubmit={handleEditSubmit}>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.first_name || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, first_name: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.last_name || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, last_name: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditForm({ ...editForm, phone: value });
                      setEditPhoneError(validatePhone(value));
                    }}
                    className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${editPhoneError ? "border-red-300" : "border-gray-300"}`}
                    placeholder="+491234545 or 00491234566"
                  />
                  {editPhoneError && <p className="mt-1 text-xs text-red-600">{editPhoneError}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={editForm.status || "pending"}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        status: e.target.value as VolunteerStatus,
                      })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    {(
                      [
                        "pending",
                        "approved",
                        "active",
                        "inactive",
                        "rejected",
                      ] as const
                    ).map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Role
                  </label>
                  <select
                    value={editForm.role || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, role: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select a role...</option>
                    {rolesData?.items
                      ?.filter((r) => r.is_active)
                      .map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    T-Shirt Size
                  </label>
                  <select
                    value={editForm.tshirt_size || ""}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        tshirt_size: e.target.value,
                      })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select size</option>
                    {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <RichTextEditor
                  value={editForm.notes || ""}
                  onChange={(html) =>
                    setEditForm({ ...editForm, notes: html })
                  }
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={editForm.emergency_contact_name || ""}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        emergency_contact_name: e.target.value,
                      })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={editForm.emergency_contact_phone || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditForm({
                        ...editForm,
                        emergency_contact_phone: value,
                      });
                      setEditEmergencyPhoneError(validatePhone(value));
                    }}
                    className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${editEmergencyPhoneError ? "border-red-300" : "border-gray-300"}`}
                    placeholder="+491234545 or 00491234566"
                  />
                  {editEmergencyPhoneError && <p className="mt-1 text-xs text-red-600">{editEmergencyPhoneError}</p>}
                </div>
              </div>

              <AttachmentList
                entityType="volunteer"
                entityId={editingVolunteer.id}
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingVolunteer(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={volunteerUpdateMutation.isPending || !!editPhoneError || !!editEmergencyPhoneError}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {volunteerUpdateMutation.isPending
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteVolunteerTarget}
        title="Delete Volunteer"
        message={`Are you sure you want to delete "${deleteVolunteerTarget?.full_name}"? This will permanently remove them.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteVolunteerTarget)
            volunteerDeleteMutation.mutate(deleteVolunteerTarget.id);
          setDeleteVolunteerTarget(null);
        }}
        onCancel={() => setDeleteVolunteerTarget(null)}
      />
    </div>
  );
}

export default ConferenceVolunteersTab;
