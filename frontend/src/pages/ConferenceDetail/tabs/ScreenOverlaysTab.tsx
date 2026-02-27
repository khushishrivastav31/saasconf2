import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import type {
  Conference,
  ScreenOverlay,
  ScreenOverlayCreate,
  ScreenOverlayUpdate,
  OverlayTriggerType,
  OverlayAnimationStyle,
} from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import RichTextEditor from '../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../components/common/RichTextDisplay';
import { stripHtml } from '../../../utils/richText';
import { EyeIcon, EditIcon, DeleteIcon } from '../icons';

const TRIGGER_OPTIONS: { value: OverlayTriggerType; label: string }[] = [
  { value: 'first_registration', label: 'First Registration' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'always', label: 'Always' },
];

const ANIMATION_OPTIONS: { value: OverlayAnimationStyle; label: string }[] = [
  { value: 'confetti', label: 'Confetti' },
  { value: 'fireworks', label: 'Fireworks' },
  { value: 'balloons', label: 'Balloons' },
  { value: 'sparkle', label: 'Sparkle' },
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'snow', label: 'Snow' },
  { value: 'stars', label: 'Stars' },
];

const triggerBadgeClass: Record<OverlayTriggerType, string> = {
  first_registration: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  scheduled: 'bg-purple-100 text-purple-800',
  always: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
};

function emptyForm(): ScreenOverlayCreate {
  return {
    trigger_type: 'first_registration',
    title: '',
    body_text: '',
    animation_style: 'confetti',
    duration_seconds: 5,
    is_active: false,
    schedule_date: undefined,
    display_order: 0,
  };
}

function ScreenOverlaysTab({ conference, isAdmin }: { conference: Conference; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScreenOverlay | null>(null);
  const [createForm, setCreateForm] = useState<ScreenOverlayCreate>(emptyForm());
  const [editForm, setEditForm] = useState<ScreenOverlayUpdate>({});
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [previewOverlay, setPreviewOverlay] = useState<ScreenOverlay | null>(null);
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
      setDeleteTarget(null);
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
                <tr key={overlay.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    <div className="flex items-center gap-2">
                      {overlay.image_url && (
                        <img
                          src={`${api.defaults.baseURL}${overlay.image_url}`}
                          alt=""
                          className="w-10 h-10 rounded object-cover shrink-0"
                        />
                      )}
                      <div>
                        <div className="font-medium">{overlay.title}</div>
                        {overlay.body_text && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                            {stripHtml(overlay.body_text)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        triggerBadgeClass[overlay.trigger_type]
                      }`}
                    >
                      {overlay.trigger_type.replace('_', ' ')}
                    </span>
                    {overlay.trigger_type === 'scheduled' && overlay.schedule_date && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date(overlay.schedule_date).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">
                    {overlay.animation_style}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {overlay.duration_seconds}s
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {overlay.display_order}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        isAdmin &&
                        toggleActiveMutation.mutate({
                          id: overlay.id,
                          is_active: !overlay.is_active,
                        })
                      }
                      disabled={!isAdmin}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        overlay.is_active ? 'bg-primary-600' : 'bg-gray-300'
                      } ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
                          overlay.is_active ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setPreviewOverlay(overlay)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 rounded"
                          title="Preview"
                        >
                          <EyeIcon />
                        </button>
                        <button
                          onClick={() => startEditing(overlay)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 rounded"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(overlay)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 rounded"
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
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Screen Overlay"
        message={`Are you sure you want to delete the overlay "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Preview portal */}
      {previewOverlay && (
        <OverlayPreview overlay={previewOverlay} onDismiss={() => setPreviewOverlay(null)} />
      )}
    </div>
  );
}

function OverlayImageUpload({
  imageUrl,
  localPreview,
  onUpload,
  onDelete,
  isUploading,
  isDeleting,
}: {
  imageUrl: string | null;
  localPreview?: string | null;
  onUpload: (file: File) => void;
  onDelete: () => void;
  isUploading: boolean;
  isDeleting: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewSrc = imageUrl ? `${api.defaults.baseURL}${imageUrl}` : localPreview || null;
  const hasImage = !!imageUrl || !!localPreview;

  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Overlay Image
      </label>
      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="w-32 h-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
          {previewSrc ? (
            <img src={previewSrc} alt="Overlay" className="w-full h-full object-contain" />
          ) : (
            <svg
              className="w-8 h-8 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 disabled:opacity-50"
          >
            {isUploading ? 'Uploading...' : hasImage ? 'Replace Image' : 'Upload Image'}
          </button>
          {hasImage && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              {isDeleting ? 'Removing...' : 'Remove Image'}
            </button>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            JPEG, PNG, WebP, or GIF. Max 10 MB.
          </p>
        </div>
      </div>
    </div>
  );
}

function OverlayForm({
  form,
  onChange,
}: {
  form: ScreenOverlayCreate;
  onChange: (updates: Partial<ScreenOverlayCreate>) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Title */}
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Welcome to {conference_name}!"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Use {'{conference_name}'} to insert the conference name.
        </p>
      </div>

      {/* Body Text */}
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Body Text (optional)
        </label>
        <RichTextEditor
          value={form.body_text || ''}
          onChange={(html) => onChange({ body_text: html || undefined })}
          placeholder="Thank you for registering..."
          rows={2}
        />
      </div>

      {/* Trigger Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Trigger
        </label>
        <select
          value={form.trigger_type}
          onChange={(e) => onChange({ trigger_type: e.target.value as OverlayTriggerType })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          {TRIGGER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Animation Style */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Animation
        </label>
        <select
          value={form.animation_style}
          onChange={(e) => onChange({ animation_style: e.target.value as OverlayAnimationStyle })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          {ANIMATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Duration (seconds)
        </label>
        <input
          type="number"
          min={1}
          max={30}
          value={form.duration_seconds}
          onChange={(e) => onChange({ duration_seconds: parseInt(e.target.value) || 5 })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Display Order */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Display Order
        </label>
        <input
          type="number"
          min={0}
          value={form.display_order}
          onChange={(e) => onChange({ display_order: parseInt(e.target.value) || 0 })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Schedule Date (only for scheduled trigger) */}
      {form.trigger_type === 'scheduled' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Schedule Date
          </label>
          <input
            type="datetime-local"
            value={form.schedule_date ? form.schedule_date.slice(0, 16) : ''}
            onChange={(e) =>
              onChange({
                schedule_date: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      )}

      {/* Active checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="overlay-active"
          checked={form.is_active ?? false}
          onChange={(e) => onChange({ is_active: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="overlay-active" className="text-sm text-gray-700 dark:text-gray-300">
          Active
        </label>
      </div>
    </div>
  );
}

function OverlayPreview({ overlay, onDismiss }: { overlay: ScreenOverlay; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onDismiss(), 300);
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;

    const duration = overlay.duration_seconds * 1000;
    const interval = 50;
    const step = (interval / duration) * 100;
    let remaining = 100;

    const timer = setInterval(() => {
      remaining -= step;
      setProgress(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timer);
        handleDismiss();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [visible, overlay.duration_seconds, handleDismiss]);

  const imageUrl = overlay.image_url ? `${api.defaults.baseURL}${overlay.image_url}` : null;

  return createPortal(
    <div
      className={`fixed inset-0 z-9999 flex items-center justify-center transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Preview badge */}
      <div className="absolute top-4 left-4 z-20 px-3 py-1.5 bg-yellow-400 text-yellow-900 text-xs font-semibold rounded-full shadow-lg">
        PREVIEW
      </div>

      {/* Animation layer */}
      <PreviewAnimationEffect
        style={overlay.animation_style}
        durationSeconds={overlay.duration_seconds}
      />

      {/* Content card */}
      <div
        className={`relative z-10 max-w-lg w-full mx-4 p-8 text-center ${getPreviewAnimationClass(
          overlay.animation_style,
          visible
        )}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-white/60 hover:text-white rounded-full hover:bg-white/10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {imageUrl && (
          <img src={imageUrl} alt="" className="w-full max-h-48 object-contain rounded-lg mb-4" />
        )}

        {overlay.body_text && (
          <RichTextDisplay
            content={overlay.body_text}
            className="text-white/80 prose-invert mb-4"
          />
        )}

        {/* Progress bar */}
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mt-4">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-50"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function getPreviewAnimationClass(_style: string, visible: boolean): string {
  if (!visible) return 'opacity-0 scale-95';
  return 'animate-overlay-fade';
}

function PreviewAnimationEffect({
  style,
  durationSeconds,
}: {
  style: string;
  durationSeconds: number;
}) {
  switch (style) {
    case 'confetti':
      return <PreviewConfettiEffect durationSeconds={durationSeconds} />;
    case 'fireworks':
      return <PreviewFireworksEffect durationSeconds={durationSeconds} />;
    case 'balloons':
      return <PreviewBalloonsEffect durationSeconds={durationSeconds} />;
    case 'sparkle':
      return <PreviewSparkleEffect durationSeconds={durationSeconds} />;
    case 'spotlight':
      return <PreviewSpotlightEffect durationSeconds={durationSeconds} />;
    case 'snow':
      return <PreviewSnowEffect durationSeconds={durationSeconds} />;
    case 'stars':
      return <PreviewStarsEffect durationSeconds={durationSeconds} />;
    default:
      return null;
  }
}

type PreviewEffectProps = { durationSeconds: number };

function PreviewConfettiEffect({ durationSeconds }: PreviewEffectProps) {
  const pieces = Array.from({ length: 30 }, (_, i) => {
    const colors = [
      '#ff3b6f',
      '#ffe63b',
      '#3bff8a',
      '#3bc5ff',
      '#c77dff',
      '#ff6fb4',
      '#ff9f1c',
      '#00f5d4',
    ];
    const color = colors[i % colors.length];
    const left = `${Math.random() * 100}%`;
    const delay = `${Math.random() * durationSeconds * 0.5}s`;
    const duration = `${durationSeconds * (0.4 + Math.random() * 0.3)}s`;
    const size = 6 + Math.random() * 6;
    return (
      <div
        key={i}
        className="absolute rounded-sm"
        style={{
          left,
          top: '-10px',
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          opacity: 0.9,
          animation: `pv-confetti-fall ${duration} ease-in ${delay} forwards`,
        }}
      />
    );
  });
  return (
    <>
      <style>{`
        @keyframes pv-confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{pieces}</div>
    </>
  );
}

function PreviewFireworksEffect({ durationSeconds }: PreviewEffectProps) {
  const burstDuration = Math.max(1, durationSeconds / 3);
  const burstSpacing = (durationSeconds * 0.8) / 7;
  const bursts = Array.from({ length: 8 }, (_, i) => {
    const left = 15 + Math.random() * 70;
    const top = 10 + Math.random() * 50;
    const delay = i * burstSpacing;
    const colors = [
      '#ff3b6f',
      '#ffe63b',
      '#3bff8a',
      '#3bc5ff',
      '#c77dff',
      '#ff6fb4',
      '#ff9f1c',
      '#00f5d4',
    ];
    const color = colors[i % colors.length];
    return (
      <div key={i} className="absolute" style={{ left: `${left}%`, top: `${top}%` }}>
        {Array.from({ length: 12 }, (_, j) => {
          const angle = (j / 12) * 360;
          const rad = (angle * Math.PI) / 180;
          const dist = 40 + Math.random() * 40;
          const tx = Math.cos(rad) * dist;
          const ty = Math.sin(rad) * dist;
          return (
            <div
              key={j}
              className="absolute w-2 h-2 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 10px 3px ${color}`,
                animation: `pv-fw-burst-${i} ${burstDuration}s ease-out ${delay}s forwards`,
                ['--tx' as string]: `${tx}px`,
                ['--ty' as string]: `${ty}px`,
              }}
            />
          );
        })}
      </div>
    );
  });
  const keyframes = Array.from(
    { length: 8 },
    (_, i) => `
    @keyframes pv-fw-burst-${i} {
      0% { transform: translate(0, 0) scale(0); opacity: 1; }
      20% { opacity: 1; transform: scale(1.2); }
      100% { transform: translate(var(--tx), var(--ty)) scale(0.3); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{bursts}</div>
    </>
  );
}

function PreviewBalloonsEffect({ durationSeconds }: PreviewEffectProps) {
  const balloonColors = [
    '#ff3b6f',
    '#3bc5ff',
    '#3bff8a',
    '#ffe63b',
    '#c77dff',
    '#ff6fb4',
    '#ff9f1c',
    '#00f5d4',
  ];
  const balloons = Array.from({ length: 15 }, (_, i) => {
    const color = balloonColors[i % balloonColors.length];
    const left = 5 + Math.random() * 90;
    const size = 24 + Math.random() * 20;
    const delay = Math.random() * durationSeconds * 0.5;
    const riseDuration = durationSeconds * (0.5 + Math.random() * 0.3);
    const sway = -30 + Math.random() * 60;
    return (
      <div
        key={i}
        className="absolute"
        style={{
          left: `${left}%`,
          bottom: '-60px',
          animation: `pv-balloon-rise-${i} ${riseDuration}s ease-out ${delay}s forwards`,
          ['--sway' as string]: `${sway}px`,
        }}
      >
        <div
          style={{
            width: `${size}px`,
            height: `${size * 1.2}px`,
            backgroundColor: color,
            borderRadius: '50%',
            position: 'relative',
            boxShadow: `inset -${size / 6}px -${size / 6}px ${size / 3}px rgba(0,0,0,0.15), 0 0 ${size / 2}px ${color}40`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: `8px solid ${color}`,
            }}
          />
        </div>
        <div
          style={{
            width: '1px',
            height: '20px',
            backgroundColor: 'rgba(255,255,255,0.4)',
            margin: '0 auto',
          }}
        />
      </div>
    );
  });
  const keyframes = Array.from(
    { length: 15 },
    (_, i) => `
    @keyframes pv-balloon-rise-${i} {
      0% { transform: translateY(0) translateX(0); opacity: 0.9; }
      25% { transform: translateY(-30vh) translateX(var(--sway)); }
      50% { transform: translateY(-60vh) translateX(calc(var(--sway) * -0.5)); }
      75% { transform: translateY(-90vh) translateX(var(--sway)); }
      100% { transform: translateY(-120vh) translateX(0); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{balloons}</div>
    </>
  );
}

function PreviewSparkleEffect({ durationSeconds: _durationSeconds }: PreviewEffectProps) {
  const sparkleColors = [
    '#ffe63b',
    '#ff6fb4',
    '#3bff8a',
    '#3bc5ff',
    '#c77dff',
    '#00f5d4',
    '#ff3b6f',
    '#ffffff',
  ];
  const sparkles = Array.from({ length: 25 }, (_, i) => {
    const color = sparkleColors[i % sparkleColors.length];
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const size = 3 + Math.random() * 5;
    const animDuration = 0.8 + Math.random() * 1.2;
    const delay = Math.random() * 2;
    return (
      <div
        key={i}
        className="absolute rounded-full"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          boxShadow: `0 0 ${size * 2}px ${size}px ${color}80`,
          animation: `pv-sparkle-twinkle ${animDuration}s ease-in-out ${delay}s infinite`,
        }}
      />
    );
  });
  return (
    <>
      <style>{`
        @keyframes pv-sparkle-twinkle {
          0%, 100% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{sparkles}</div>
    </>
  );
}

function PreviewSpotlightEffect({ durationSeconds }: PreviewEffectProps) {
  const rotationDuration = Math.max(2, durationSeconds / 2);
  const beams = Array.from({ length: 3 }, (_, i) => {
    const offset = i * 120;
    const speed = rotationDuration * (0.8 + i * 0.2);
    return (
      <div
        key={i}
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: '200vmax',
          height: '200vmax',
          marginLeft: '-100vmax',
          marginTop: '-100vmax',
          background: `conic-gradient(from ${offset}deg, transparent 0deg, ${
            i === 0
              ? 'rgba(255,99,111,0.12)'
              : i === 1
                ? 'rgba(59,197,255,0.12)'
                : 'rgba(199,125,255,0.12)'
          } 10deg, ${
            i === 0
              ? 'rgba(255,99,111,0.25)'
              : i === 1
                ? 'rgba(59,197,255,0.25)'
                : 'rgba(199,125,255,0.25)'
          } 15deg, ${
            i === 0
              ? 'rgba(255,99,111,0.12)'
              : i === 1
                ? 'rgba(59,197,255,0.12)'
                : 'rgba(199,125,255,0.12)'
          } 20deg, transparent 30deg, transparent 360deg)`,
          animation: `pv-spotlight-sweep ${speed}s linear infinite`,
        }}
      />
    );
  });
  return (
    <>
      <style>{`
        @keyframes pv-spotlight-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{beams}</div>
    </>
  );
}

function PreviewSnowEffect({ durationSeconds }: PreviewEffectProps) {
  const flakes = Array.from({ length: 35 }, (_, i) => {
    const left = Math.random() * 100;
    const size = 2 + Math.random() * 4;
    const delay = Math.random() * durationSeconds * 0.5;
    const fallDuration = durationSeconds * (0.6 + Math.random() * 0.3);
    const drift = -30 + Math.random() * 60;
    const opacity = 0.5 + Math.random() * 0.4;
    return (
      <div
        key={i}
        className="absolute rounded-full"
        style={{
          left: `${left}%`,
          top: '-10px',
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: ['#e0f2ff', '#f0e6ff', '#ffe0f0', '#ffffff'][i % 4],
          opacity,
          boxShadow: `0 0 ${size * 2}px ${size}px rgba(255,255,255,0.2)`,
          animation: `pv-snow-fall-${i} ${fallDuration}s linear ${delay}s forwards`,
          ['--drift' as string]: `${drift}px`,
        }}
      />
    );
  });
  const keyframes = Array.from(
    { length: 35 },
    (_, i) => `
    @keyframes pv-snow-fall-${i} {
      0% { transform: translateY(0) translateX(0); }
      25% { transform: translateY(25vh) translateX(var(--drift)); }
      50% { transform: translateY(50vh) translateX(calc(var(--drift) * -0.5)); }
      75% { transform: translateY(75vh) translateX(var(--drift)); }
      100% { transform: translateY(105vh) translateX(0); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{flakes}</div>
    </>
  );
}

function PreviewStarsEffect({ durationSeconds }: PreviewEffectProps) {
  const starColors = [
    '#ffe63b',
    '#ff6fb4',
    '#3bff8a',
    '#3bc5ff',
    '#c77dff',
    '#ff3b6f',
    '#00f5d4',
    '#ffffff',
  ];
  const stars = Array.from({ length: 20 }, (_, i) => {
    const color = starColors[i % starColors.length];
    const angle = (i / 20) * 360 + Math.random() * 18;
    const rad = (angle * Math.PI) / 180;
    const dist = 30 + Math.random() * 40;
    const tx = Math.cos(rad) * dist;
    const ty = Math.sin(rad) * dist;
    const delay = (i / 20) * durationSeconds * 0.7;
    const flightDuration = durationSeconds * (0.4 + Math.random() * 0.2);
    const size = 4 + Math.random() * 4;
    return (
      <div
        key={i}
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: `${size}px`,
          height: `${size}px`,
          animation: `pv-star-radiate-${i} ${flightDuration}s ease-out ${delay}s forwards`,
          ['--tx' as string]: `${tx}vw`,
          ['--ty' as string]: `${ty}vh`,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: color,
            boxShadow: `0 0 ${size * 3}px ${size}px ${color}80`,
            clipPath:
              'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
          }}
        />
      </div>
    );
  });
  const keyframes = Array.from(
    { length: 20 },
    (_, i) => `
    @keyframes pv-star-radiate-${i} {
      0% { transform: translate(0, 0) scale(0); opacity: 1; }
      30% { transform: translate(calc(var(--tx) * 0.3), calc(var(--ty) * 0.3)) scale(1.5); opacity: 1; }
      100% { transform: translate(var(--tx), var(--ty)) scale(0.5); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{stars}</div>
    </>
  );
}

export default ScreenOverlaysTab;
