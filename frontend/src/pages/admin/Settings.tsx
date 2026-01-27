import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../config/api";
import ConfirmDialog from "../../components/ConfirmDialog";
import type {
  VolunteerRole,
  VolunteerRoleCreate,
  VolunteerRoleUpdate,
  TenantLocationType,
  TenantLocationTypeCreate,
  TenantLocationTypeUpdate,
} from "../../types";

type ActiveTab = "volunteer-roles" | "location-types";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("volunteer-roles");

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Tenant Settings
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage volunteer roles and location types for your tenant
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("volunteer-roles")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "volunteer-roles"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Volunteer Roles
          </button>
          <button
            onClick={() => setActiveTab("location-types")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "location-types"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Location Types
          </button>
        </nav>
      </div>

      {activeTab === "volunteer-roles" ? (
        <VolunteerRolesTab />
      ) : (
        <LocationTypesTab />
      )}
    </div>
  );
}

// --- Volunteer Roles Tab -----------------------------------------------------

function VolunteerRolesTab() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<VolunteerRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VolunteerRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError: isQueryError,
    error: queryError,
  } = useQuery({
    queryKey: ["volunteer-roles"],
    queryFn: async () => {
      const response = await api.get<{ items: VolunteerRole[]; total: number }>(
        "/settings/volunteer-roles"
      );
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: VolunteerRoleCreate) => {
      const response = await api.post<VolunteerRole>(
        "/settings/volunteer-roles",
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-roles"] });
      setIsModalOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      setError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: VolunteerRoleUpdate;
    }) => {
      const response = await api.put<VolunteerRole>(
        `/settings/volunteer-roles/${id}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-roles"] });
      setEditingRole(null);
      setIsModalOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      setError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/settings/volunteer-roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-roles"] });
      setError(null);
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      setError(message);
    },
  });

  const handleEdit = (role: VolunteerRole) => {
    setEditingRole(role);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (role: VolunteerRole) => {
    setDeleteTarget(role);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRole(null);
    setError(null);
  };

  const handleSubmit = (formData: VolunteerRoleCreate) => {
    if (editingRole) {
      updateMutation.mutate({ id: editingRole.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Volunteer Roles</h2>
          <p className="mt-1 text-sm text-gray-500">
            Define the roles available for volunteers
          </p>
        </div>
        <button
          onClick={() => {
            setEditingRole(null);
            setIsModalOpen(true);
            setError(null);
          }}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          Add Role
        </button>
      </div>

      {error && !isModalOpen && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : isQueryError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Failed to load volunteer roles: {getErrorMessage(queryError)}
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items.map((role) => (
                <tr key={role.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {role.name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 max-w-xs truncate">
                      {role.description || "--"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        role.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {role.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(role)}
                      className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(role)}
                      className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No volunteer roles defined yet. Click &quot;Add Role&quot; to create
                    one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <VolunteerRoleModal
          role={editingRole}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={error}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Role"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// --- Volunteer Role Modal ----------------------------------------------------

function VolunteerRoleModal({
  role,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  role: VolunteerRole | null;
  onClose: () => void;
  onSubmit: (data: VolunteerRoleCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<VolunteerRoleCreate>({
    name: role?.name || "",
    description: role?.description || "",
    is_active: role?.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              {role ? "Edit Role" : "Add Role"}
            </h3>
          </div>

          <div className="px-6 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Name *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                rows={3}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="flex items-center">
              <input
                id="role-active"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={formData.is_active ?? true}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
              />
              <label
                htmlFor="role-active"
                className="ml-2 block text-sm text-gray-900"
              >
                Active
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Location Types Tab ------------------------------------------------------

function LocationTypesTab() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<TenantLocationType | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<TenantLocationType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError: isQueryError,
    error: queryError,
  } = useQuery({
    queryKey: ["location-types"],
    queryFn: async () => {
      const response = await api.get<{
        items: TenantLocationType[];
        total: number;
      }>("/settings/location-types");
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TenantLocationTypeCreate) => {
      const response = await api.post<TenantLocationType>(
        "/settings/location-types",
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-types"] });
      setIsModalOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      setError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: TenantLocationTypeUpdate;
    }) => {
      const response = await api.put<TenantLocationType>(
        `/settings/location-types/${id}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-types"] });
      setEditingType(null);
      setIsModalOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      setError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/settings/location-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-types"] });
      setError(null);
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      setError(message);
    },
  });

  const handleEdit = (locationType: TenantLocationType) => {
    setEditingType(locationType);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (locationType: TenantLocationType) => {
    setDeleteTarget(locationType);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingType(null);
    setError(null);
  };

  const handleSubmit = (formData: TenantLocationTypeCreate) => {
    if (editingType) {
      updateMutation.mutate({ id: editingType.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Location Types</h2>
          <p className="mt-1 text-sm text-gray-500">
            Define the types of locations available for your conferences
          </p>
        </div>
        <button
          onClick={() => {
            setEditingType(null);
            setIsModalOpen(true);
            setError(null);
          }}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          Add Type
        </button>
      </div>

      {error && !isModalOpen && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : isQueryError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Failed to load location types: {getErrorMessage(queryError)}
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage Count
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items.map((locationType) => (
                <tr key={locationType.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {locationType.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {locationType.slug}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 max-w-xs truncate">
                      {locationType.description || "--"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        locationType.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {locationType.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {locationType.usage_count}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(locationType)}
                      className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(locationType)}
                      disabled={locationType.usage_count > 0}
                      className={`p-1 rounded transition-colors ${
                        locationType.usage_count > 0
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-gray-400 hover:text-red-500"
                      }`}
                      title={
                        locationType.usage_count > 0
                          ? `Cannot delete: this type is used by ${locationType.usage_count} location(s)`
                          : "Delete this location type"
                      }
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No location types defined yet. Click &quot;Add Type&quot; to create
                    one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <LocationTypeModal
          locationType={editingType}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={error}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Location Type"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// --- Location Type Modal -----------------------------------------------------

function LocationTypeModal({
  locationType,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  locationType: TenantLocationType | null;
  onClose: () => void;
  onSubmit: (data: TenantLocationTypeCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<TenantLocationTypeCreate>({
    name: locationType?.name || "",
    slug: locationType?.slug || "",
    description: locationType?.description || "",
    is_active: locationType?.is_active ?? true,
  });

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, "")
      .replace(/[\s]+/g, "_")
      .replace(/^[^a-z]/, "")
      .replace(/_+/g, "_")
      .replace(/_$/, "");
  };

  const handleNameChange = (name: string) => {
    const updates: Partial<TenantLocationTypeCreate> = { name };
    // Auto-generate slug only when creating (not editing)
    if (!locationType) {
      updates.slug = generateSlug(name);
    }
    setFormData({ ...formData, ...updates });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              {locationType ? "Edit Location Type" : "Add Location Type"}
            </h3>
          </div>

          <div className="px-6 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Name *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Slug *
              </label>
              <input
                type="text"
                required
                pattern="^[a-z][a-z0-9_]*$"
                title="Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    slug: e.target.value.toLowerCase(),
                  })
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                Lowercase letters, numbers, and underscores only. Must start
                with a letter.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                rows={3}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="flex items-center">
              <input
                id="location-type-active"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={formData.is_active ?? true}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
              />
              <label
                htmlFor="location-type-active"
                className="ml-2 block text-sm text-gray-900"
              >
                Active
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Helpers -----------------------------------------------------------------

function getErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "data" in err.response &&
    err.response.data &&
    typeof err.response.data === "object" &&
    "detail" in err.response.data
  ) {
    const detail = (err.response.data as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: string }) => d.msg || JSON.stringify(d))
        .join(", ");
    }
    return JSON.stringify(detail);
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "An unexpected error occurred";
}
