import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import NewPrivacyRequestModal from './NewPrivacyRequestModal';
import RejectPrivacyRequestModal from './RejectPrivacyRequestModal';
import PrivacyRequestDetailPanel from './PrivacyRequestDetailPanel';
import type {
  PrivacyRequest,
  PrivacyRequestListItem,
  PrivacyRequestListResponse,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from './types';

const STATUS_OPTIONS: { value: PrivacyRequestStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const TYPE_OPTIONS: { value: PrivacyRequestType | ''; label: string }[] = [
  { value: '', label: 'Any type' },
  { value: 'export', label: 'Export (Art. 15)' },
  { value: 'erasure', label: 'Erasure (Art. 17)' },
];

const STATUS_CHIP: Record<PrivacyRequestStatus, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  executing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  failed: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString();
}

export default function PrivacyRequestsTab() {
  const [status, setStatus] = useState<PrivacyRequestStatus | ''>('');
  const [requestType, setRequestType] = useState<PrivacyRequestType | ''>('');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<PrivacyRequest | null>(null);

  const listParams = useMemo(
    () => ({
      status: status || undefined,
      request_type: requestType || undefined,
      q: q || undefined,
    }),
    [status, requestType, q]
  );

  const { data, isLoading } = useQuery<PrivacyRequestListResponse>({
    queryKey: queryKeys.privacyRequests.list(listParams),
    queryFn: async () => {
      const res = await api.get<PrivacyRequestListResponse>('/privacy-requests', {
        params: listParams,
      });
      return res.data;
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label
              htmlFor="privacy-status-filter"
              className="block text-xs text-gray-500 dark:text-gray-400 mb-1"
            >
              Status
            </label>
            <select
              id="privacy-status-filter"
              value={status}
              onChange={(e) => setStatus(e.target.value as PrivacyRequestStatus | '')}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label
              htmlFor="privacy-type-filter"
              className="block text-xs text-gray-500 dark:text-gray-400 mb-1"
            >
              Request type
            </label>
            <select
              id="privacy-type-filter"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as PrivacyRequestType | '')}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label
              htmlFor="privacy-email-search"
              className="block text-xs text-gray-500 dark:text-gray-400 mb-1"
            >
              Subject email
            </label>
            <div className="flex gap-1">
              <input
                id="privacy-email-search"
                type="email"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQ(qDraft.trim().toLowerCase());
                }}
                placeholder="alice@example.com"
                className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setQ(qDraft.trim().toLowerCase())}
                className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Search
              </button>
              {q && (
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    setQDraft('');
                  }}
                  className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              New request
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-10 text-sm text-gray-500 dark:text-gray-400 text-center">
            Loading privacy requests…
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-sm text-gray-500 dark:text-gray-400 text-center">
            No privacy requests yet. Click "New request" to log the first one.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <Th>Status</Th>
                <Th>Type</Th>
                <Th>Subjects</Th>
                <Th>Created</Th>
                <Th>Reviewed</Th>
                <Th>Executed</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((row) => (
                <Row key={row.id} row={row} onSelect={() => setSelectedId(row.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <div className="mt-6">
          <PrivacyRequestDetailPanel
            requestId={selectedId}
            onClose={() => setSelectedId(null)}
            onRequestRejectClick={(req) => setRejectingRequest(req)}
          />
        </div>
      )}

      <NewPrivacyRequestModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={(req) => {
          setShowNewModal(false);
          setSelectedId(req.id);
        }}
      />
      <RejectPrivacyRequestModal
        request={rejectingRequest}
        onClose={() => setRejectingRequest(null)}
        onRejected={() => setRejectingRequest(null)}
      />
    </div>
  );

  function Th({ children }: { children: React.ReactNode }) {
    return (
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {children}
      </th>
    );
  }

  function Row({ row, onSelect }: { row: PrivacyRequestListItem; onSelect: () => void }) {
    return (
      <tr
        onClick={onSelect}
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_CHIP[row.status]}`}>
            {row.status.replace('_', ' ')}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 capitalize">
          {row.request_type}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.subject_count}</td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
          {formatDate(row.created_at)}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
          {row.reviewed_at ? formatDate(row.reviewed_at) : '—'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
          {row.executed_at ? formatDate(row.executed_at) : '—'}
        </td>
      </tr>
    );
  }
}
