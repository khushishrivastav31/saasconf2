import { useState, useEffect } from "react";
import type {
  Conference,
  CFPCommitteeRole,
  CFPCommitteeRoleCreate,
  CFPCommitteeRoleUpdate,
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
import { useIsAdmin } from "../../../../hooks/useIsAdmin";
import { useSettingsCrud } from "../../../../hooks/useSettingsCrud";
import { EditIcon, DeleteIcon } from "../../icons";

// --- Conference Committee Roles Tab ------------------------------------------

function ConferenceCommitteeRolesTab({
  conference,
}: {
  conference: Conference;
}) {
  const isAdmin = useIsAdmin();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CFPCommitteeRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CFPCommitteeRole | null>(null);

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
  } = useSettingsCrud<CFPCommitteeRole, CFPCommitteeRoleCreate, CFPCommitteeRoleUpdate>({
    conferenceId: conference.id,
    endpoint: "committee-roles",
    queryKey: "committee-roles",
    onCreateSuccess: () => {
      setIsModalOpen(false);
    },
    onUpdateSuccess: () => {
      setEditingRole(null);
      setIsModalOpen(false);
    },
  });

  const handleEdit = (role: CFPCommitteeRole) => {
    setEditingRole(role);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (role: CFPCommitteeRole) => {
    setDeleteTarget(role);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRole(null);
    setError(null);
  };

  const handleSubmit = (formData: CFPCommitteeRoleCreate) => {
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
          <h2 className="text-lg font-medium text-gray-900">
            Committee Roles
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Define the roles available for program committee members
          </p>
        </div>
        {isAdmin && (
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
        )}
      </div>

      {!isModalOpen && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorBanner message={`Failed to load committee roles: ${parseApiError(queryError)}`} />
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
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
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
                    <RichTextDisplay content={role.description} truncate className="text-sm text-gray-500 max-w-xs" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={role.is_active} />
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(role)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => handleDelete(role)}
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
                    colSpan={4}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No committee roles defined yet. Click &quot;Add Role&quot;
                    to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConferenceCommitteeRoleModal
        open={isModalOpen}
        role={editingRole}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={error}
      />

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

// --- Conference Committee Role Modal -----------------------------------------

function ConferenceCommitteeRoleModal({
  open,
  role,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  role: CFPCommitteeRole | null;
  onClose: () => void;
  onSubmit: (data: CFPCommitteeRoleCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<CFPCommitteeRoleCreate>({
    name: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        name: role?.name || "",
        description: role?.description || "",
        is_active: role?.is_active ?? true,
      });
    }
  }, [open, role]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? "Edit Role" : "Add Role"}
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
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
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
              id="conf-committee-role-active"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.is_active ?? true}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <label
              htmlFor="conf-committee-role-active"
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

export default ConferenceCommitteeRolesTab;
