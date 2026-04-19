import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/Modal';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import { parseApiError } from '../../utils/apiError';
import { useToast } from '../../components/Toast';
import type { PrivacyRequest } from './types';

export default function RejectPrivacyRequestModal({
  request,
  onClose,
  onRejected,
}: {
  request: PrivacyRequest | null;
  onClose: () => void;
  onRejected: (request: PrivacyRequest) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [reason, setReason] = useState('');

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error('No request selected');
      const res = await api.post<PrivacyRequest>(`/privacy-requests/${request.id}/reject`, {
        rejection_reason: reason,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.privacyRequests.all });
      showToast('Request rejected', 'success');
      onRejected(data);
      setReason('');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleClose = () => {
    setReason('');
    onClose();
  };

  const canSubmit = reason.trim().length > 0 && !rejectMutation.isPending;

  return (
    <Modal open={request !== null} onClose={handleClose} title="Reject privacy request">
      <div className="px-6 py-4 space-y-4">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          The subject will need this reason in the reply — keep it concise but specific (e.g.
          "duplicate of ticket #1234" or "subject is not a customer of this tenant").
        </p>
        <div>
          <label
            htmlFor="reject-reason"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Rejection reason (required)
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            maxLength={2000}
            required
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
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
          disabled={!canSubmit}
          onClick={() => rejectMutation.mutate()}
          className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          {rejectMutation.isPending ? 'Rejecting…' : 'Reject request'}
        </button>
      </div>
    </Modal>
  );
}
