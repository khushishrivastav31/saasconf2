import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../config/api';
import { useToast } from './Toast';
import MergeDialog from '../pages/MyCompany/UsersTab/MergeDialog';

interface Props {
  portalUserId: string;
  isActive: boolean;
  onAfterMerge?: () => void;
}

const btnCls =
  'px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-40';

export default function PortalAccountActions({ portalUserId, isActive, onAfterMerge }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showMerge, setShowMerge] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['portal-users'] });
    queryClient.invalidateQueries({ queryKey: ['portal-user-detail', portalUserId] });
    queryClient.invalidateQueries({ queryKey: ['portal-user-history', portalUserId] });
  };

  const toggleAccess = useMutation({
    mutationFn: () => api.put(`/portal-users/${portalUserId}/toggle-access`),
    onSuccess: (res) => {
      invalidateAll();
      showToast(res.data.message ?? 'Access updated', 'success');
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
      if (axiosErr?.response?.status === 409) {
        showToast(
          axiosErr.response.data?.detail || 'Cannot deactivate: user has active assignments',
          'error'
        );
      } else {
        showToast('Failed to update access', 'error');
      }
    },
  });

  const resendInvite = useMutation({
    mutationFn: () => api.post(`/portal-users/${portalUserId}/resend-invite`),
    onSuccess: () => {
      invalidateAll();
      showToast('Invite email sent', 'success');
    },
    onError: () => showToast('Failed to send invite', 'error'),
  });

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/portal-users/${portalUserId}/reset-password`),
    onSuccess: () => {
      invalidateAll();
      showToast('Password reset email sent', 'success');
    },
    onError: () => showToast('Failed to send reset email', 'error'),
  });

  const impersonate = useMutation({
    mutationFn: () => api.post(`/portal-users/${portalUserId}/impersonate`),
    onSuccess: (res) => {
      invalidateAll();
      const { access_token, portal_user_name } = res.data;
      localStorage.setItem('portal_access_token', access_token);
      const tenantSlug = window.location.pathname.split('/')[2] || '';
      window.open(`/${tenantSlug}/portal/dashboard`, '_blank');
      showToast(`Viewing portal as ${portal_user_name}`, 'info');
    },
    onError: () => showToast('Failed to impersonate user', 'error'),
  });

  return (
    <>
      {showMerge && (
        <MergeDialog
          targetUserId={portalUserId}
          onClose={() => setShowMerge(false)}
          onMerged={() => {
            setShowMerge(false);
            onAfterMerge?.();
          }}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggleAccess.mutate()}
          disabled={toggleAccess.isPending}
          className={btnCls}
        >
          {toggleAccess.isPending ? '...' : isActive ? 'Deactivate' : 'Activate'}
        </button>
        <button
          type="button"
          onClick={() => resendInvite.mutate()}
          disabled={resendInvite.isPending}
          className={btnCls}
        >
          {resendInvite.isPending ? '...' : 'Resend invite'}
        </button>
        <button
          type="button"
          onClick={() => resetPassword.mutate()}
          disabled={resetPassword.isPending}
          className={btnCls}
        >
          {resetPassword.isPending ? '...' : 'Reset password'}
        </button>
        <button
          type="button"
          onClick={() => impersonate.mutate()}
          disabled={impersonate.isPending || !isActive}
          className="px-3 py-1.5 text-xs font-medium border border-primary-300 dark:border-primary-700 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 text-primary-700 dark:text-primary-300 disabled:opacity-40"
        >
          {impersonate.isPending ? '...' : 'Impersonate'}
        </button>
        <button
          type="button"
          onClick={() => setShowMerge(true)}
          className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-300"
        >
          Merge with...
        </button>
      </div>
    </>
  );
}
