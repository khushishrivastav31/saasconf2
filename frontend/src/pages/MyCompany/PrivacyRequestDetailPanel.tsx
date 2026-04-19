import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import { parseApiError } from '../../utils/apiError';
import { useToast } from '../../components/Toast';
import type { GenerateExportResponse, PrivacyRequest, PrivacyRequestStatus } from './types';

const STATUS_STYLES: Record<PrivacyRequestStatus, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  executing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  failed: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const DEADLINE_WARN_DAYS = 21;

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString();
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

export default function PrivacyRequestDetailPanel({
  requestId,
  onClose,
  onRequestRejectClick,
}: {
  requestId: string;
  onClose: () => void;
  onRequestRejectClick: (request: PrivacyRequest) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, error } = useQuery<PrivacyRequest>({
    queryKey: queryKeys.privacyRequests.detail(requestId),
    queryFn: async () => {
      const res = await api.get<PrivacyRequest>(`/privacy-requests/${requestId}`);
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<PrivacyRequest>(`/privacy-requests/${requestId}/approve`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.privacyRequests.all });
      showToast('Erasure approved (queued for Phase 3)', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<GenerateExportResponse>(
        `/privacy-requests/${requestId}/generate-export`
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.privacyRequests.all });
      showToast('Export generated. You can now download the ZIP.', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const res = await api.get(`/privacy-requests/${requestId}/download`, {
        responseType: 'arraybuffer',
      });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privacy-request-${requestId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(parseApiError(err), 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading request…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-red-600 dark:text-red-400">Failed to load the request.</div>
    );
  }

  const createdDays = daysSince(data.created_at);
  const showDeadlineWarn = data.status === 'pending_review' && createdDays >= DEADLINE_WARN_DAYS;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 capitalize">
              {data.request_type === 'export' ? 'Access / export request' : 'Erasure request'}
            </h3>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_STYLES[data.status]}`}
            >
              {data.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ID: {data.id}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="px-6 py-4 space-y-5">
        {showDeadlineWarn && (
          <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-100">
            This request is {createdDays} days old. Art. 12(3) gives you one month to respond.
          </div>
        )}

        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Subject emails
          </h4>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            {data.subject_emails.map((email) => (
              <li key={email} className="font-mono">
                {email}
              </li>
            ))}
          </ul>
        </section>

        {data.notes && (
          <section>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Notes</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {data.notes}
            </p>
          </section>
        )}

        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Timeline</h4>
          <dl className="text-sm grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="text-gray-500 dark:text-gray-400">Created</dt>
            <dd className="text-gray-900 dark:text-gray-100">{fmt(data.created_at)}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Reviewed</dt>
            <dd className="text-gray-900 dark:text-gray-100">{fmt(data.reviewed_at)}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Executed</dt>
            <dd className="text-gray-900 dark:text-gray-100">{fmt(data.executed_at)}</dd>
          </dl>
        </section>

        {data.rejection_reason && (
          <section>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Rejection reason
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {data.rejection_reason}
            </p>
          </section>
        )}

        {data.execution_manifest && (
          <section>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Export manifest
            </h4>
            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto text-gray-700 dark:text-gray-300">
              {JSON.stringify(data.execution_manifest.record_counts ?? {}, null, 2)}
            </pre>
          </section>
        )}
      </div>

      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-wrap gap-2 justify-end">
        {data.status === 'pending_review' && data.request_type === 'erasure' && (
          <button
            type="button"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {approveMutation.isPending ? 'Approving…' : 'Approve erasure'}
          </button>
        )}
        {data.status === 'pending_review' && data.request_type === 'export' && (
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate export'}
          </button>
        )}
        {data.status === 'pending_review' && (
          <button
            type="button"
            onClick={() => onRequestRejectClick(data)}
            className="px-4 py-2 text-sm text-red-700 dark:text-red-300 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            Reject
          </button>
        )}
        {data.status === 'completed' && data.request_type === 'export' && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {downloading ? 'Downloading…' : 'Download ZIP'}
          </button>
        )}
      </div>
    </div>
  );
}
