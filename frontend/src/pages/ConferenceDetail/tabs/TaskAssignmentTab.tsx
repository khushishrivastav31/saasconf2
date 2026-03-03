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
import { queryKeys } from '../../../config/queryKeys';
import type { Conference, VolunteerRole } from '../../../types';
import type { SessionVolunteerTask, SessionTasksBrief } from '../../../types/volunteer';
import type { SessionVisualSegment } from './ProgramDesignTab/hooks/useGridPositions';
import { useProgramDays, useProgramGrid } from './ProgramDesignTab/hooks/useProgramGrid';
import { useGridPositions } from './ProgramDesignTab/hooks/useGridPositions';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import Modal from '../../../components/Modal';

// Grid dimensions
const GRID_CELL_HEIGHT = 80;
const GRID_CELL_WIDTH = 150;
const TIME_COL_WIDTH = 80;

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// DraggableTaskItem — sidebar draggable volunteer task
// ---------------------------------------------------------------------------
interface DraggableTaskItemProps {
  task: VolunteerRole;
  sessionCount: number;
}

function DraggableTaskItem({ task, sessionCount }: DraggableTaskItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'task', task },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${
        isDragging
          ? 'opacity-50 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30'
          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-600'
      }`}
    >
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
        {task.name}
      </span>
      <span className="ml-2 shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
        {sessionCount}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DroppableSessionCell — a session card rendered inside the grid as a drop target
// ---------------------------------------------------------------------------
interface DroppableSessionCellProps {
  segment: SessionVisualSegment;
  tasks: SessionVolunteerTask[];
  onClick: () => void;
}

function DroppableSessionCell({ segment, tasks, onClick }: DroppableSessionCellProps) {
  const { session } = segment;
  const { setNodeRef, isOver } = useDroppable({
    id: segment.segmentKey,
    data: { sessionId: session.id },
  });

  const bgColor = session.is_general_event
    ? session.color || '#6B7280'
    : session.color || '#3B82F6';
  const hasTasks = tasks.length > 0;

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
        isOver ? 'ring-2 ring-blue-500' : ''
      }`}
      onClick={onClick}
    >
      <div
        className="h-full flex flex-col rounded-md overflow-hidden p-1.5"
        style={{ backgroundColor: isOver ? undefined : bgColor }}
      >
        <h4 className="text-xs font-medium leading-tight truncate">{session.title}</h4>
        {session.speaker_name && (
          <p className="text-xs opacity-80 leading-tight truncate">{session.speaker_name}</p>
        )}
        {hasTasks && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tasks.map((task) => (
              <span
                key={task.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/25 text-white"
              >
                {task.volunteer_task_name}
                <span className="ml-1 opacity-75">
                  ({task.assigned_count}/{task.required_count})
                </span>
              </span>
            ))}
          </div>
        )}
        {!hasTasks && <p className="mt-1 text-[10px] text-white/70 italic">No tasks assigned</p>}
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
// TaskAssignmentTab
// ---------------------------------------------------------------------------
export default function TaskAssignmentTab({ conference, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionTitle, setSelectedSessionTitle] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskId, setNewTaskId] = useState('');
  const [newRequiredCount, setNewRequiredCount] = useState(1);
  const [activeDragData, setActiveDragData] = useState<{
    type: string;
    task: VolunteerRole;
  } | null>(null);

  // DnD sensors — distance constraint so clicks are not confused with drags
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Fetch program days
  const { data: daysData, isLoading: daysLoading } = useProgramDays({
    conferenceId: conference.id,
  });
  const days = daysData?.items ?? [];

  // Auto-select first day
  const activeDayId = selectedDayId ?? days[0]?.id ?? null;

  // Fetch grid for selected day
  const { data: gridData, isLoading: gridLoading } = useProgramGrid({
    conferenceId: conference.id,
    dayId: activeDayId,
  });

  // Fetch session-task assignments for the conference
  const { data: sessionTasksData } = useQuery({
    queryKey: queryKeys.volunteers.sessionTasks(conference.id),
    queryFn: async () => {
      const res = await api.get<{ items: SessionTasksBrief[]; total: number }>(
        `/conferences/${conference.id}/volunteer-tasks/session-tasks`
      );
      return res.data;
    },
  });

  // Fetch volunteer roles (task definitions) for the dropdown
  const { data: rolesData } = useQuery({
    queryKey: queryKeys.volunteers.roles(conference.id),
    queryFn: async () => {
      const res = await api.get<{ items: VolunteerRole[]; total: number }>(
        `/conferences/${conference.id}/settings/volunteer-roles`
      );
      return res.data;
    },
  });
  const volunteerTasks = (rolesData?.items ?? []).filter((t) => t.is_active);

  // Build a map: session_id -> tasks
  const sessionTaskMap = useMemo(() => {
    const map = new Map<string, SessionVolunteerTask[]>();
    for (const item of sessionTasksData?.items ?? []) {
      map.set(item.session_id, item.tasks);
    }
    return map;
  }, [sessionTasksData]);

  // Count how many sessions each task is assigned to (for sidebar badge)
  const taskSessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [, tasks] of sessionTaskMap) {
      const seen = new Set<string>();
      for (const t of tasks) {
        if (!seen.has(t.volunteer_task_id)) {
          seen.add(t.volunteer_task_id);
          counts.set(t.volunteer_task_id, (counts.get(t.volunteer_task_id) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [sessionTaskMap]);

  // Use shared hook for grid positions
  const slots = gridData?.slots ?? [];
  const tracks = gridData?.tracks ?? [];
  const sessions = gridData?.sessions ?? [];

  const { sortedSlots, sortedTracks, occupiedCells, sessionVisualSegments } = useGridPositions(
    slots,
    tracks,
    sessions
  );

  // Mutations
  const addTaskMutation = useMutation({
    mutationFn: async (data: {
      session_id: string;
      volunteer_task_id: string;
      required_count: number;
    }) => {
      await api.post(`/conferences/${conference.id}/volunteer-tasks/session-tasks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.sessionTasks(conference.id),
      });
      setNewTaskId('');
      setNewRequiredCount(1);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ svtId, required_count }: { svtId: string; required_count: number }) => {
      await api.put(`/conferences/${conference.id}/volunteer-tasks/session-tasks/${svtId}`, {
        required_count,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.sessionTasks(conference.id),
      });
    },
  });

  const removeTaskMutation = useMutation({
    mutationFn: async (svtId: string) => {
      await api.delete(`/conferences/${conference.id}/volunteer-tasks/session-tasks/${svtId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.sessionTasks(conference.id),
      });
    },
  });

  const handleSessionClick = (sessionId: string, sessionTitle: string) => {
    if (!isAdmin) return;
    setSelectedSessionId(sessionId);
    setSelectedSessionTitle(sessionTitle);
    setShowTaskModal(true);
  };

  const handleAddTask = () => {
    if (!selectedSessionId || !newTaskId) return;
    addTaskMutation.mutate({
      session_id: selectedSessionId,
      volunteer_task_id: newTaskId,
      required_count: newRequiredCount,
    });
  };

  // Drag-and-drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type: string; task: VolunteerRole } | undefined;
    if (data?.type === 'task') {
      setActiveDragData(data);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragData(null);
    const { active, over } = event;
    if (!over || !active.data.current) return;
    const dragData = active.data.current as { type: string; task: VolunteerRole };
    const dropData = over.data.current as { sessionId: string } | undefined;
    if (!dropData?.sessionId || dragData.type !== 'task') return;
    // Check if task already assigned to this session
    const existingTasks = sessionTaskMap.get(dropData.sessionId) ?? [];
    if (existingTasks.some((t) => t.volunteer_task_id === dragData.task.id)) return;
    addTaskMutation.mutate({
      session_id: dropData.sessionId,
      volunteer_task_id: dragData.task.id,
      required_count: 1,
    });
  };

  if (daysLoading) return <LoadingSpinner />;

  if (!days.length) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium">No program days configured</p>
        <p className="mt-1">Set up the program first in the Program Design tab.</p>
      </div>
    );
  }

  // Get already-assigned task IDs for the selected session (modal)
  const selectedSessionTasks = selectedSessionId
    ? (sessionTaskMap.get(selectedSessionId) ?? [])
    : [];
  const assignedTaskIds = new Set(selectedSessionTasks.map((t) => t.volunteer_task_id));
  const availableTasks = volunteerTasks.filter((t) => !assignedTaskIds.has(t.id));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4">
        {/* Left sidebar — draggable volunteer tasks */}
        {isAdmin && (
          <div className="w-50 shrink-0">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Volunteer Tasks
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Drag a task onto a session to assign it.
            </p>
            {volunteerTasks.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                No volunteer tasks defined. Go to Settings &gt; Volunteer Tasks to create some.
              </p>
            ) : (
              <div className="space-y-2">
                {volunteerTasks.map((task) => (
                  <DraggableTaskItem
                    key={task.id}
                    task={task}
                    sessionCount={taskSessionCounts.get(task.id) ?? 0}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right area — day tabs + program grid */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Task Assignment
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isAdmin
                ? 'Drag tasks from the sidebar onto sessions, or click a session to manage tasks.'
                : 'Sessions without tasks are highlighted with a dashed border.'}
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

                    {/* Empty track cells for this slot (underneath session cards) */}
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

                {/* Session cards — visual segments from useGridPositions */}
                {sessionVisualSegments.map((seg) => {
                  const tasks = sessionTaskMap.get(seg.session.id) ?? [];
                  return (
                    <DroppableSessionCell
                      key={seg.segmentKey}
                      segment={seg}
                      tasks={tasks}
                      onClick={() => handleSessionClick(seg.session.id, seg.session.title)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay — floating badge showing the task being dragged */}
      <DragOverlay>
        {activeDragData ? (
          <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-lg">
            {activeDragData.task.name}
          </div>
        ) : null}
      </DragOverlay>

      {/* Task Assignment Modal */}
      {showTaskModal && selectedSessionId && (
        <Modal
          open={showTaskModal}
          onClose={() => {
            setShowTaskModal(false);
            setSelectedSessionId(null);
          }}
          title={`Tasks for: ${selectedSessionTitle}`}
        >
          <div className="px-6 py-4 space-y-4">
            {/* Current tasks */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Assigned Tasks
              </h4>
              {selectedSessionTasks.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  No tasks assigned yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedSessionTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2"
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {task.volunteer_task_name}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {task.assigned_count}/{task.required_count} assigned
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Need:</label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={task.required_count}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (val >= 1) {
                              updateTaskMutation.mutate({
                                svtId: task.id,
                                required_count: val,
                              });
                            }
                          }}
                          className="w-14 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-100"
                        />
                        {isAdmin && (
                          <button
                            onClick={() => removeTaskMutation.mutate(task.id)}
                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new task */}
            {isAdmin && availableTasks.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Add Task
                </h4>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <select
                      value={newTaskId}
                      onChange={(e) => setNewTaskId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="">Select a task...</option>
                      {availableTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Volunteers needed
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={newRequiredCount}
                      onChange={(e) => setNewRequiredCount(parseInt(e.target.value) || 1)}
                      className="w-20 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <button
                    onClick={handleAddTask}
                    disabled={!newTaskId || addTaskMutation.isPending}
                    className="px-4 py-2 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 disabled:opacity-50"
                  >
                    {addTaskMutation.isPending ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            )}
            {isAdmin && availableTasks.length === 0 && volunteerTasks.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic border-t border-gray-200 dark:border-gray-600 pt-4">
                All available tasks have been assigned to this session.
              </p>
            )}
            {volunteerTasks.length === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400 border-t border-gray-200 dark:border-gray-600 pt-4">
                No volunteer tasks defined. Go to Settings &gt; Volunteer Tasks to create some.
              </p>
            )}
          </div>
        </Modal>
      )}
    </DndContext>
  );
}
