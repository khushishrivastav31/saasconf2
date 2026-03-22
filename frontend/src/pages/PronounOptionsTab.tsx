import { useState, useEffect } from 'react';
import type { Conference, PronounOption, PronounOptionCreate, PronounOptionUpdate } from '../types';
import { parseApiError } from '../utils/apiError';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/common/StatusBadge';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import ModalFooter from '../components/common/ModalFooter';
import { useSettingsCrud } from '../hooks/useSettingsCrud';

// --- Pronoun Options Tab -----------------------------------------------------

export default function PronounOptionsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPronoun, setEditingPronoun] = useState<PronounOption | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PronounOption | null>(null);

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
  } = useSettingsCrud<PronounOption, PronounOptionCreate, PronounOptionUpdate>({
    conferenceId: conference.id,
    endpoint: 'pronouns',
    queryKey: 'pronoun-options',
    onCreateSuccess: () => {
      setIsModalOpen(false);
    },
    onUpdateSuccess: () => {
      setEditingPronoun(null);
      setIsModalOpen(false);
    },
  });

  const handleEdit = (pronoun: PronounOption) => {
    setEditingPronoun(pronoun);
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = (pronoun: PronounOption) => {
    setDeleteTarget(pronoun);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPronoun(null);
    setError(null);
  };

  const handleSubmit = (formData: PronounOptionCreate) => {
    if (editingPronoun) {
      updateMutation.mutate({ id: editingPronoun.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Pronoun Options</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage available pronouns for user profiles.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingPronoun(null);
              setIsModalOpen(true);
              setError(null);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Add Pronoun
          </button>
        )}
      </div>

      {!isModalOpen && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorBanner message={`Failed to load pronoun options: ${parseApiError(queryError)}`} />
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {data?.items?.map((pronoun) => (
                <tr key={pronoun.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {pronoun.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={pronoun.is_active} />
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(pronoun)}
                        className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors mr-2"
                        title="Edit"
                        aria-label="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => handleDelete(pronoun)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors"
                        title="Delete"
                        aria-label="Delete"
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
                    colSpan={3}
                    className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No pronoun options defined yet. Click &quot;Add Pronoun&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <PronounOptionModal
        open={isModalOpen}
        pronoun={editingPronoun}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={error}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Pronoun"
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

// --- Pronoun Option Modal ----------------------------------------------------

function PronounOptionModal({
  open,
  pronoun,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  pronoun: PronounOption | null;
  onClose: () => void;
  onSubmit: (data: PronounOptionCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<PronounOptionCreate>({
    name: '',
    is_active: true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        name: pronoun?.name || '',
        is_active: pronoun?.is_active ?? true,
      });
    }
  }, [open, pronoun]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pronoun ? 'Edit Pronoun' : 'Add Pronoun'}
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="flex items-center">
            <input
              id="pronoun-active"
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
              checked={formData.is_active ?? true}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            <label
              htmlFor="pronoun-active"
              className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
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

// --- Inline Icons ------------------------------------------------------------

function EditIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
