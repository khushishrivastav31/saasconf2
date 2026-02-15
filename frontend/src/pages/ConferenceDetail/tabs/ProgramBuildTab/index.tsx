import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import api from "../../../../config/api";
import type {
  Conference,
  SessionType,
  Paper,
  ProgramSession,
} from "../../../../types";
import { parseApiError } from "../../../../utils/apiError";
import { formatDate } from "../../../../utils/formatDate";
import { LoadingSpinner } from "../../../../components/common/LoadingSpinner";
import { useToast } from "../../../../components/Toast";

import { useProgramDays, useProgramGrid } from "../ProgramDesignTab/hooks/useProgramGrid";
import { useProgramMutations } from "../ProgramDesignTab/hooks/useProgramMutations";
import DayTabs from "../ProgramDesignTab/DayTabs";
import ProgramGrid from "../ProgramDesignTab/ProgramGrid";
import SessionModal from "../ProgramDesignTab/SessionModal";
import PaperSidebar, { PaperCardOverlay } from "../ProgramDesignTab/PaperSidebar";
import PublishConfirmModal from "./PublishConfirmModal";

interface ProgramBuildTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function ProgramBuildTab({ conference, isAdmin }: ProgramBuildTabProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<ProgramSession | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<unknown>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const isPublished = !!conference.program_published_at;

  // Configure drag sensors (for paper drag-and-drop)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Fetch program days
  const { data: daysData, isLoading: daysLoading } = useProgramDays({
    conferenceId: conference.id,
  });

  // Fetch grid data for selected day
  const { data: gridData, isLoading: gridLoading } = useProgramGrid({
    conferenceId: conference.id,
    dayId: selectedDayId,
    enabled: !!selectedDayId,
  });

  // Fetch session types for session modal
  const { data: sessionTypesData } = useQuery({
    queryKey: ["session-types", conference.id],
    queryFn: async () => {
      const response = await api.get<{ items: SessionType[]; total: number }>(
        `/conferences/${conference.id}/settings/session-types`
      );
      return response.data.items;
    },
  });

  // Mutations (only updateSession used for paper assignment)
  const mutations = useProgramMutations(conference.id);

  // Auto-select first day when days load
  useEffect(() => {
    if (daysData?.items && daysData.items.length > 0 && !selectedDayId) {
      setSelectedDayId(daysData.items[0].id);
    }
  }, [daysData, selectedDayId]);

  // Paper assignment handlers
  const handleAssignPaper = useCallback(
    async (paperId: string, sessionId: string) => {
      try {
        await mutations.updateSession.mutateAsync({
          sessionId,
          data: { paper_id: paperId },
        });
      } catch (error) {
        showToast(parseApiError(error, "Failed to assign paper"));
      }
    },
    [mutations.updateSession]
  );

  const handleUnassignPaper = useCallback(
    async (sessionId: string) => {
      try {
        await mutations.updateSession.mutateAsync({
          sessionId,
          data: { paper_id: null },
        });
      } catch (error) {
        showToast(parseApiError(error, "Failed to unassign paper"));
      }
    },
    [mutations.updateSession]
  );

  // Drag and drop handlers (paper only)
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setActiveDragData(event.active.data.current);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    setActiveDragData(null);

    const { active, over } = event;
    if (!over || !active.data.current) return;

    const dragData = active.data.current;
    const dropData = over.data.current as { slotId: string; trackId: string | null };

    if (!dropData?.slotId) return;

    try {
      // Only handle paper drops
      if (dragData.type === "paper") {
        const paper = dragData.paper as Paper;
        const currentSessions = gridData?.sessions || [];
        const currentSlots = gridData?.slots || [];

        // Find which session occupies this cell
        const sortedSlots = [...currentSlots].sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        );
        const dropSlotIdx = sortedSlots.findIndex((s) => s.id === dropData.slotId);
        const currentTracks = gridData?.tracks || [];
        const sortedTracks = [...currentTracks].sort((a, b) => a.sort_order - b.sort_order);
        const dropTrackIdx = dropData.trackId
          ? sortedTracks.findIndex((t) => t.id === dropData.trackId)
          : -1;

        let targetSession: ProgramSession | null = null;
        for (const session of currentSessions) {
          const sStartIdx = sortedSlots.findIndex((s) => s.id === session.start_slot_id);
          if (sStartIdx === -1) continue;

          const sEndIdx = sStartIdx + session.slot_span - 1;
          if (dropSlotIdx < sStartIdx || dropSlotIdx > sEndIdx) continue;

          if (session.is_general_event || session.track_span === 0) {
            targetSession = session;
            break;
          }

          const sTrackIdx = sortedTracks.findIndex((t) => t.id === session.start_track_id);
          if (sTrackIdx === -1) continue;
          const sTrackEnd = sTrackIdx + session.track_span - 1;
          if (dropTrackIdx >= sTrackIdx && dropTrackIdx <= sTrackEnd) {
            targetSession = session;
            break;
          }
        }

        if (targetSession) {
          await handleAssignPaper(paper.id, targetSession.id);
        } else {
          showToast("Drop the paper on an existing session to assign it", "warning");
        }
      }
    } catch (error) {
      showToast(parseApiError(error, "Failed to assign paper"));
    }
  };

  const handlePublished = () => {
    queryClient.invalidateQueries({ queryKey: ["conference"] });
    queryClient.invalidateQueries({ queryKey: ["program-grid"] });
    queryClient.invalidateQueries({ queryKey: ["program-publish-preview"] });
  };

  // Loading state
  if (daysLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const days = daysData?.items || [];
  const slots = gridData?.slots || [];
  const tracks = gridData?.tracks || [];
  const sessions = gridData?.sessions || [];
  const sessionTypes = sessionTypesData || [];

  return (
    <div className="space-y-4">
      {/* Header with publish controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Program Build</h2>
          {isPublished && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Published{" "}
              {formatDate(conference.program_published_at!)}
            </span>
          )}
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowPublishModal(true)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md shadow-sm ${
              isPublished
                ? "text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100"
                : "text-white bg-primary-600 border border-transparent hover:bg-primary-700"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {isPublished ? "Update Program" : "Publish Program"}
          </button>
        )}
      </div>

      {/* Day tabs (read-only) */}
      <DayTabs
        days={days}
        selectedDayId={selectedDayId}
        onSelectDay={setSelectedDayId}
        onCreateDay={() => {}}
        onUpdateDay={() => {}}
        onDeleteDay={() => {}}
        isAdmin={false}
      />

      {selectedDayId && (
        <>
          {gridLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4">
                {/* Grid area (droppable for paper assignment) */}
                <div className="flex-1 min-w-0 overflow-x-auto" style={{ height: Math.max(400, 48 + slots.length * 60) }}>
                  <ProgramGrid
                    slots={slots}
                    tracks={tracks}
                    sessions={sessions}
                    onSessionClick={(session) => {
                      setSelectedSessionId(session.id);
                      setEditingSession(session);
                    }}
                    onDeleteSession={() => {}}
                    onUnassignPaper={isAdmin ? handleUnassignPaper : undefined}
                    isAdmin={false}
                    isDroppable={true}
                  />
                </div>

                {/* Paper sidebar (search, filter, drag source) */}
                {isAdmin && (
                  <PaperSidebar
                    conferenceId={conference.id}
                    sessions={sessions}
                    slots={slots}
                    onAssignPaper={handleAssignPaper}
                    onUnassignPaper={handleUnassignPaper}
                    selectedSessionId={selectedSessionId}
                    isAdmin={isAdmin}
                  />
                )}
              </div>

              {/* Drag overlay */}
              <DragOverlay>
                {activeDragId && activeDragData ? (
                  (() => {
                    const data = activeDragData as Record<string, unknown>;
                    if (data.type === "paper") {
                      return <PaperCardOverlay paper={data.paper as Paper} />;
                    }
                    return null;
                  })()
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      {/* No day selected state */}
      {!selectedDayId && days.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Program Days</h3>
          <p className="text-sm text-gray-500 mb-4 text-center max-w-md">
            Create program days in the Design tab first.
          </p>
        </div>
      )}

      {/* Session view modal (read-only, allows paper unassign) */}
      <SessionModal
        open={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={editingSession}
        sessionTypes={sessionTypes}
        slots={slots}
        maxSlotSpan={Math.max(slots.length, 1)}
        maxTrackSpan={Math.max(tracks.length, 1)}
        onUpdate={(sessionId, data) => {
          // Only allow paper-related updates in Build mode
          if ("paper_id" in data) {
            mutations.updateSession.mutateAsync({ sessionId, data: { paper_id: data.paper_id } });
          }
        }}
        onDelete={() => {}}
        isAdmin={false}
      />

      {/* Publish confirmation modal */}
      <PublishConfirmModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        conferenceId={conference.id}
        isUpdate={isPublished}
        onPublished={handlePublished}
      />
    </div>
  );
}
