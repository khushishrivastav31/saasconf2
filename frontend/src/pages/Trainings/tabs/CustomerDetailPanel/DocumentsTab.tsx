import { useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';

interface Attachment {
  id: string;
  filename: string;
  file_size: number;
  content_type: string;
  created_at: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsTab({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ items: Attachment[] }>({
    queryKey: ['training-customers', customerId, 'documents'],
    queryFn: async () => {
      const res = await api.get(`/trainings/customers/${customerId}/attachments`);
      return res.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/trainings/customers/${customerId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers', customerId, 'documents'] });
      showToast('Document uploaded', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      await api.delete(`/trainings/customers/${customerId}/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers', customerId, 'documents'] });
      showToast('Document deleted', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const documents = useMemo(() => data?.items ?? [], [data]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Documents {documents.length > 0 && `(${documents.length})`}
        </h4>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading...' : '+ Upload Document'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-gray-400 text-sm">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          No documents uploaded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md"
            >
              <div>
                <a
                  href={`${api.defaults.baseURL}/trainings/customers/${customerId}/attachments/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {doc.filename}
                </a>
                <p className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(doc.id)}
                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
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
