import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  getPortalAccessToken,
  trainingPortalApi,
} from '../../pages/TrainingPortal/trainingPortalApi';
import { queryKeys } from '../../config/queryKeys';
import { parseApiError } from '../../utils/apiError';
import { useToast } from '../Toast';
import type {
  PortalExportCreateResponse,
  PortalPrivacyRequestListResponse,
  PortalPrivacyRequestResponse,
  PrivacyRequestStatus,
} from '../../pages/MyCompany/types';

const STATUS_LABEL: Record<PrivacyRequestStatus, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  executing: 'Executing',
  completed: 'Completed',
  failed: 'Failed',
};

const STATUS_CLASSES: Record<PrivacyRequestStatus, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  rejected: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  executing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function downloadExportZip(url: string, filename: string): Promise<void> {
  const token = getPortalAccessToken();
  const base = trainingPortalApi.defaults.baseURL?.replace(/\/api\/v1$/, '') ?? '';
  const resp = await fetch(`${base}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) {
    throw new AxiosError(`Download failed (${resp.status})`);
  }
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

const PrivacyMyDataPanel = React.memo(function PrivacyMyDataPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [confirmErase, setConfirmErase] = useState(false);
  const [eraseReason, setEraseReason] = useState('');

  const listQuery = useQuery<PortalPrivacyRequestListResponse>({
    queryKey: queryKeys.portalPrivacyRequests.list(1, 50),
    queryFn: async () => {
      const res = await trainingPortalApi.get<PortalPrivacyRequestListResponse>(
        '/portal/me/privacy-requests',
        { params: { page: 1, page_size: 50 } }
      );
      return res.data;
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await trainingPortalApi.post<PortalExportCreateResponse>(
        '/portal/me/privacy-requests',
        { request_type: 'export' }
      );
      return res.data;
    },
    onSuccess: async (data) => {
      try {
        await downloadExportZip(data.download_url, `my-data-export-${data.id}.zip`);
        showToast('Your data export is ready', 'success');
      } catch (err) {
        showToast(parseApiError(err), 'error');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.portalPrivacyRequests.all });
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const erasureMutation = useMutation({
    mutationFn: async () => {
      const res = await trainingPortalApi.post<PortalPrivacyRequestResponse>(
        '/portal/me/privacy-requests',
        {
          request_type: 'erasure',
          notes: eraseReason.trim() || null,
        }
      );
      return res.data;
    },
    onSuccess: () => {
      showToast('Deletion request submitted for review', 'success');
      setConfirmErase(false);
      setEraseReason('');
      queryClient.invalidateQueries({ queryKey: queryKeys.portalPrivacyRequests.all });
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const redownload = async (pr: PortalPrivacyRequestResponse) => {
    if (!pr.completion_artifact_url) return;
    try {
      await downloadExportZip(pr.completion_artifact_url, `my-data-export-${pr.id}.zip`);
    } catch (err) {
      showToast(parseApiError(err), 'error');
    }
  };

  const requests = listQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Download a copy of your data
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Export every piece of personal data the organizer holds about you — trainings, invoices,
          registrations, alumni records, audit events — as a machine-readable ZIP of JSON files.
          Internal staff annotations and payment-processor identifiers are omitted.
        </p>
        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="mt-4 inline-flex min-h-[44px] items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {exportMutation.isPending ? 'Preparing your export…' : 'Download my data'}
        </button>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Request deletion of your data
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          The organizer reviews each deletion request before executing it. Paid invoices must be
          retained under German tax law (HGB §257) for up to 10 years — the organizer will explain
          which records must stay.
        </p>
        {!confirmErase ? (
          <button
            type="button"
            onClick={() => setConfirmErase(true)}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            Request deletion
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <label
              htmlFor="erase-reason"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Reason (optional)
            </label>
            <textarea
              id="erase-reason"
              value={eraseReason}
              onChange={(e) => setEraseReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Let the organizer know why you want your data deleted."
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => erasureMutation.mutate()}
                disabled={erasureMutation.isPending}
                className="inline-flex min-h-[44px] items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {erasureMutation.isPending ? 'Submitting…' : 'Submit deletion request'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmErase(false);
                  setEraseReason('');
                }}
                className="inline-flex min-h-[44px] items-center rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 p-6 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My requests</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Every export or deletion request you filed. Exports stay downloadable for 7 days.
          </p>
        </div>
        {listQuery.isLoading ? (
          <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
        ) : listQuery.isError ? (
          <div className="p-6 text-sm text-red-600 dark:text-red-400">
            Could not load your requests. Please try again.
          </div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
            You have not filed any requests yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {requests.map((pr) => (
              <li key={pr.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {pr.request_type === 'export' ? 'Data export' : 'Deletion request'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Created {formatDate(pr.created_at)}
                    {pr.executed_at ? ` · Completed ${formatDate(pr.executed_at)}` : ''}
                  </p>
                  {pr.rejection_reason && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {pr.rejection_reason}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_CLASSES[pr.status]
                  }`}
                >
                  {STATUS_LABEL[pr.status]}
                </span>
                {pr.request_type === 'export' &&
                  pr.status === 'completed' &&
                  pr.completion_artifact_url && (
                    <button
                      type="button"
                      onClick={() => redownload(pr)}
                      className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      Download again
                    </button>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
});

export default PrivacyMyDataPanel;
