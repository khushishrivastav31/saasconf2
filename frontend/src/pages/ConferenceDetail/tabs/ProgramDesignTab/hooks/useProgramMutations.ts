import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type {
  ProgramDay,
  ProgramDayCreate,
  ProgramDayUpdate,
  ProgramTimeSlot,
  ProgramTimeSlotCreate,
  ProgramTimeSlotUpdate,
  ProgramTrack,
  ProgramTrackCreate,
  ProgramTrackUpdate,
  ProgramSession,
  ProgramSessionCreate,
  ProgramSessionUpdate,
  ProgramSessionMove,
} from '../../../../../types';

export function useProgramMutations(conferenceId: string) {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.program.days(conferenceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.program.timeSlots(conferenceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.program.tracks(conferenceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.program.sessions(conferenceId) });
    queryClient.invalidateQueries({ queryKey: ['program-grid', conferenceId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.program.fullGrid(conferenceId) });
  };

  // Day mutations
  const createDay = useMutation({
    mutationFn: async (data: ProgramDayCreate) => {
      const response = await api.post<ProgramDay>(
        `/conferences/${conferenceId}/program/days`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const updateDay = useMutation({
    mutationFn: async ({ dayId, data }: { dayId: string; data: ProgramDayUpdate }) => {
      const response = await api.put<ProgramDay>(
        `/conferences/${conferenceId}/program/days/${dayId}`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const deleteDay = useMutation({
    mutationFn: async (dayId: string) => {
      await api.delete(`/conferences/${conferenceId}/program/days/${dayId}`);
    },
    onSuccess: invalidateAll,
  });

  // Time slot mutations
  const createTimeSlot = useMutation({
    mutationFn: async ({ dayId, data }: { dayId: string; data: ProgramTimeSlotCreate }) => {
      const response = await api.post<ProgramTimeSlot>(
        `/conferences/${conferenceId}/program/days/${dayId}/slots`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const updateTimeSlot = useMutation({
    mutationFn: async ({ slotId, data }: { slotId: string; data: ProgramTimeSlotUpdate }) => {
      const response = await api.put<ProgramTimeSlot>(
        `/conferences/${conferenceId}/program/slots/${slotId}`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const deleteTimeSlot = useMutation({
    mutationFn: async (slotId: string) => {
      await api.delete(`/conferences/${conferenceId}/program/slots/${slotId}`);
    },
    onSuccess: invalidateAll,
  });

  // Track mutations
  const createTrack = useMutation({
    mutationFn: async (data: ProgramTrackCreate) => {
      const response = await api.post<ProgramTrack>(
        `/conferences/${conferenceId}/program/tracks`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const updateTrack = useMutation({
    mutationFn: async ({ trackId, data }: { trackId: string; data: ProgramTrackUpdate }) => {
      const response = await api.put<ProgramTrack>(
        `/conferences/${conferenceId}/program/tracks/${trackId}`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const deleteTrack = useMutation({
    mutationFn: async (trackId: string) => {
      await api.delete(`/conferences/${conferenceId}/program/tracks/${trackId}`);
    },
    onSuccess: invalidateAll,
  });

  // Session mutations
  const createSession = useMutation({
    mutationFn: async (data: ProgramSessionCreate) => {
      const response = await api.post<ProgramSession>(
        `/conferences/${conferenceId}/program/sessions`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const updateSession = useMutation({
    mutationFn: async ({ sessionId, data }: { sessionId: string; data: ProgramSessionUpdate }) => {
      const response = await api.put<ProgramSession>(
        `/conferences/${conferenceId}/program/sessions/${sessionId}`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const moveSession = useMutation({
    mutationFn: async ({ sessionId, data }: { sessionId: string; data: ProgramSessionMove }) => {
      const response = await api.put<ProgramSession>(
        `/conferences/${conferenceId}/program/sessions/${sessionId}/move`,
        data
      );
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await api.delete(`/conferences/${conferenceId}/program/sessions/${sessionId}`);
    },
    onSuccess: invalidateAll,
  });

  return {
    // Days
    createDay,
    updateDay,
    deleteDay,
    // Time slots
    createTimeSlot,
    updateTimeSlot,
    deleteTimeSlot,
    // Tracks
    createTrack,
    updateTrack,
    deleteTrack,
    // Sessions
    createSession,
    updateSession,
    moveSession,
    deleteSession,
  };
}
