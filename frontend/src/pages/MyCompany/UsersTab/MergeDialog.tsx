import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import type { PortalUserListItem } from '../types';

interface Props {
  targetUserId: string;
  onClose: () => void;
  onMerged: () => void;
}

export default function MergeDialog({ targetUserId, onClose, onMerged }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [sourceEmail, setSourceEmail] = useState('');
  const [lookupPending, setLookupPending] = useState(false);

  const mergeMutation = useMutation({
    mutationFn: ({ targetId, sourceId }: { targetId: string; sourceId: string }) =>
      api.post(`/portal-users/${targetId}/merge`, { source_user_id: sourceId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['portal-users'] });
      queryClient.invalidateQueries({ queryKey: ['portal-user-detail'] });
      queryClient.invalidateQueries({ queryKey: ['portal-user-history'] });
      showToast(res.data.message ?? 'Users merged', 'success');
      onMerged();
    },
    onError: () => showToast('Failed to merge users', 'error'),
  });

  const handleMerge = async () => {
    const needle = sourceEmail.trim().toLowerCase();
    if (!needle) return;
    setLookupPending(true);
    try {
      const res = await api.get('/portal-users', {
        params: { search: needle, per_page: 5 },
      });
      const items = (res.data?.items ?? []) as PortalUserListItem[];
      const source = items.find((u) => u.email.toLowerCase() === needle && u.id !== targetUserId);
      if (!source) {
        showToast('Source user not found.', 'error');
        return;
      }
      mergeMutation.mutate({ targetId: targetUserId, sourceId: source.id });
    } catch {
      showToast('Failed to look up source user', 'error');
    } finally {
      setLookupPending(false);
    }
  };

  const isWorking = lookupPending || mergeMutation.isPending;

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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Merge users</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Enter the email of the <strong>source user</strong> to merge into the selected target. All
          training attendee rows, CFP applicant links, and offer links will be moved. The source
          account will be deleted.
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
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={!sourceEmail || isWorking}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-40"
          >
            {isWorking ? 'Merging...' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
