import { useState, useEffect } from "react";
import type {
  Conference,
  SessionType,
  SessionTypeCreate,
  SessionTypeUpdate,
} from "../../../../types";
import { parseApiError } from "../../../../utils/apiError";
import Modal from "../../../../components/Modal";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import StatusBadge from "../../../../components/common/StatusBadge";
import { ErrorBanner } from "../../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../../components/common/LoadingSpinner";
import ModalFooter from "../../../../components/common/ModalFooter";
import { useSettingsCrud } from "../../../../hooks/useSettingsCrud";
import { EditIcon, DeleteIcon } from "../../icons";

// Helper function to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// --- Conference Session Types Tab ------------------------------------------

function ConferenceSessionTypesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<SessionType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionType | null>(null);

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
  } = useSettingsCrud<SessionType, SessionTypeCreate, SessionTypeUpdate>({
    conferenceId: conference.id,
    endpoint: "session-types",
    queryKey: "session-types",
    onCreateSuccess: () => {
      setIsModalOpen(false);
    },
    onUpdateSuccess: () => {
      setEditingType(null);
      setIsModalOpen(false);
    },
  });

  const handleEdit = (sessionType: SessionType) => {
    setEditingType(sessionType);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (sessionType: SessionType) => {
    setDeleteTarget(sessionType);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingType(null);
    setError(null);
  };

  const handleSubmit = (formData: SessionTypeCreate) => {
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
          <h2 className="text-lg font-medium text-gray-900">
            Session Types
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Define the types of sessions available for the conference
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
            Add Session Type
          </button>
        )}
      </div>

      {error && !isModalOpen && (
        <ErrorBanner message={error} />
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorBanner message={`Failed to load session types: ${parseApiError(queryError)}`} />
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
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CFP Eligible
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items.map((sessionType) => (
                <tr key={sessionType.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {sessionType.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {sessionType.slug}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900">
                      {sessionType.duration_minutes} min
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        sessionType.cfp_eligible
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {sessionType.cfp_eligible ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={sessionType.is_active} />
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(sessionType)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => handleDelete(sessionType)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Delete"
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
                    No session types defined yet. Click &quot;Add Session Type&quot;
                    to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConferenceSessionTypeModal
        open={isModalOpen}
        sessionType={editingType}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={error}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Session Type"
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

// --- Conference Session Type Modal -----------------------------------------

function ConferenceSessionTypeModal({
  open,
  sessionType,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  sessionType: SessionType | null;
  onClose: () => void;
  onSubmit: (data: SessionTypeCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<SessionTypeCreate>({
    name: "",
    slug: "",
    duration_minutes: 30,
    cfp_eligible: true,
    is_active: true,
  });
  const [autoSlug, setAutoSlug] = useState(true);

  useEffect(() => {
    if (open) {
      if (sessionType) {
        setFormData({
          name: sessionType.name,
          slug: sessionType.slug,
          duration_minutes: sessionType.duration_minutes,
          cfp_eligible: sessionType.cfp_eligible,
          is_active: sessionType.is_active,
        });
        setAutoSlug(false);
      } else {
        setFormData({
          name: "",
          slug: "",
          duration_minutes: 30,
          cfp_eligible: true,
          is_active: true,
        });
        setAutoSlug(true);
      }
    }
  }, [open, sessionType]);

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: autoSlug ? generateSlug(name) : prev.slug,
    }));
  };

  const handleSlugChange = (slug: string) => {
    setAutoSlug(false);
    setFormData((prev) => ({ ...prev, slug }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sessionType ? "Edit Session Type" : "Add Session Type"}
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <ErrorBanner message={error} />
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
              placeholder="e.g., Keynote Speech"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Slug *
            </label>
            <input
              type="text"
              required
              pattern="^[a-z0-9_-]+$"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm font-mono"
              value={formData.slug}
              onChange={(e) => handleSlugChange(e.target.value.toLowerCase())}
              placeholder="e.g., keynote"
            />
            <p className="mt-1 text-xs text-gray-500">
              Lowercase letters, numbers, hyphens, and underscores only
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Duration (minutes) *
            </label>
            <input
              type="number"
              required
              min={1}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.duration_minutes}
              onChange={(e) =>
                setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })
              }
            />
          </div>

          <div className="flex items-center">
            <input
              id="cfp-eligible"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.cfp_eligible ?? true}
              onChange={(e) =>
                setFormData({ ...formData, cfp_eligible: e.target.checked })
              }
            />
            <label
              htmlFor="cfp-eligible"
              className="ml-2 block text-sm text-gray-900"
            >
              CFP Eligible
            </label>
            <span className="ml-2 text-xs text-gray-500">
              (can be selected for Call for Papers submissions)
            </span>
          </div>

          <div className="flex items-center">
            <input
              id="session-type-active"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.is_active ?? true}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <label
              htmlFor="session-type-active"
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

export default ConferenceSessionTypesTab;
