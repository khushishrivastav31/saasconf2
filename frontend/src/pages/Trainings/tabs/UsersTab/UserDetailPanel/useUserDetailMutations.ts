import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { useToast } from '../../../../../components/Toast';
import type { EditableProfile } from '../types';

interface Args {
  attendeeId: string;
  portalUserId: string | null;
  onPictureRemoved: () => void;
  onVideoRemoved: () => void;
  onPortalAccountCreated: (portalUserId: string) => void;
}

export function useUserDetailMutations({
  attendeeId,
  portalUserId,
  onPictureRemoved,
  onVideoRemoved,
  onPortalAccountCreated,
}: Args) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ['training-users'] });
    queryClient.invalidateQueries({ queryKey: ['training-user-profile'] });
  };

  const invalidateEditable = () => {
    queryClient.invalidateQueries({ queryKey: ['training-user-editable'] });
  };

  const toggleAccess = useMutation({
    mutationFn: (id: string) => api.put(`/trainings/users/${id}/toggle-access`),
    onSuccess: (res) => {
      invalidateUsers();
      showToast(res.data.message, 'success');
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
      if (axiosErr?.response?.status === 409) {
        showToast(
          axiosErr.response.data?.detail ||
            'Cannot deactivate: user has active training assignments',
          'error'
        );
      } else {
        showToast('Failed to update access', 'error');
      }
    },
  });

  const resendInvite = useMutation({
    mutationFn: (id: string) => api.post(`/trainings/users/${id}/resend-invite`),
    onSuccess: () => showToast('Invite email sent', 'success'),
    onError: () => showToast('Failed to send invite', 'error'),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => api.post(`/trainings/users/${id}/reset-password`),
    onSuccess: () => showToast('Password reset email sent', 'success'),
    onError: () => showToast('Failed to send reset email', 'error'),
  });

  const impersonate = useMutation({
    mutationFn: (id: string) => api.post(`/trainings/users/${id}/impersonate`),
    onSuccess: (res) => {
      const { access_token, portal_user_name } = res.data;
      localStorage.setItem('portal_access_token', access_token);
      const tenantSlug = window.location.pathname.split('/')[2] || '';
      window.open(`/${tenantSlug}/portal/trainings`, '_blank');
      showToast(`Viewing portal as ${portal_user_name}`, 'info');
    },
    onError: () => showToast('Failed to impersonate user', 'error'),
  });

  const saveProfile = useMutation({
    mutationFn: async (data: Partial<EditableProfile>) => {
      const res = await api.put(`/trainings/users/${portalUserId}`, data);
      return res.data;
    },
    onSuccess: () => {
      invalidateEditable();
      invalidateUsers();
      showToast('Profile saved', 'success');
    },
    onError: () => showToast('Failed to save profile', 'error'),
  });

  const uploadPicture = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/trainings/users/${portalUserId}/picture`, fd);
      return res.data;
    },
    onSuccess: () => {
      invalidateEditable();
      showToast('Picture uploaded', 'success');
    },
    onError: () => showToast('Failed to upload picture', 'error'),
  });

  const deletePicture = useMutation({
    mutationFn: async () => {
      await api.delete(`/trainings/users/${portalUserId}/picture`);
    },
    onSuccess: () => {
      invalidateEditable();
      onPictureRemoved();
      showToast('Picture removed', 'success');
    },
    onError: () => showToast('Failed to remove picture', 'error'),
  });

  const uploadVideo = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/trainings/users/${portalUserId}/video`, fd);
      return res.data;
    },
    onSuccess: () => {
      invalidateEditable();
      showToast('Video uploaded', 'success');
    },
    onError: () => showToast('Failed to upload video', 'error'),
  });

  const deleteVideo = useMutation({
    mutationFn: async () => {
      await api.delete(`/trainings/users/${portalUserId}/video`);
    },
    onSuccess: () => {
      invalidateEditable();
      onVideoRemoved();
      showToast('Video removed', 'success');
    },
    onError: () => showToast('Failed to remove video', 'error'),
  });

  const createPortalAccount = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/trainings/users/create-for-attendee/${attendeeId}`);
      return res.data as { portal_user_id: string };
    },
    onSuccess: (data) => {
      invalidateUsers();
      onPortalAccountCreated(data.portal_user_id);
      showToast('Portal account created', 'success');
    },
    onError: () => showToast('Failed to create portal account', 'error'),
  });

  const reactivateAttendee = useMutation({
    mutationFn: () => api.post(`/trainings/attendees/${attendeeId}/reactivate`),
    onSuccess: () => {
      invalidateUsers();
      showToast('Attendee reactivated', 'success');
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        'Failed to reactivate attendee';
      showToast(detail, 'error');
    },
  });

  return {
    toggleAccess,
    resendInvite,
    resetPassword,
    impersonate,
    saveProfile,
    uploadPicture,
    deletePicture,
    uploadVideo,
    deleteVideo,
    createPortalAccount,
    reactivateAttendee,
  };
}
