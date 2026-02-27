import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Modal from '../../../../components/Modal';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import api from '../../../../config/api';

interface PaperPreviewItem {
  id: string;
  title: string;
  speaker_name: string;
}

interface PublishPreview {
  papers_to_accept: number;
  papers_to_reject: number;
  speakers_to_notify: number;
  already_published: boolean;
  accepted_papers: PaperPreviewItem[];
  rejected_papers: PaperPreviewItem[];
}

interface PublishResponse {
  papers_accepted: number;
  papers_rejected: number;
  notifications_sent: number;
  published_at: string;
}

interface PublishConfirmModalProps {
  open: boolean;
  onClose: () => void;
  conferenceId: string;
  isUpdate: boolean;
  onPublished: () => void;
}

export default function PublishConfirmModal({
  open,
  onClose,
  conferenceId,
  isUpdate,
  onPublished,
}: PublishConfirmModalProps) {
  const { showToast } = useToast();
  const [acceptedExpanded, setAcceptedExpanded] = useState(false);
  const [rejectedExpanded, setRejectedExpanded] = useState(false);

  // Reset expanded state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setAcceptedExpanded(false);
      setRejectedExpanded(false);
    }
  }, [open]);

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
  } = useQuery<PublishPreview>({
    queryKey: ['program-publish-preview', conferenceId],
    queryFn: async () => {
      const res = await api.get<PublishPreview>(
        `/conferences/${conferenceId}/program/publish/preview`
      );
      return res.data;
    },
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const publishMutation = useMutation<PublishResponse>({
    mutationFn: async () => {
      const endpoint = isUpdate
        ? `/conferences/${conferenceId}/program/update`
        : `/conferences/${conferenceId}/program/publish`;
      const res = await api.post<PublishResponse>(endpoint);
      return res.data;
    },
    onSuccess: (data) => {
      showToast(
        `Program ${isUpdate ? 'updated' : 'published'} successfully. ${data.notifications_sent} notification${data.notifications_sent === 1 ? '' : 's'} sent.`,
        'success'
      );
      onPublished();
      onClose();
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to publish program'), 'error');
    },
  });

  const handlePublish = () => {
    publishMutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isUpdate ? 'Update Published Program' : 'Publish Program'}
      size="max-w-lg"
    >
      <div className="px-6 py-4">
        {/* Loading state */}
        {previewLoading && (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-6 w-6 text-primary-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
              Loading preview...
            </span>
          </div>
        )}

        {/* Error state */}
        {previewError && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-4">
            <p className="text-sm text-red-700 dark:text-red-400">
              {parseApiError(previewError, 'Failed to load publish preview')}
            </p>
          </div>
        )}

        {/* Preview content */}
        {preview && (
          <div className="space-y-4">
            {/* Update warning banner */}
            {isUpdate && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-3 flex items-start gap-2">
                <svg
                  className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  This will update the previously published program. Only newly affected speakers
                  will be notified.
                </p>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <span>
                  <strong>{preview.papers_to_accept}</strong>{' '}
                  {preview.papers_to_accept === 1 ? 'paper' : 'papers'} will be accepted
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                <span>
                  <strong>{preview.papers_to_reject}</strong>{' '}
                  {preview.papers_to_reject === 1 ? 'paper' : 'papers'} will be rejected
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                <span>
                  <strong>{preview.speakers_to_notify}</strong>{' '}
                  {preview.speakers_to_notify === 1 ? 'speaker' : 'speakers'} will be notified
                </span>
              </div>
            </div>

            {/* Expandable sections */}
            {preview.accepted_papers.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAcceptedExpanded(!acceptedExpanded)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <span>Papers to Accept ({preview.accepted_papers.length})</span>
                  <svg
                    className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform ${acceptedExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {acceptedExpanded && (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {preview.accepted_papers.map((paper) => (
                      <li key={paper.id} className="px-4 py-2 flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                            {paper.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {paper.speaker_name}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {preview.rejected_papers.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRejectedExpanded(!rejectedExpanded)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <span>Papers to Reject ({preview.rejected_papers.length})</span>
                  <svg
                    className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform ${rejectedExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {rejectedExpanded && (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {preview.rejected_papers.map((paper) => (
                      <li key={paper.id} className="px-4 py-2 flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                            {paper.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {paper.speaker_name}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={publishMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!preview || previewLoading || publishMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {publishMutation.isPending && (
            <svg
              className="animate-spin h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {isUpdate ? 'Update Program' : 'Publish Program'}
        </button>
      </div>
    </Modal>
  );
}
