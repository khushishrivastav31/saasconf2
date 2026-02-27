import { useState, useRef } from 'react';
import type { AxiosInstance } from 'axios';

export interface StagedAttachment {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MessageFileAttachProps {
  apiClient: AxiosInstance;
  uploadPath: string;
  attachments: StagedAttachment[];
  onAttachmentsChange: (attachments: StagedAttachment[]) => void;
}

export default function MessageFileAttach({
  apiClient,
  uploadPath,
  attachments,
  onAttachmentsChange,
}: MessageFileAttachProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await apiClient.post(uploadPath, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onAttachmentsChange([
        ...attachments,
        {
          id: resp.data.id,
          filename: resp.data.filename,
          content_type: resp.data.content_type,
          file_size: resp.data.file_size,
        },
      ]);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
            'Upload failed'
          : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  return (
    <div>
      {/* Attach button */}
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
          {uploading ? 'Uploading...' : 'Attach file'}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </label>
        {uploading && (
          <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 rounded-full animate-spin" />
        )}
      </div>

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {/* Staged files */}
      {attachments.length > 0 && (
        <div className="mt-2 space-y-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 rounded"
            >
              <svg
                className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="truncate flex-1">{a.filename}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {formatFileSize(a.file_size)}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                className="text-gray-400 dark:text-gray-500 hover:text-red-500 flex-shrink-0"
                title="Remove"
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
