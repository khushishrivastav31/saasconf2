import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  TenantLocationType,
  TenantLocationTypeCreate,
  TenantLocationTypeUpdate,
} from '../../../../types';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';
import StatusBadge from '../../../../components/common/StatusBadge';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { EmptyState } from '../../../../components/common/EmptyState';
import Modal from '../../../../components/Modal';
import ModalFooter from '../../../../components/common/ModalFooter';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { parseApiError } from '../../../../utils/apiError';
import { slugifyUnderscore } from '../../../../utils/validators';
import { EditIcon, DeleteIcon } from '../../../ConferenceDetail/icons';

const QUERY_KEY = ['training-location-types'];
const BASE_PATH = '/trainings/location-types';

// --- Modal form body --------------------------------------------------------

function LocationTypeForm({
  item,
  onSubmit,
  onClose,
  isLoading,
  error,
}: {
  item: TenantLocationType | null;
  onSubmit: (data: TenantLocationTypeCreate) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<TenantLocationTypeCreate>({
    name: '',
    slug: '',
    description: '',
    is_active: true,
  });

  useEffect(() => {
    setFormData({
      name: item?.name || '',
      slug: item?.slug || '',
      description: item?.description || '',
      is_active: item?.is_active ?? true,
    });
  }, [item]);

  const handleNameChange = (name: string) => {
    const updates: Partial<TenantLocationTypeCreate> = { name };
    if (!item) {
      updates.slug = slugifyUnderscore(name);
    }
    setFormData({ ...formData, ...updates });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
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
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Slug *
          </label>
          <input
            type="text"
            required
            pattern="^[a-z][a-z0-9_]*$"
            title="Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.slug}
            onChange={(e) =>
              setFormData({
                ...formData,
                slug: e.target.value.toLowerCase(),
              })
            }
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Lowercase letters, numbers, and underscores only. Must start with a letter.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <RichTextEditor
            value={formData.description || ''}
            onChange={(html) => setFormData({ ...formData, description: html })}
            rows={3}
          />
        </div>

        <div className="flex items-center">
          <input
            id="training-location-type-active"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.is_active ?? true}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          <label
            htmlFor="training-location-type-active"
            className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
          >
            Active
          </label>
        </div>
      </div>

      <ModalFooter onCancel={onClose} isLoading={isLoading} />
    </form>
  );
}

// --- Tab component ----------------------------------------------------------

export default function TrainingLocationTypesTab() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<TenantLocationType | null>(null);
  const [deleteItem, setDeleteItem] = useState<TenantLocationType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<{ items: TenantLocationType[]; total: number }>(BASE_PATH);
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (createData: TenantLocationTypeCreate) => {
      const response = await api.post<TenantLocationType>(BASE_PATH, createData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setModalOpen(false);
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data: updateData,
    }: {
      id: string;
      data: TenantLocationTypeUpdate;
    }) => {
      const response = await api.put<TenantLocationType>(`${BASE_PATH}/${id}`, updateData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setModalOpen(false);
      setEditItem(null);
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${BASE_PATH}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDeleteItem(null);
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleSubmit = (formData: TenantLocationTypeCreate) => {
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openCreate = () => {
    setEditItem(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (item: TenantLocationType) => {
    setEditItem(item);
    setError(null);
    setModalOpen(true);
  };

  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return <ErrorBanner message={parseApiError(queryError)} />;
  }

  const items = data?.items || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Location Types</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Define the types of locations available for trainings
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Add Type
        </button>
      </div>

      {/* Error */}
      <ErrorBanner message={error} />

      {/* Table or empty state */}
      {items.length === 0 ? (
        <EmptyState
          title="No location types"
          description="Create location types to categorize your training venues and rooms."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              Add Type
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
          <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Active
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((lt) => (
                <tr key={lt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {lt.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {lt.slug}
                  </td>
                  <td className="px-6 py-4">
                    <RichTextDisplay
                      content={lt.description}
                      truncate
                      className="text-sm text-gray-500 dark:text-gray-400 max-w-xs"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge isActive={lt.is_active} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {lt.usage_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-1">
                    <button
                      type="button"
                      onClick={() => openEdit(lt)}
                      className="inline-flex items-center p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                      title="Edit this location type"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteItem(lt)}
                      disabled={lt.usage_count > 0}
                      className={`inline-flex items-center p-1 ${
                        lt.usage_count > 0
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                      }`}
                      title={
                        lt.usage_count > 0
                          ? `Cannot delete: used by ${lt.usage_count} location(s)`
                          : 'Delete this location type'
                      }
                    >
                      <DeleteIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditItem(null);
          setError(null);
        }}
        title={editItem ? 'Edit Location Type' : 'New Location Type'}
      >
        <LocationTypeForm
          item={editItem}
          onSubmit={handleSubmit}
          onClose={() => {
            setModalOpen(false);
            setEditItem(null);
            setError(null);
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={error}
        />
      </Modal>

      {/* Delete Confirmation */}
      {deleteItem && (
        <ConfirmDialog
          open={!!deleteItem}
          title="Delete Location Type"
          message={`Are you sure you want to delete "${deleteItem.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteMutation.mutate(deleteItem.id)}
          onCancel={() => setDeleteItem(null)}
          variant="danger"
        />
      )}
    </div>
  );
}
