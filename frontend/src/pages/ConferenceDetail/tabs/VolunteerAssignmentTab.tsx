import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import api from '../../../config/api';
import type { Conference } from '../../../types';
import type {
  SessionVolunteerTask,
  SessionTasksBrief,
  TaskAssignmentOverviewList,
  TaskSessionDetail,
  AssignedVolunteerBrief,
  Volunteer,
} from '../../../types/volunteer';
import type { SessionVisualSegment } from './ProgramDesignTab/hooks/useGridPositions';
import { useProgramDays, useProgramGrid } from './ProgramDesignTab/hooks/useProgramGrid';
import { useGridPositions } from './ProgramDesignTab/hooks/useGridPositions';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import Modal from '../../../components/Modal';

// Grid dimensions (match TaskAssignmentTab)
const GRID_CELL_HEIGHT = 120;
const GRID_CELL_WIDTH = 150;
const TIME_COL_WIDTH = 80;

const PRESET_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#6366F1',
];

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// DraggableVolunteerItem — sidebar draggable volunteer card
// ---------------------------------------------------------------------------
interface DraggableVolunteerItemProps {
  volunteer: Volunteer;
  assignmentCount: number;
  isAdmin: boolean;
  onColorCycle: (volunteerId: string, currentColor: string | null) => void;
}

function DraggableVolunteerItem({
  volunteer,
  assignmentCount,
  isAdmin,
  onColorCycle,
}: DraggableVolunteerItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vol-${volunteer.id}`,
    data: { type: 'volunteer', volunteer },
  });

  // Find the volunteer's color from conference_volunteers (passed as part of overview data)
  const volColor = (volunteer as Volunteer & { color?: string | null }).color ?? null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${
        isDragging
          ? 'opacity-50 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30'
          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-600'
      }`}
    >
      <div
        className="w-3 h-3 rounded-full shrink-0 border border-gray-300 dark:border-gray-500 cursor-pointer"
        style={{ backgroundColor: volColor || '#9CA3AF' }}
        title="Click to change color"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          if (isAdmin) onColorCycle(volunteer.id, volColor);
        }}
        onKeyDown={(e) => {
          if (!isAdmin) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onColorCycle(volunteer.id, volColor);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
        {volunteer.full_name}
      </span>
      {assignmentCount > 0 && (
        <span className="ml-1 shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
          {assignmentCount}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DroppableVolunteerSessionCell — grid session cell showing task fill badges
// ---------------------------------------------------------------------------
interface DroppableVolunteerSessionCellProps {
  segment: SessionVisualSegment;
  sessionTasks: SessionVolunteerTask[];
  sessionAssignments: TaskSessionDetail[];
  onClick: () => void;
}

function DroppableVolunteerSessionCell({
  segment,
  sessionTasks,
  sessionAssignments,
  onClick,
}: DroppableVolunteerSessionCellProps) {
  const { session } = segment;
  const hasTasks = sessionTasks.length > 0;

  const { setNodeRef, isOver } = useDroppable({
    id: `va-${segment.segmentKey}`,
    data: { sessionId: session.id },
    disabled: !hasTasks,
  });

  const bgColor = session.is_general_event
    ? session.color || '#6B7280'
    : session.color || '#3B82F6';

  return (
    <div
      ref={setNodeRef}
      style={{
        gridRowStart: segment.gridRowStart,
        gridRowEnd: segment.gridRowEnd,
        gridColumnStart: segment.gridColumnStart,
        gridColumnEnd: segment.gridColumnEnd,
        zIndex: 5,
        overflow: 'hidden',
        minWidth: 0,
      }}
      className={`p-2 rounded-md text-white cursor-pointer transition-shadow hover:shadow-lg ${
        isOver && hasTasks ? 'ring-2 ring-blue-500' : ''
      }`}
      onClick={onClick}
    >
      <div
        className="h-full flex flex-col rounded-md overflow-hidden p-1.5"
        style={{ backgroundColor: isOver && hasTasks ? undefined : bgColor }}
      >
        <h4 className="text-xs font-medium leading-tight truncate">{session.title}</h4>
        {session.speaker_name && (
          <p className="text-xs opacity-80 leading-tight truncate">{session.speaker_name}</p>
        )}
        {hasTasks && (
          <div className="mt-1 space-y-1 overflow-y-auto flex-1 min-h-0">
            {sessionTasks.map((task) => {
              const detail = sessionAssignments.find(
                (d) => d.session_volunteer_task_id === task.id
              );
              const volunteers = detail?.assigned_volunteers ?? [];
              const assigned = volunteers.length || task.assigned_count;
              const isFull = assigned >= task.required_count;
              return (
                <div key={task.id}>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      isFull ? 'bg-green-500/40 text-white' : 'bg-amber-500/40 text-white'
                    }`}
                  >
                    {task.volunteer_task_name}
                    <span className="ml-1 opacity-75">
                      ({assigned}/{task.required_count})
                    </span>
                  </span>
                  {volunteers.length > 0 && (
                    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                      {volunteers.map((vol) => (
                        <span
                          key={vol.assignment_id}
                          className="inline-flex items-center gap-0.5 text-[9px] text-white/90"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: vol.volunteer_color || '#D1D5DB',
                            }}
                          />
                          {vol.volunteer_name.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!hasTasks && <p className="mt-1 text-[10px] text-white/70 italic">No tasks</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// formatTime helper
// ---------------------------------------------------------------------------
function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':');
  return `${hours}:${minutes}`;
}

// ---------------------------------------------------------------------------
// VolunteerAssignmentTab
// ---------------------------------------------------------------------------
export default function VolunteerAssignmentTab({ conference, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDragData, setActiveDragData] = useState<{
    type: string;
    volunteer: Volunteer;
  } | null>(null);

  // Task picker modal state (for multi-task drops)
  const [pendingDrop, setPendingDrop] = useState<{
    sessionId: string;
    volunteer: Volunteer;
  } | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);

  // Session detail modal state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionTitle, setSelectedSessionTitle] = useState('');
  const [showDetailModal, setShowDetailModal] = useState(false);

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ---------- Data queries ----------

  // Program days
  const { data: daysData, isLoading: daysLoading } = useProgramDays({
    conferenceId: conference.id,
  });
  const days = daysData?.items ?? [];
  const activeDayId = selectedDayId ?? days[0]?.id ?? null;

  // Program grid for selected day
  const { data: gridData, isLoading: gridLoading } = useProgramGrid({
    conferenceId: conference.id,
    dayId: activeDayId,
  });

  // Session-task assignments (tasks per session with counts)
  const { data: sessionTasksData } = useQuery({
    queryKey: ['session-tasks', conference.id],
    queryFn: async () => {
      const res = await api.get<{ items: SessionTasksBrief[]; total: number }>(
        `/conferences/${conference.id}/volunteer-tasks/session-tasks`
      );
      return res.data;
    },
  });

  // Volunteer assignment overview (grouped by task, with assigned volunteer details)
  const { data: overviewData } = useQuery({
    queryKey: ['volunteer-assignments', conference.id],
    queryFn: async () => {
      const res = await api.get<TaskAssignmentOverviewList>(
        `/conferences/${conference.id}/volunteer-tasks/volunteer-assignments`
      );
      return res.data;
    },
  });

  // Conference volunteers for sidebar
  const { data: volunteersData } = useQuery({
    queryKey: ['conference-volunteers-list', conference.id],
    queryFn: async () => {
      const res = await api.get<{ items: Volunteer[]; total: number }>(
        `/volunteers?conference_id=${conference.id}&page_size=100`
      );
      return res.data.items;
    },
  });

  // ---------- Lookup maps ----------

  // session_id -> SessionVolunteerTask[]
  const sessionTaskMap = useMemo(() => {
    const map = new Map<string, SessionVolunteerTask[]>();
    for (const item of sessionTasksData?.items ?? []) {
      map.set(item.session_id, item.tasks);
    }
    return map;
  }, [sessionTasksData]);

  // session_id -> TaskSessionDetail[] (re-indexed from task-grouped overview)
  const sessionAssignmentMap = useMemo(() => {
    const map = new Map<string, TaskSessionDetail[]>();
    for (const taskOverview of overviewData?.items ?? []) {
      for (const detail of taskOverview.sessions) {
        const existing = map.get(detail.session_id) ?? [];
        existing.push(detail);
        map.set(detail.session_id, existing);
      }
    }
    return map;
  }, [overviewData]);

  // volunteer_id -> number of assignments across all sessions
  const volunteerAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const taskOverview of overviewData?.items ?? []) {
      for (const detail of taskOverview.sessions) {
        for (const vol of detail.assigned_volunteers) {
          counts.set(vol.volunteer_id, (counts.get(vol.volunteer_id) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [overviewData]);

  // Grid positions
  const slots = gridData?.slots ?? [];
  const tracks = gridData?.tracks ?? [];
  const sessions = gridData?.sessions ?? [];

  const { sortedSlots, sortedTracks, occupiedCells, sessionVisualSegments } = useGridPositions(
    slots,
    tracks,
    sessions
  );

  // ---------- Mutations ----------

  const assignMutation = useMutation({
    mutationFn: async (data: { session_volunteer_task_id: string; volunteer_id: string }) => {
      await api.post(`/conferences/${conference.id}/volunteer-tasks/volunteer-assignments`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-tasks', conference.id] });
      queryClient.invalidateQueries({ queryKey: ['volunteer-assignments', conference.id] });
      queryClient.invalidateQueries({ queryKey: ['volunteer-schedule', conference.id] });
      queryClient.invalidateQueries({ queryKey: ['volunteer-schedule-unassigned', conference.id] });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.delete(
        `/conferences/${conference.id}/volunteer-tasks/volunteer-assignments/${assignmentId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-tasks', conference.id] });
      queryClient.invalidateQueries({ queryKey: ['volunteer-assignments', conference.id] });
      queryClient.invalidateQueries({ queryKey: ['volunteer-schedule', conference.id] });
      queryClient.invalidateQueries({ queryKey: ['volunteer-schedule-unassigned', conference.id] });
    },
  });

  const colorMutation = useMutation({
    mutationFn: async ({ volunteerId, color }: { volunteerId: string; color: string }) => {
      await api.patch(
        `/conferences/${conference.id}/volunteer-tasks/volunteers/${volunteerId}/color`,
        { color }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteer-assignments', conference.id] });
      queryClient.invalidateQueries({ queryKey: ['conference-volunteers-list', conference.id] });
    },
  });

  const handleColorCycle = (volunteerId: string, currentColor: string | null) => {
    const currentIdx = PRESET_COLORS.indexOf(currentColor || '');
    const nextColor = PRESET_COLORS[(currentIdx + 1) % PRESET_COLORS.length];
    colorMutation.mutate({ volunteerId, color: nextColor });
  };

  // ---------- Drag and Drop ----------

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type: string; volunteer: Volunteer } | undefined;
    if (data?.type === 'volunteer') {
      setActiveDragData(data);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragData(null);
    const { active, over } = event;
    if (!over || !active.data.current) return;
    const dragData = active.data.current as { type: string; volunteer: Volunteer };
    const dropData = over.data.current as { sessionId: string } | undefined;
    if (!dropData?.sessionId || dragData.type !== 'volunteer') return;

    const sessionId = dropData.sessionId;
    const volunteer = dragData.volunteer;
    const tasks = sessionTaskMap.get(sessionId) ?? [];

    if (tasks.length === 0) return; // No tasks — drop disabled but defensive check

    if (tasks.length === 1) {
      // Single task — auto-assign (check for duplicates)
      const svtId = tasks[0].id;
      const assignments = sessionAssignmentMap.get(sessionId) ?? [];
      const detail = assignments.find((d) => d.session_volunteer_task_id === svtId);
      if (detail?.assigned_volunteers.some((v) => v.volunteer_id === volunteer.id)) {
        return; // Already assigned
      }
      assignMutation.mutate({
        session_volunteer_task_id: svtId,
        volunteer_id: volunteer.id,
      });
    } else {
      // Multiple tasks — open task picker modal
      setPendingDrop({ sessionId, volunteer });
      setShowTaskPicker(true);
    }
  };

  // ---------- Session click → detail modal ----------

  const handleSessionClick = (sessionId: string, sessionTitle: string) => {
    setSelectedSessionId(sessionId);
    setSelectedSessionTitle(sessionTitle);
    setShowDetailModal(true);
  };

  // ---------- Render ----------

  if (daysLoading) return <LoadingSpinner />;

  if (!days.length) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium">No program days configured</p>
        <p className="mt-1">Set up the program first in the Program Design tab.</p>
      </div>
    );
  }

  // Filtered volunteers for sidebar
  const allVolunteers = volunteersData ?? [];
  const filteredVolunteers = searchQuery
    ? allVolunteers.filter((v) => v.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allVolunteers;

  // Data for task picker modal
  const pendingSessionTasks = pendingDrop ? (sessionTaskMap.get(pendingDrop.sessionId) ?? []) : [];
  const pendingSessionAssignments = pendingDrop
    ? (sessionAssignmentMap.get(pendingDrop.sessionId) ?? [])
    : [];

  // Data for detail modal
  const detailTasks = selectedSessionId ? (sessionTaskMap.get(selectedSessionId) ?? []) : [];
  const detailAssignments = selectedSessionId
    ? (sessionAssignmentMap.get(selectedSessionId) ?? [])
    : [];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4">
        {/* ---- Left sidebar: draggable volunteers ---- */}
        {isAdmin && (
          <div className="w-55 shrink-0">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Volunteers
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Drag a volunteer onto a session to assign.
            </p>
            <input
              type="text"
              placeholder="Search volunteers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full mb-3 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {filteredVolunteers.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-4">
                {allVolunteers.length === 0
                  ? 'No volunteers found for this conference.'
                  : 'No volunteers match your search.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredVolunteers.map((vol) => (
                  <DraggableVolunteerItem
                    key={vol.id}
                    volunteer={vol}
                    assignmentCount={volunteerAssignmentCounts.get(vol.id) ?? 0}
                    isAdmin={isAdmin}
                    onColorCycle={handleColorCycle}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Right area: day tabs + program grid ---- */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Volunteer Assignment
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isAdmin
                ? 'Drag volunteers from the sidebar onto sessions, or click a session to manage assignments.'
                : 'View volunteer assignments across program sessions.'}
            </p>
          </div>

          {/* Day tabs */}
          <div className="flex space-x-1 mb-4 border-b border-gray-200 dark:border-gray-700">
            {days.map((day) => (
              <button
                key={day.id}
                onClick={() => setSelectedDayId(day.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeDayId === day.id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-b-2 border-primary-500'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {day.name || `Day ${day.sort_order + 1}`}
              </button>
            ))}
          </div>

          {gridLoading ? (
            <LoadingSpinner />
          ) : !sortedSlots.length ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No time slots configured for this day.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="grid min-w-max relative"
                style={{
                  gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${sortedTracks.length}, ${GRID_CELL_WIDTH}px)`,
                  gridTemplateRows: `48px repeat(${sortedSlots.length}, ${GRID_CELL_HEIGHT}px)`,
                }}
              >
                {/* Header row: empty corner cell */}
                <div className="sticky top-0 left-0 z-20 bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-300 dark:border-gray-600 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Time
                  </span>
                </div>

                {/* Header row: track names */}
                {sortedTracks.map((track) => (
                  <div
                    key={track.id}
                    className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-300 dark:border-gray-600 flex items-center justify-center px-2"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: track.color || '#9CA3AF' }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {track.name}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Time slot labels + empty background cells */}
                {sortedSlots.map((slot, slotIndex) => (
                  <React.Fragment key={slot.id}>
                    {/* Time label */}
                    <div
                      className={`sticky left-0 z-10 border-b border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center px-2 ${
                        slot.is_session_free
                          ? 'bg-amber-50 dark:bg-amber-900/30'
                          : 'bg-gray-50 dark:bg-gray-900'
                      }`}
                      style={{ gridRow: slotIndex + 2, gridColumn: 1 }}
                    >
                      <span
                        className={`text-xs font-medium ${
                          slot.is_session_free
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {formatTime(slot.start_time)}
                      </span>
                      <span
                        className={`text-xs ${
                          slot.is_session_free
                            ? 'text-amber-500'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {formatTime(slot.end_time)}
                      </span>
                      {slot.is_session_free && (
                        <span className="text-[9px] text-amber-600 font-medium mt-0.5">BREAK</span>
                      )}
                    </div>

                    {/* Empty track cells */}
                    {sortedTracks.map((track, trackIndex) => {
                      const occupant = occupiedCells.get(`${slotIndex}-${trackIndex}`);
                      const sessionFreeStyle = slot.is_session_free
                        ? {
                            backgroundImage:
                              'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(251, 191, 36, 0.15) 5px, rgba(251, 191, 36, 0.15) 10px)',
                          }
                        : {};

                      return (
                        <div
                          key={`cell-${slot.id}-${track.id}`}
                          className={`border-b border-r border-gray-200 dark:border-gray-700 ${
                            occupant
                              ? ''
                              : slot.is_session_free
                                ? 'bg-amber-50/50 dark:bg-amber-900/20'
                                : 'bg-white dark:bg-gray-800'
                          }`}
                          style={{
                            gridRow: slotIndex + 2,
                            gridColumn: trackIndex + 2,
                            ...sessionFreeStyle,
                          }}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}

                {/* Session cards — visual segments */}
                {sessionVisualSegments.map((seg) => {
                  const tasks = sessionTaskMap.get(seg.session.id) ?? [];
                  const assignments = sessionAssignmentMap.get(seg.session.id) ?? [];
                  return (
                    <DroppableVolunteerSessionCell
                      key={seg.segmentKey}
                      segment={seg}
                      sessionTasks={tasks}
                      sessionAssignments={assignments}
                      onClick={() => handleSessionClick(seg.session.id, seg.session.title)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay — floating badge */}
      <DragOverlay>
        {activeDragData ? (
          <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-lg">
            {activeDragData.volunteer.full_name}
          </div>
        ) : null}
      </DragOverlay>

      {/* Task Picker Modal — shown when dropping on a multi-task session */}
      {showTaskPicker && pendingDrop && (
        <Modal
          open={showTaskPicker}
          onClose={() => {
            setShowTaskPicker(false);
            setPendingDrop(null);
          }}
          title={`Assign ${pendingDrop.volunteer.full_name} to task`}
        >
          <div className="px-6 py-4 space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              This session has multiple tasks. Choose which task to assign:
            </p>
            {pendingSessionTasks.map((task) => {
              // Check if volunteer is already assigned to this task
              const detail = pendingSessionAssignments.find(
                (d) => d.session_volunteer_task_id === task.id
              );
              const alreadyAssigned = detail?.assigned_volunteers.some(
                (v) => v.volunteer_id === pendingDrop.volunteer.id
              );
              const assigned = detail ? detail.assigned_volunteers.length : task.assigned_count;

              return (
                <button
                  key={task.id}
                  disabled={alreadyAssigned || assignMutation.isPending}
                  onClick={() => {
                    assignMutation.mutate(
                      {
                        session_volunteer_task_id: task.id,
                        volunteer_id: pendingDrop.volunteer.id,
                      },
                      {
                        onSuccess: () => {
                          setShowTaskPicker(false);
                          setPendingDrop(null);
                        },
                      }
                    );
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    alreadyAssigned
                      ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {task.volunteer_task_name}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        assigned >= task.required_count
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {assigned}/{task.required_count}
                    </span>
                  </div>
                  {alreadyAssigned && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Already assigned
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Session Detail Modal — on click */}
      {showDetailModal && selectedSessionId && (
        <Modal
          open={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedSessionId(null);
          }}
          title={selectedSessionTitle}
        >
          <div className="px-6 py-4 space-y-4">
            {detailTasks.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                No tasks assigned to this session. Assign tasks in the Task Assignment tab first.
              </p>
            ) : (
              detailTasks.map((task) => {
                const detail = detailAssignments.find(
                  (d) => d.session_volunteer_task_id === task.id
                );
                const assignedVols: AssignedVolunteerBrief[] = detail?.assigned_volunteers ?? [];
                const assigned = assignedVols.length;
                const isFull = assigned >= task.required_count;

                // Volunteers not yet assigned to this task
                const assignedIds = new Set(assignedVols.map((v) => v.volunteer_id));
                const availableVols = allVolunteers.filter((v) => !assignedIds.has(v.id));

                return (
                  <div key={task.id}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {task.volunteer_task_name}
                      </h4>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isFull
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {assigned}/{task.required_count}
                      </span>
                    </div>

                    {/* Assigned volunteers list */}
                    {assignedVols.length > 0 ? (
                      <div className="space-y-1 mb-2">
                        {assignedVols.map((vol) => (
                          <div
                            key={vol.assignment_id}
                            className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full shrink-0 border border-gray-300 dark:border-gray-500"
                                style={{
                                  backgroundColor: vol.volunteer_color || '#9CA3AF',
                                }}
                              />
                              <span className="text-sm text-gray-800 dark:text-gray-200">
                                {vol.volunteer_name}
                              </span>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => unassignMutation.mutate(vol.assignment_id)}
                                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                                title="Remove"
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
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic mb-2">
                        No volunteers assigned yet.
                      </p>
                    )}

                    {/* Add volunteer dropdown */}
                    {isAdmin && !isFull && availableVols.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            assignMutation.mutate({
                              session_volunteer_task_id: task.id,
                              volunteer_id: e.target.value,
                            });
                          }
                        }}
                        className="text-sm border border-gray-300 dark:border-gray-600 rounded-md py-1 px-2 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">+ Add volunteer...</option>
                        {availableVols.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.full_name}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Separator between tasks */}
                    <hr className="mt-3 border-gray-200 dark:border-gray-700" />
                  </div>
                );
              })
            )}
          </div>
        </Modal>
      )}
    </DndContext>
  );
}
