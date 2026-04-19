import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/Modal';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import { parseApiError } from '../../utils/apiError';
import { useToast } from '../../components/Toast';
import type {
  ErasureAction,
  ErasureExecuteResponse,
  ErasurePreviewResponse,
  PrivacyRequest,
} from './types';

const CONFIRM_PHRASE = 'ERASE';

const ACTION_STYLES: Record<ErasureAction, string> = {
  delete: 'text-red-700 dark:text-red-300',
  anonymize: 'text-amber-700 dark:text-amber-300',
  skip: 'text-gray-500 dark:text-gray-400',
};

const ACTION_LABEL: Record<ErasureAction, string> = {
  delete: 'Delete',
  anonymize: 'Anonymize',
  skip: 'Skip',
};

export default function ExecuteErasureModal({
  request,
  onClose,
  onCompleted,
}: {
  request: PrivacyRequest | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [actions, setActions] = useState<Record<string, ErasureAction>>({});
  const [confirm, setConfirm] = useState('');

  const enabled = request !== null;
  const requestId = request?.id ?? '';

  const preview = useQuery<ErasurePreviewResponse>({
    queryKey: queryKeys.privacyRequests.preview(requestId),
    queryFn: async () => {
      const res = await api.post<ErasurePreviewResponse>(
        `/privacy-requests/${requestId}/preview-erasure`
      );
      return res.data;
    },
    enabled,
  });

  useEffect(() => {
    if (preview.data) {
      const defaults: Record<string, ErasureAction> = {};
      for (const entry of preview.data.entries) {
        defaults[entry.table] = entry.default_action;
      }
      setActions(defaults);
    }
  }, [preview.data]);

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<ErasureExecuteResponse>(
        `/privacy-requests/${requestId}/execute-erasure`,
        { table_actions: actions }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.privacyRequests.all });
      showToast('Erasure completed', 'success');
      onCompleted();
      handleClose();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleClose = () => {
    setActions({});
    setConfirm('');
    onClose();
  };

  const summary = useMemo(() => {
    if (!preview.data) return { delete: 0, anonymize: 0, skip: 0 };
    const totals = { delete: 0, anonymize: 0, skip: 0 };
    for (const entry of preview.data.entries) {
      const action = actions[entry.table] ?? entry.default_action;
      totals[action] += entry.count;
    }
    return totals;
  }, [actions, preview.data]);

  const ready = confirm === CONFIRM_PHRASE && !executeMutation.isPending;
  const hasAnyRows = (preview.data?.entries ?? []).reduce((n, e) => n + e.count, 0) > 0;

  return (
    <Modal open={enabled} onClose={handleClose} title="Execute erasure" size="max-w-4xl">
      {preview.isLoading && (
        <div className="px-6 py-10 text-sm text-gray-500 dark:text-gray-400 text-center">
          Loading preview…
        </div>
      )}
      {preview.error && (
        <div className="px-6 py-6 text-sm text-red-600 dark:text-red-400">
          {parseApiError(preview.error)}
        </div>
      )}
      {preview.data && (
        <>
          <div className="px-6 py-4 space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Review the per-table plan below. Invoices are locked under HGB §257 (10-year
              retention). Defaults are safe — only override when you know the downstream impact.
            </p>

            <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Table</th>
                    <th className="px-3 py-2 text-right font-medium">Rows</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-left font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {preview.data.entries.map((entry) => {
                    const current = actions[entry.table] ?? entry.default_action;
                    const isLocked = entry.allowed_actions.length <= 1;
                    return (
                      <tr
                        key={entry.table}
                        className={entry.count === 0 ? 'text-gray-400 dark:text-gray-500' : ''}
                      >
                        <td className="px-3 py-2 font-mono text-xs">{entry.table}</td>
                        <td className="px-3 py-2 text-right">{entry.count}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {(['delete', 'anonymize', 'skip'] as ErasureAction[]).map((action) => {
                              const allowed = entry.allowed_actions.includes(action);
                              if (!allowed) return null;
                              const selected = current === action;
                              return (
                                <label
                                  key={action}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer ${
                                    selected
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                      : 'border-gray-300 dark:border-gray-600'
                                  } ${ACTION_STYLES[action]}`}
                                >
                                  <input
                                    type="radio"
                                    name={`action-${entry.table}`}
                                    value={action}
                                    checked={selected}
                                    disabled={!allowed || isLocked || entry.count === 0}
                                    onChange={() =>
                                      setActions((prev) => ({ ...prev, [entry.table]: action }))
                                    }
                                    className="accent-blue-600"
                                  />
                                  {ACTION_LABEL[action]}
                                </label>
                              );
                            })}
                            {isLocked && (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                locked
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
                          title={entry.locked_reason ?? undefined}
                        >
                          {entry.locked_reason ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-sm text-gray-700 dark:text-gray-300">
              Summary:{' '}
              <span className="text-red-700 dark:text-red-300">{summary.delete} delete</span>
              {' · '}
              <span className="text-amber-700 dark:text-amber-300">
                {summary.anonymize} anonymize
              </span>
              {' · '}
              <span className="text-gray-500 dark:text-gray-400">{summary.skip} skip</span>
            </div>

            {!hasAnyRows && (
              <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400">
                No rows match this subject — nothing to erase, but running execute will still log an
                audit entry and mark the request completed.
              </div>
            )}

            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700">
              <label
                htmlFor="erase-confirm"
                className="block text-sm font-medium text-red-800 dark:text-red-100 mb-2"
              >
                Type <span className="font-mono">{CONFIRM_PHRASE}</span> to enable the execute
                button. Erasure is irreversible.
              </label>
              <input
                id="erase-confirm"
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                className="w-full rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => executeMutation.mutate()}
              className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {executeMutation.isPending ? 'Erasing…' : 'Execute erasure'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
