import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';
import type { PortalUser } from './types';

export default function MergeDialog({
  targetPortalUserId,
  items,
  onClose,
  onMerged,
}: {
  targetPortalUserId: string;
  items: PortalUser[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [sourceEmail, setSourceEmail] = useState('');

  const mergeMutation = useMutation({
    mutationFn: ({ targetId, sourceId }: { targetId: string; sourceId: string }) =>
      api.post(`/trainings/users/${targetId}/merge`, { source_user_id: sourceId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-users'] });
      showToast(res.data.message, 'success');
      onMerged();
    },
    onError: () => showToast('Failed to merge users', 'error'),
  });

  const handleMerge = () => {
    const source = items.find(
      (u) => u.email.toLowerCase() === sourceEmail.toLowerCase() && u.portal_user_id
    );
    if (!source?.portal_user_id) {
      showToast('Source user not found or has no portal account', 'error');
      return;
    }
    mergeMutation.mutate({ targetId: targetPortalUserId, sourceId: source.portal_user_id });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Merge Users</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter the email of the <strong>source user</strong> to merge into the selected target. All
          training history, registrations, and offer links will be moved. The source account will be
          deleted.
        </p>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Source user email
        </label>
        <input
          type="email"
          value={sourceEmail}
          onChange={(e) => setSourceEmail(e.target.value)}
          placeholder="user@example.com"
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={!sourceEmail || mergeMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-40"
          >
            {mergeMutation.isPending ? 'Merging...' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
