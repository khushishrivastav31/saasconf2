import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  Conference,
  ScreenOverlay,
  ScreenOverlayCreate,
  ScreenOverlayUpdate,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { useErrorState } from '../../../../hooks/useErrorState';
import { useModalState } from '../../../../hooks/useModalState';
import { emptyForm } from '../../../../components/screen-overlays/constants';
import {
  OverlayForm,
  OverlayImageUpload,
} from '../../../../components/screen-overlays/OverlayForm';
import { OverlayCard } from '../../../../components/screen-overlays/OverlayCard';
import { OverlayPreviewModal } from '../../../../components/screen-overlays/OverlayPreviewModal';

function ScreenOverlaysTab({ conference, isAdmin }: { conference: Conference; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useErrorState();
  const deleteModal = useModalState<ScreenOverlay>();
  const previewModal = useModalState<ScreenOverlay>();
  const [createForm, setCreateForm] = useState<ScreenOverlayCreate>(emptyForm());
  const [editForm, setEditForm] = useState<ScreenOverlayUpdate>({});
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const pendingImagePreview = pendingImageFile ? URL.createObjectURL(pendingImageFile) : null;

  const queryKey = ['conference-screen-overlays', conference.id];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get<{ items: ScreenOverlay[]; total: number }>(
        `/conferences/${conference.id}/screen-overlays`
      );
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: ScreenOverlayCreate) => {
      const res = await api.post<ScreenOverlay>(
        `/conferences/${conference.id}/screen-overlays`,
        payload
      );
      return res.data;
    },
    onSuccess: async (newOverlay) => {
      if (pendingImageFile) {
        const formData = new FormData();
        formData.append('file', pendingImageFile);
        try {
          await api.post(
            `/conferences/${conference.id}/screen-overlays/${newOverlay.id}/image`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );
        } catch (err) {
          setError(parseApiError(err));
        }
        setPendingImageFile(null);
      }
      queryClient.invalidateQueries({ queryKey });
      setIsAdding(false);
      setCreateForm(emptyForm());
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: payload }: { id: string; data: ScreenOverlayUpdate }) => {
      const res = await api.put<ScreenOverlay>(
        `/conferences/${conference.id}/screen-overlays/${id}`,
        payload
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
      setEditForm({});
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/screen-overlays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      deleteModal.close();
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await api.put(`/conferences/${conference.id}/screen-overlays/${id}`, { is_active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => setError(parseApiError(err)),
  });

  const uploadImageMutation = useMutation({
    mutationFn: async ({ overlayId, file }: { overlayId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/conferences/${conference.id}/screen-overlays/${overlayId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteImageMutation = useMutation({
    mutationFn: async (overlayId: string) => {
      await api.delete(`/conferences/${conference.id}/screen-overlays/${overlayId}/image`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleCreate = () => {
    createMutation.mutate(createForm);
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, data: editForm });
  };

  const startEditing = (overlay: ScreenOverlay) => {
    setEditingId(overlay.id);
    setEditForm({
      trigger_type: overlay.trigger_type,
      title: overlay.title,
      body_text: overlay.body_text,
      animation_style: overlay.animation_style,
      duration_seconds: overlay.duration_seconds,
      is_active: overlay.is_active,
      schedule_date: overlay.schedule_date,
      display_order: overlay.display_order,
    });
    setIsAdding(false);
    setError(null);
  };

  const overlays = data?.items ?? [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Screen Overlays
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Full-screen overlays shown to portal users on login events.
          </p>
        </div>
        {isAdmin && !isAdding && !editingId && (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setCreateForm(emptyForm());
              setError(null);
            }}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            + Add Overlay
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Create form */}
      {isAdding && (
        <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            New Screen Overlay
          </h3>
          <OverlayForm
            form={createForm}
            onChange={(updates) => setCreateForm((prev) => ({ ...prev, ...updates }))}
          />
          <OverlayImageUpload
            imageUrl={null}
            localPreview={pendingImagePreview}
            onUpload={(file) => setPendingImageFile(file)}
            onDelete={() => setPendingImageFile(null)}
            isUploading={false}
            isDeleting={false}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => {
                setIsAdding(false);
                setPendingImageFile(null);
                setError(null);
              }}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!createForm.title.trim() || createMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Overlay'}
            </button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {editingId && (
        <div className="mb-6 border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/30">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Edit Screen Overlay
          </h3>
          <OverlayForm
            form={editForm as ScreenOverlayCreate}
            onChange={(updates) => setEditForm((prev) => ({ ...prev, ...updates }))}
          />
          <OverlayImageUpload
            imageUrl={overlays.find((o) => o.id === editingId)?.image_url ?? null}
            onUpload={(file) => uploadImageMutation.mutate({ overlayId: editingId, file })}
            onDelete={() => deleteImageMutation.mutate(editingId)}
            isUploading={uploadImageMutation.isPending}
            isDeleting={deleteImageMutation.isPending}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => {
                setEditingId(null);
                setError(null);
              }}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {overlays.length === 0 && !isAdding ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No screen overlays configured yet.</p>
          {isAdmin && <p className="text-xs mt-1">Click "Add Overlay" to create one.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Trigger
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Animation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Active
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {overlays.map((overlay) => (
                <OverlayCard
                  key={overlay.id}
                  overlay={overlay}
                  isAdmin={isAdmin}
                  onPreview={previewModal.open}
                  onEdit={startEditing}
                  onDelete={deleteModal.open}
                  onToggleActive={(id, is_active) => toggleActiveMutation.mutate({ id, is_active })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteModal.isOpen}
        title="Delete Screen Overlay"
        message={`Are you sure you want to delete the overlay "${deleteModal.target?.title}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteModal.target && deleteMutation.mutate(deleteModal.target.id)}
        onCancel={deleteModal.close}
      />

      {/* Preview portal */}
      {previewModal.isOpen && previewModal.target && (
        <OverlayPreviewModal overlay={previewModal.target} onDismiss={previewModal.close} />
      )}
    </div>
  );
}

export default ScreenOverlaysTab;
