import { useQuery } from '@tanstack/react-query';
import api from '../../../../../config/api';
import type { UserProfile, EditableProfile } from '../types';

interface Args {
  attendeeId: string;
  portalUserId: string | null;
}

export function useUserDetailData({ attendeeId, portalUserId }: Args) {
  const profileQuery = useQuery({
    queryKey: ['training-user-profile', attendeeId],
    queryFn: async () => {
      const res = await api.get(`/trainings/attendees/${attendeeId}/profile`);
      return res.data as UserProfile;
    },
    staleTime: 30_000,
  });

  const editableQuery = useQuery({
    queryKey: ['training-user-editable', portalUserId],
    queryFn: async () => {
      const res = await api.get(`/trainings/users/${portalUserId}`);
      return res.data as EditableProfile;
    },
    enabled: !!portalUserId,
    staleTime: 30_000,
  });

  return { profileQuery, editableQuery };
}
