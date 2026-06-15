import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { queryKeys } from '../../config/queryKeys';
import { formatDate } from '../../utils/formatDate';
import type { PortalInvitationListResponse } from '../../types/portal';
import { INVITATION_STATUS_COLORS } from '../../config/statusColors';

function InvitationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.portal.invitations,
    queryFn: async () => {
      const res = await portalApi.get<PortalInvitationListResponse>('/portal/invitations');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const acceptMutation = useMutation({
    mutationFn: async (paperId: string) => {
      await portalApi.post(`/portal/invitations/${paperId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portal.invitations });
      queryClient.invalidateQueries({ queryKey: queryKeys.portal.papers });
      queryClient.invalidateQueries({ queryKey: ['portal-pending-invitations'] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (paperId: string) => {
      await portalApi.post(`/portal/invitations/${paperId}/decline`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portal.invitations });
      queryClient.invalidateQueries({ queryKey: queryKeys.portal.papers });
      queryClient.invalidateQueries({ queryKey: ['portal-pending-invitations'] });
    },
  });

  const invitationCount = data?.items.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Co-speaker Invitations
            {invitationCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {invitationCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your co-speaker invitations.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {data.items.map((invitation) => (
            <div
              key={invitation.paper_id}
              className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {invitation.paper_title}
                </h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {invitation.conference_name && <span>{invitation.conference_name}</span>}
                  {invitation.cfp_title && <span>{invitation.cfp_title}</span>}
                </div>
                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Invited by:{' '}
                  {`${invitation.main_speaker_first_name || ''} ${invitation.main_speaker_last_name || ''}`.trim()}{' '}
                  ({invitation.main_speaker_email})
                </div>
                {invitation.invited_at && (
                  <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    {formatDate(invitation.invited_at)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 ml-4">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${INVITATION_STATUS_COLORS[invitation.invitation_status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                >
                  {invitation.invitation_status}
                </span>

                {invitation.invitation_status === 'pending' && (
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => acceptMutation.mutate(invitation.paper_id)}
                      disabled={acceptMutation.isPending}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineMutation.mutate(invitation.paper_id)}
                      disabled={declineMutation.isPending}
                      className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No co-speaker invitations at this time.
        </div>
      )}
    </div>
  );
}

export default InvitationsPage;
