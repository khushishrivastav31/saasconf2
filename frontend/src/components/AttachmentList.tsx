import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../config/api';
import { queryKeys } from '../config/queryKeys';
import { formatDate } from '../utils/formatDate';
import ConfirmDialog from './ConfirmDialog';
import type { Attachment } from '../types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentList({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.attachments.list(entityType, entityId),
    queryFn: async () => {
      const response = await api.get<{ items: Attachment[]; total: number }>(
        `/attachments?entity_type=${entityType}&entity_id=${entityId}`
      );
      return response.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', entityType);
      formData.append('entity_id', entityId);
      if (description.trim()) {
        formData.append('description', description.trim());
      }
      const response = await api.post<Attachment>('/attachments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.attachments.list(entityType, entityId),
      });
      setDescription('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.attachments.list(entityType, entityId),
      });
    },
  });

  const handleDownload = async (attachment: Attachment) => {
    const response = await api.get(`/attachments/${attachment.id}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', attachment.filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Attachments</h4>

      {/* Upload form */}
      <div className="flex items-end gap-2 mb-3">
        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
        </div>
        <input
          type="text"
          placeholder="Description (optional)"
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm w-48 dark:bg-gray-800 dark:text-gray-100"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploadMutation.isPending}
          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {uploadMutation.isError && (
        <div className="mb-2 text-sm text-red-600">Upload failed. Please try again.</div>
      )}

      {/* Attachment list */}
      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading attachments...</div>
      ) : data?.items && data.items.length > 0 ? (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {data.items.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {attachment.filename}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(attachment.file_size)}
                  {attachment.description && ` - ${attachment.description}`}
                  {' - '}
                  {formatDate(attachment.created_at)}
                </p>
              </div>
              <div className="flex gap-2 ml-3">
                <button
                  type="button"
                  onClick={() => handleDownload(attachment)}
                  className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(attachment)}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">No attachments yet.</p>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Attachment"
        message={`Are you sure you want to delete "${deleteTarget?.filename}"? This action cannot be undone.`}
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
