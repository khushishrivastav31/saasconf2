import { useState, useEffect } from "react";
import type {
  Conference,
  TenantLocationType,
  TenantLocationTypeCreate,
  TenantLocationTypeUpdate,
} from "../../../../types";
import { parseApiError } from "../../../../utils/apiError";
import Modal from "../../../../components/Modal";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import RichTextEditor from "../../../../components/common/RichTextEditor";
import RichTextDisplay from "../../../../components/common/RichTextDisplay";
import StatusBadge from "../../../../components/common/StatusBadge";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../../components/common/LoadingSpinner";
import ModalFooter from "../../../../components/common/ModalFooter";
import { useSettingsCrud } from "../../../../hooks/useSettingsCrud";
import { EditIcon, DeleteIcon } from "../../icons";

// --- Conference Location Types Tab -------------------------------------------

function ConferenceLocationTypesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<TenantLocationType | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<TenantLocationType | null>(
    null,
  );

  const {
    data,
    isLoading,
    isError,
    queryError,
    createMutation,
    updateMutation,
    deleteMutation,
    error,
    setError,
  } = useSettingsCrud<TenantLocationType, TenantLocationTypeCreate, TenantLocationTypeUpdate>({
    conferenceId: conference.id,
    endpoint: "location-types",
    queryKey: "location-types",
    onCreateSuccess: () => {
      setIsModalOpen(false);
    },
    onUpdateSuccess: () => {
      setEditingType(null);
      setIsModalOpen(false);
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
            Define the types of locations available for this conference
          </p>
        </div>
        {isAdmin && (
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
        )}
      </div>

      {!isModalOpen && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorBanner message={`Failed to load location types: ${parseApiError(queryError)}`} />
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
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items?.map((locationType) => (
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
                    <RichTextDisplay content={locationType.description} truncate className="text-sm text-gray-500 max-w-xs" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={locationType.is_active} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {locationType.usage_count}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(locationType)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                        title="Edit"
                      >
                        <EditIcon />
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
                        <DeleteIcon />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No location types defined yet. Click &quot;Add Type&quot; to
                    create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConferenceLocationTypeModal
        key={editingType?.id ?? "new"}
        open={isModalOpen}
        locationType={editingType}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={error}
      />

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

// --- Conference Location Type Modal ------------------------------------------

function ConferenceLocationTypeModal({
  open,
  locationType,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  locationType: TenantLocationType | null;
  onClose: () => void;
  onSubmit: (data: TenantLocationTypeCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<TenantLocationTypeCreate>({
    name: "",
    slug: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        name: locationType?.name || "",
        slug: locationType?.slug || "",
        description: locationType?.description || "",
        is_active: locationType?.is_active ?? true,
      });
    }
  }, [open, locationType]);

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
    <Modal
      open={open}
      onClose={onClose}
      title={locationType ? "Edit Location Type" : "Add Location Type"}
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

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
              Lowercase letters, numbers, and underscores only. Must start with
              a letter.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <RichTextEditor
              value={formData.description || ""}
              onChange={(html) =>
                setFormData({ ...formData, description: html })
              }
              rows={3}
            />
          </div>

          <div className="flex items-center">
            <input
              id="conf-location-type-active"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.is_active ?? true}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <label
              htmlFor="conf-location-type-active"
              className="ml-2 block text-sm text-gray-900"
            >
              Active
            </label>
          </div>
        </div>

        <ModalFooter onCancel={onClose} isLoading={isLoading} />
      </form>
    </Modal>
  );
}

export default ConferenceLocationTypesTab;
