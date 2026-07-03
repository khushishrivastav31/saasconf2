import { useCallback } from 'react';
import type { ProgramSession } from '../../../../../types';
import { parseApiError } from '../../../../../utils/apiError';
import { useToast } from '../../../../../components/Toast';
import type { useProgramDays, useProgramGrid } from './useProgramGrid';
import type { useProgramMutations } from './useProgramMutations';

interface ProgramDesignHandlerDeps {
  mutations: ReturnType<typeof useProgramMutations>;
  showToast: ReturnType<typeof useToast>['showToast'];
  daysData: ReturnType<typeof useProgramDays>['data'];
  gridData: ReturnType<typeof useProgramGrid>['data'];
  selectedDayId: string | null;
  setSelectedDayId: (id: string | null) => void;
  setEditingSession: (session: ProgramSession | null) => void;
  pendingDeleteSessionId: string | null;
  setPendingDeleteSessionId: (id: string | null) => void;
}

/**
 * Day / time-slot / track / session command handlers for the Program Design
 * grid. Extracted from ProgramDesignTab to keep the tab component focused on
 * data fetching, drag wiring, and layout.
 */
export function useProgramDesignHandlers({
  mutations,
  showToast,
  daysData,
  gridData,
  selectedDayId,
  setSelectedDayId,
  setEditingSession,
  pendingDeleteSessionId,
  setPendingDeleteSessionId,
}: ProgramDesignHandlerDeps) {
  // Handlers for day management
  const handleCreateDay = useCallback(
    async (data: { date: string; name?: string }) => {
      try {
        const day = await mutations.createDay.mutateAsync(data);
        setSelectedDayId(day.id);
      } catch (error) {
        showToast(parseApiError(error, 'Failed to create day'));
      }
    },
    [mutations.createDay, showToast, setSelectedDayId]
  );

  const handleUpdateDay = useCallback(
    async (dayId: string, data: { date?: string; name?: string }) => {
      try {
        await mutations.updateDay.mutateAsync({ dayId, data });
      } catch (error) {
        showToast(parseApiError(error, 'Failed to update day'));
      }
    },
    [mutations.updateDay, showToast]
  );

  const handleDeleteDay = useCallback(
    async (dayId: string) => {
      try {
        await mutations.deleteDay.mutateAsync(dayId);
        if (selectedDayId === dayId) {
          const remaining = daysData?.items.filter((d) => d.id !== dayId);
          setSelectedDayId(remaining && remaining.length > 0 ? remaining[0].id : null);
        }
      } catch (error) {
        showToast(parseApiError(error, 'Failed to delete day'));
      }
    },
    [mutations.deleteDay, selectedDayId, daysData, showToast, setSelectedDayId]
  );

  // Handlers for time slot management
  const handleUpdateSlot = useCallback(
    async (
      slotId: string,
      data: { start_time?: string; end_time?: string; is_session_free?: boolean }
    ) => {
      try {
        await mutations.updateTimeSlot.mutateAsync({ slotId, data });
      } catch (error) {
        showToast(parseApiError(error, 'Failed to update time slot'));
      }
    },
    [mutations.updateTimeSlot, showToast]
  );

  const handleDeleteSlot = useCallback(
    async (slotId: string) => {
      try {
        await mutations.deleteTimeSlot.mutateAsync(slotId);
      } catch (error) {
        showToast(parseApiError(error, 'Failed to delete time slot'));
      }
    },
    [mutations.deleteTimeSlot, showToast]
  );

  // Handlers for track management
  const handleUpdateTrack = useCallback(
    async (
      trackId: string,
      data: { name?: string; color?: string; location_id?: string; is_active?: boolean }
    ) => {
      try {
        await mutations.updateTrack.mutateAsync({ trackId, data });
      } catch (error) {
        showToast(parseApiError(error, 'Failed to update track'));
      }
    },
    [mutations.updateTrack, showToast]
  );

  const handleDeleteTrack = useCallback(
    async (trackId: string) => {
      try {
        await mutations.deleteTrack.mutateAsync(trackId);
      } catch (error) {
        showToast(parseApiError(error, 'Failed to delete track'));
      }
    },
    [mutations.deleteTrack, showToast]
  );

  // Handlers for session management
  const handleUpdateSession = useCallback(
    async (
      sessionId: string,
      data: Parameters<typeof mutations.updateSession.mutateAsync>[0]['data']
    ) => {
      try {
        await mutations.updateSession.mutateAsync({ sessionId, data });
      } catch (error) {
        showToast(parseApiError(error, 'Failed to update session'));
      }
    },
    [mutations, showToast]
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const sessions = gridData?.sessions || [];
      const session = sessions.find((s) => s.id === sessionId);
      if (session?.paper_id) {
        setPendingDeleteSessionId(sessionId);
        return;
      }
      mutations.deleteSession.mutateAsync(sessionId).catch((error) => {
        showToast(parseApiError(error, 'Failed to delete session'));
      });
    },
    [mutations.deleteSession, gridData?.sessions, showToast, setPendingDeleteSessionId]
  );

  const confirmDeleteSession = useCallback(async () => {
    if (!pendingDeleteSessionId) return;
    try {
      await mutations.deleteSession.mutateAsync(pendingDeleteSessionId);
    } catch (error) {
      showToast(parseApiError(error, 'Failed to delete session'));
    }
    setPendingDeleteSessionId(null);
  }, [pendingDeleteSessionId, mutations.deleteSession, showToast, setPendingDeleteSessionId]);

  const handleResizeSession = useCallback(
    async (sessionId: string, slotSpan: number, trackSpan: number) => {
      try {
        await mutations.updateSession.mutateAsync({
          sessionId,
          data: { slot_span: slotSpan, track_span: trackSpan },
        });
      } catch (error) {
        showToast(parseApiError(error, 'Failed to resize session'));
      }
    },
    [mutations.updateSession, showToast]
  );

  // Quick-add handlers for grid "+" buttons
  const handleQuickAddTrack = useCallback(async () => {
    if (!selectedDayId) return;
    try {
      const currentTracks = gridData?.tracks || [];
      const maxOrder = currentTracks.reduce((max, t) => Math.max(max, t.sort_order), 0);
      const name = `Track ${currentTracks.length + 1}`;
      await mutations.createTrack.mutateAsync({
        name,
        sort_order: maxOrder + 1,
        program_day_id: selectedDayId,
      });
    } catch (error) {
      showToast(parseApiError(error, 'Failed to add track'));
    }
  }, [mutations.createTrack, gridData?.tracks, selectedDayId, showToast]);

  const handleQuickAddSlot = useCallback(async () => {
    if (!selectedDayId) return;
    try {
      const currentSlots = gridData?.slots || [];
      // Start from last slot's end time, or 09:00 if no slots
      const sorted = [...currentSlots].sort((a, b) => a.start_time.localeCompare(b.start_time));
      const lastEndRaw = sorted.length > 0 ? sorted[sorted.length - 1].end_time : '09:00:00';
      const parts = lastEndRaw.split(':').map(Number);
      const h = parts[0] || 0;
      const m = parts[1] || 0;
      const startMinutes = h * 60 + m;
      // Cannot start at or past 23:59
      if (startMinutes >= 23 * 60 + 59) {
        showToast('Cannot add more time slots past 23:59', 'warning');
        return;
      }
      // Default 30-min slot, but cap end time at 23:59
      const maxEnd = 23 * 60 + 59;
      const endMinutes = Math.min(startMinutes + 30, maxEnd);
      const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
      const endM = String(endMinutes % 60).padStart(2, '0');
      const endTime = `${endH}:${endM}:00`;
      await mutations.createTimeSlot.mutateAsync({
        dayId: selectedDayId,
        data: { start_time: startTime, end_time: endTime },
      });
    } catch (error) {
      showToast(parseApiError(error, 'Failed to add time slot'));
    }
  }, [mutations.createTimeSlot, selectedDayId, gridData?.slots, showToast]);

  const handleMergeCells = useCallback(
    async (data: {
      start_slot_id: string;
      start_track_id: string;
      slot_span: number;
      track_span: number;
      sessionId?: string;
      spansBreakSlot?: boolean;
      visibleCells?: Array<{ slot_id: string; track_id: string }>;
    }) => {
      try {
        const settings = data.visibleCells ? { visible_cells: data.visibleCells } : undefined;
        if (data.sessionId) {
          // Extend existing session
          const updated = await mutations.updateSession.mutateAsync({
            sessionId: data.sessionId,
            data: {
              start_slot_id: data.start_slot_id,
              start_track_id: data.start_track_id,
              slot_span: data.slot_span,
              track_span: data.track_span,
              allow_in_session_free: data.spansBreakSlot || undefined,
              settings,
            },
          });
          setEditingSession(updated);
        } else {
          // Create new merged session — open modal so user can set type, title, etc.
          const created = await mutations.createSession.mutateAsync({
            start_slot_id: data.start_slot_id,
            start_track_id: data.start_track_id,
            slot_span: data.slot_span,
            track_span: data.track_span,
            title: 'Session',
            color: '#9CA3AF',
            allow_in_session_free: data.spansBreakSlot || false,
            settings,
          });
          setEditingSession(created);
        }
      } catch (error) {
        showToast(parseApiError(error, 'Failed to merge cells'));
      }
    },
    [mutations.createSession, mutations.updateSession, showToast, setEditingSession]
  );

  return {
    handleCreateDay,
    handleUpdateDay,
    handleDeleteDay,
    handleUpdateSlot,
    handleDeleteSlot,
    handleUpdateTrack,
    handleDeleteTrack,
    handleUpdateSession,
    handleDeleteSession,
    confirmDeleteSession,
    handleResizeSession,
    handleQuickAddTrack,
    handleQuickAddSlot,
    handleMergeCells,
  };
}
