/**
 * Training Files Section
 *
 * Upload, list, download, and delete file attachments for a training.
 * Uses the polymorphic attachments API with entity_type="training".
 */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { parseApiError } from '../../../../utils/apiError';
import { useToast } from '../../../../components/Toast';

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
  description: string | null;
  created_at: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string): string {
  if (contentType.startsWith('image/')) return '🖼';
  if (contentType === 'application/pdf') return '📄';
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return '📊';
  if (contentType.includes('word') || contentType.includes('document')) return '📝';
  if (contentType.includes('zip') || contentType.includes('archive')) return '📦';
  return '📎';
}

interface TrainingFilesSectionProps {
  trainingId: string;
}

export default function TrainingFilesSection({ trainingId }: TrainingFilesSectionProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);

  const queryKey = ['attachments', 'training', trainingId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get('/attachments', {
        params: { entity_type: 'training', entity_id: trainingId },
      });
      return res.data as { items: Attachment[]; total: number };
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'training');
      formData.append('entity_id', trainingId);
      await api.post('/attachments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      showToast('File uploaded', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      showToast('File deleted', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      uploadMutation.mutate(file);
      e.target.value = '';
    },
    [uploadMutation]
  );

  const handleDownload = useCallback(
    async (id: string, filename: string) => {
      try {
        const res = await api.get(`/attachments/${id}/download`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        showToast('Download failed', 'error');
      }
    },
    [showToast]
  );

  const files = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Files ({files.length})
        </h4>
        <label className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/30 cursor-pointer transition-colors">
          {uploading ? 'Uploading...' : '+ Upload File'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-sm text-gray-400">Loading...</div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
          No files uploaded yet.
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-lg shrink-0">{fileIcon(file.content_type)}</span>
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => handleDownload(file.id, file.filename)}
                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline truncate block"
                >
                  {file.filename}
                </button>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatFileSize(file.file_size)} ·{' '}
                  {new Date(file.created_at).toLocaleDateString('de-DE')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(file.id)}
                disabled={deleteMutation.isPending}
                className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
                title="Delete file"
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
          ))}
        </div>
      )}
    </div>
  );
}
