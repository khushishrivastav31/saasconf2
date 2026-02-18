import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { ProgramTimeSlot, ProgramTrack, ProgramSession } from '../../../../types';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import SessionCard from './SessionCard';

interface ProgramGridProps {
  slots: ProgramTimeSlot[];
  tracks: ProgramTrack[];
  sessions: ProgramSession[];
  onSessionClick: (session: ProgramSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onUnassignPaper?: (sessionId: string) => void;
  onResizeSession?: (sessionId: string, slotSpan: number, trackSpan: number) => void;
  onUpdateSlot?: (
    slotId: string,
    data: { start_time?: string; end_time?: string; is_session_free?: boolean }
  ) => void;
  onDeleteSlot?: (slotId: string) => void;
  onUpdateTrack?: (
    trackId: string,
    data: { name?: string; color?: string; location_id?: string; is_active?: boolean }
  ) => void;
  onDeleteTrack?: (trackId: string) => void;
  onMergeCells?: (data: {
    start_slot_id: string;
    start_track_id: string;
    slot_span: number;
    track_span: number;
    sessionId?: string;
    spansBreakSlot?: boolean;
    visibleCells?: Array<{ slot_id: string; track_id: string }>;
  }) => void;
  onAddTrack?: () => void;
  onAddSlot?: () => void;
  isAdmin: boolean;
  isDroppable?: boolean;
  activeSessionId?: string | null;
}

const GRID_CELL_HEIGHT = 80;
const GRID_CELL_WIDTH = 150;
const TIME_COL_WIDTH = 80;

function getCellFromPosition(
  clientX: number,
  clientY: number,
  gridEl: HTMLDivElement,
  numSlots: number,
  numTracks: number
): { slotIndex: number; trackIndex: number } | null {
  const rect = gridEl.getBoundingClientRect();
  const x = clientX - rect.left + gridEl.scrollLeft;
  const y = clientY - rect.top + gridEl.scrollTop;

  const trackX = x - TIME_COL_WIDTH;
  const slotY = y - 48; // HEADER_ROW_HEIGHT

  if (trackX < 0 || slotY < 0) return null;

  const trackIndex = Math.min(Math.floor(trackX / GRID_CELL_WIDTH), numTracks - 1);
  const slotIndex = Math.min(Math.floor(slotY / GRID_CELL_HEIGHT), numSlots - 1);

  if (trackIndex < 0 || slotIndex < 0) return null;

  return { slotIndex, trackIndex };
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':');
  return `${hours}:${minutes}`;
}

interface GridCellProps {
  slotId: string;
  trackId: string | null;
  trackIndex: number;
  slotIndex: number;
  isAdmin: boolean;
  isDroppable: boolean;
  isSessionFree: boolean;
  isMarked?: boolean;
}

// Inline time slot editor component
interface TimeSlotCellProps {
  slot: ProgramTimeSlot;
  slotIndex: number;
  isAdmin: boolean;
  onUpdate?: (
    slotId: string,
    data: { start_time?: string; end_time?: string; is_session_free?: boolean }
  ) => void;
  onDelete?: (slotId: string) => void;
}

function TimeSlotCell({ slot, slotIndex, isAdmin, onUpdate, onDelete }: TimeSlotCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [startTime, setStartTime] = useState(formatTime(slot.start_time));
  const [endTime, setEndTime] = useState(formatTime(slot.end_time));
  const [isSessionFree, setIsSessionFree] = useState(slot.is_session_free);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync state when slot changes
  useEffect(() => {
    setIsSessionFree(slot.is_session_free);
  }, [slot.is_session_free]);

  // Close editor when clicking outside
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (showDeleteConfirm) return; // Don't close while confirm dialog is open
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEditing(false);
        setStartTime(formatTime(slot.start_time));
        setEndTime(formatTime(slot.end_time));
        setIsSessionFree(slot.is_session_free);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, showDeleteConfirm, slot.start_time, slot.end_time, slot.is_session_free]);

  const handleSave = () => {
    const hasTimeChange =
      startTime !== formatTime(slot.start_time) || endTime !== formatTime(slot.end_time);
    const hasSessionFreeChange = isSessionFree !== slot.is_session_free;
    if (onUpdate && (hasTimeChange || hasSessionFreeChange)) {
      onUpdate(slot.id, {
        start_time: startTime,
        end_time: endTime,
        is_session_free: isSessionFree,
      });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setStartTime(formatTime(slot.start_time));
      setEndTime(formatTime(slot.end_time));
      setIsSessionFree(slot.is_session_free);
    }
  };

  if (isEditing && isAdmin) {
    return (
      <>
        <div
          ref={containerRef}
          data-time-slot
          className="sticky left-0 z-20 bg-white border-b border-r border-primary-300 shadow-lg p-1"
          style={{ gridRow: slotIndex + 2, gridColumn: 1 }}
        >
          <div className="flex flex-col gap-1">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500"
            />
            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isSessionFree}
                onChange={(e) => setIsSessionFree(e.target.checked)}
                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 w-3 h-3"
              />
              <span>Break/Lunch</span>
            </label>
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="flex-1 px-1 py-0.5 text-xs text-white bg-primary-600 rounded hover:bg-primary-700"
              >
                Save
              </button>
              <button
                onClick={handleDelete}
                className="px-1 py-0.5 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100"
                title="Delete slot"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Time Slot"
          message="Delete this time slot? Sessions in this slot will be affected."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete?.(slot.id);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </>
    );
  }

  return (
    <div
      data-time-slot
      className={`sticky left-0 z-10 border-b border-r border-gray-200 flex flex-col items-center justify-center px-2 ${
        slot.is_session_free ? 'bg-amber-50' : 'bg-gray-50'
      } ${isAdmin ? 'cursor-pointer hover:bg-gray-100 group' : ''}`}
      style={{ gridRow: slotIndex + 2, gridColumn: 1 }}
      onClick={() => isAdmin && setIsEditing(true)}
      title={
        isAdmin ? 'Click to edit time slot' : slot.is_session_free ? 'Break/Lunch slot' : undefined
      }
    >
      <span
        className={`text-xs font-medium ${slot.is_session_free ? 'text-amber-700' : 'text-gray-700'}`}
      >
        {formatTime(slot.start_time)}
      </span>
      <span className={`text-xs ${slot.is_session_free ? 'text-amber-500' : 'text-gray-400'}`}>
        {formatTime(slot.end_time)}
      </span>
      {slot.is_session_free && (
        <span className="text-[9px] text-amber-600 font-medium mt-0.5">BREAK</span>
      )}
      {isAdmin && !slot.is_session_free && (
        <svg
          className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      )}
    </div>
  );
}

// Inline track header editor component
interface TrackHeaderCellProps {
  track: ProgramTrack;
  isAdmin: boolean;
  onUpdate?: (trackId: string, data: { name?: string; color?: string }) => void;
  onDelete?: (trackId: string) => void;
}

function TrackHeaderCell({ track, isAdmin, onUpdate, onDelete }: TrackHeaderCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState(track.name);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(track.name);
  }, [track.name]);

  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (showDeleteConfirm) return; // Don't close while confirm dialog is open
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEditing(false);
        setName(track.name);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, showDeleteConfirm, track.name]);

  const handleSave = () => {
    if (onUpdate && name.trim() && name.trim() !== track.name) {
      onUpdate(track.id, { name: name.trim() });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') {
      setIsEditing(false);
      setName(track.name);
    }
  };

  if (isEditing && isAdmin) {
    return (
      <>
        <div
          ref={containerRef}
          data-track-header
          className="sticky top-0 z-20 bg-white border-b border-r border-primary-300 shadow-lg p-1"
        >
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="flex-1 px-1 py-0.5 text-xs text-white bg-primary-600 rounded hover:bg-primary-700"
              >
                Save
              </button>
              <button
                onClick={handleDelete}
                className="px-1 py-0.5 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100"
                title="Delete track"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Track"
          message={`Delete track "${track.name}"? Sessions in this track will be affected.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete?.(track.id);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </>
    );
  }

  return (
    <div
      data-track-header
      className={`sticky top-0 z-10 bg-gray-100 border-b border-r border-gray-300 flex items-center justify-center px-2 relative ${
        isAdmin ? 'cursor-pointer hover:bg-gray-200 group' : ''
      }`}
      onClick={() => isAdmin && setIsEditing(true)}
      title={isAdmin ? 'Click to edit track' : undefined}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: track.color || '#9CA3AF' }}
        />
        <span className="text-sm font-medium text-gray-900 truncate">{track.name}</span>
      </div>
      {isAdmin && (
        <svg
          className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      )}
    </div>
  );
}

function GridCell({
  slotId,
  trackId,
  trackIndex,
  slotIndex,
  isAdmin,
  isDroppable: droppable,
  isSessionFree,
  isMarked,
}: GridCellProps) {
  const cellId = trackId ? `${slotId}-${trackId}` : `${slotId}-general`;
  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: { slotId, trackId, slotIndex, trackIndex, isSessionFree },
    disabled: !droppable,
  });

  // Session-free cells have a striped/hatched background pattern
  const sessionFreeStyle = isSessionFree
    ? {
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(251, 191, 36, 0.15) 5px, rgba(251, 191, 36, 0.15) 10px)',
      }
    : {};

  let bgClass: string;
  if (isMarked) {
    bgClass = 'bg-primary-100 border-primary-300';
  } else if (isOver) {
    bgClass = 'bg-primary-100';
  } else if (isSessionFree) {
    bgClass = 'bg-amber-50/50';
  } else {
    bgClass = 'bg-white hover:bg-gray-50';
  }

  return (
    <div
      ref={setNodeRef}
      style={{ gridRow: slotIndex + 2, gridColumn: trackIndex + 2, ...sessionFreeStyle }}
      className={`
        min-h-[80px] border-b border-r border-gray-200 transition-colors
        ${bgClass}
        ${isAdmin ? 'cursor-pointer' : ''}
      `}
      title={
        isSessionFree ? 'Break/Lunch slot - sessions with override can be placed here' : undefined
      }
    />
  );
}

export default function ProgramGrid({
  slots,
  tracks,
  sessions,
  onSessionClick,
  onDeleteSession,
  onUnassignPaper,
  onResizeSession,
  onUpdateSlot,
  onDeleteSlot,
  onUpdateTrack,
  onDeleteTrack,
  onMergeCells,
  onAddTrack,
  onAddSlot,
  isAdmin,
  isDroppable: isDroppableProp,
  activeSessionId,
}: ProgramGridProps) {
  const droppable = isDroppableProp ?? isAdmin;
  // Sort slots by start time
  const sortedSlots = useMemo(() => {
    return [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [slots]);

  // Sort tracks by sort_order
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => a.sort_order - b.sort_order);
  }, [tracks]);

  // Build a map of slot index for quick lookup
  const slotIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedSlots.forEach((slot, index) => {
      map.set(slot.id, index);
    });
    return map;
  }, [sortedSlots]);

  // Build a map of track index for quick lookup
  const trackIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedTracks.forEach((track, index) => {
      map.set(track.id, index);
    });
    return map;
  }, [sortedTracks]);

  // Calculate session positions
  const sessionPositions = useMemo(() => {
    return sessions
      .map((session) => {
        const slotIndex = slotIndexMap.get(session.start_slot_id);
        const trackIndex = session.start_track_id
          ? trackIndexMap.get(session.start_track_id)
          : null;

        if (slotIndex === undefined) {
          return null;
        }

        // For general events (spanning all tracks)
        const isGeneral =
          session.is_general_event || session.track_span === 0 || !session.start_track_id;

        return {
          session,
          gridRowStart: slotIndex + 2, // +2 for header row (1-indexed)
          gridRowEnd: slotIndex + 2 + session.slot_span,
          gridColumnStart: isGeneral
            ? 2
            : trackIndex !== undefined && trackIndex !== null
              ? trackIndex + 2
              : 2,
          gridColumnEnd: isGeneral
            ? sortedTracks.length + 2
            : trackIndex !== undefined && trackIndex !== null
              ? trackIndex + 2 + session.track_span
              : 3,
          isGeneral,
        };
      })
      .filter(Boolean);
  }, [sessions, slotIndexMap, trackIndexMap, sortedTracks.length]);

  // Build occupancy map: "slotIndex-trackIndex" -> sessionId
  // Sessions with visible_cells only occupy those specific cells
  // Two-pass: normal sessions first, then allow_in_session_free sessions fill remaining cells
  const occupiedCells = useMemo(() => {
    const occupied = new Map<string, string>();

    // Helper: get the set of cells a session actually claims
    const getSessionCells = (
      pos: NonNullable<(typeof sessionPositions)[number]>
    ): Array<[number, number]> => {
      const visibleCells = pos.session.settings?.visible_cells as
        | Array<{ slot_id: string; track_id: string }>
        | undefined;
      if (visibleCells && visibleCells.length > 0) {
        // Only the explicitly listed cells
        const cells: Array<[number, number]> = [];
        for (const vc of visibleCells) {
          const si = slotIndexMap.get(vc.slot_id);
          const ti = trackIndexMap.get(vc.track_id);
          if (si !== undefined && ti !== undefined) cells.push([si, ti]);
        }
        return cells;
      }
      // Full rectangular range
      const cells: Array<[number, number]> = [];
      const startSlot = pos.gridRowStart - 2;
      const endSlot = pos.gridRowEnd - 2;
      const startTrack = pos.gridColumnStart - 2;
      const endTrack = pos.gridColumnEnd - 2;
      for (let s = startSlot; s < endSlot; s++) {
        for (let t = startTrack; t < endTrack; t++) {
          cells.push([s, t]);
        }
      }
      return cells;
    };

    // Pass 1: sessions WITHOUT allow_in_session_free claim cells unconditionally
    for (const pos of sessionPositions) {
      if (!pos || pos.session.allow_in_session_free) continue;
      for (const [s, t] of getSessionCells(pos)) {
        occupied.set(`${s}-${t}`, pos.session.id);
      }
    }

    // Pass 2: sessions WITH allow_in_session_free only occupy cells not already taken
    for (const pos of sessionPositions) {
      if (!pos || !pos.session.allow_in_session_free) continue;
      for (const [s, t] of getSessionCells(pos)) {
        const key = `${s}-${t}`;
        if (!occupied.has(key)) {
          occupied.set(key, pos.session.id);
        }
      }
    }

    return occupied;
  }, [sessionPositions, slotIndexMap, trackIndexMap]);

  // Split sessions into visual segments based on visible_cells or occupancy
  const sessionVisualSegments = useMemo(() => {
    const segments: Array<{
      session: ProgramSession;
      gridRowStart: number;
      gridRowEnd: number;
      gridColumnStart: number;
      gridColumnEnd: number;
      isGeneral: boolean;
      isFirstSegment: boolean;
      isLastSegment: boolean;
      segmentKey: string;
    }> = [];

    for (const pos of sessionPositions) {
      if (!pos) continue;
      const startSlotIdx = pos.gridRowStart - 2;
      const endSlotIdx = pos.gridRowEnd - 2; // exclusive
      const startTrackIdx = pos.gridColumnStart - 2;
      const endTrackIdx = pos.gridColumnEnd - 2; // exclusive

      // Check if session has explicit visible_cells in settings
      const visibleCells = pos.session.settings?.visible_cells as
        | Array<{ slot_id: string; track_id: string }>
        | undefined;

      if (visibleCells && visibleCells.length > 0) {
        // Build map: slotIndex -> sorted track indices with visible cells
        const slotTrackMap = new Map<number, number[]>();
        for (const vc of visibleCells) {
          const si = slotIndexMap.get(vc.slot_id);
          const ti = trackIndexMap.get(vc.track_id);
          if (si !== undefined && ti !== undefined) {
            if (!slotTrackMap.has(si)) slotTrackMap.set(si, []);
            slotTrackMap.get(si)!.push(ti);
          }
        }
        for (const tracks of slotTrackMap.values()) {
          tracks.sort((a, b) => a - b);
        }

        // For each slot row, group consecutive tracks into horizontal ranges,
        // then merge vertically-adjacent ranges with the same track span
        type SegRect = { startSlot: number; endSlot: number; startTrack: number; endTrack: number };
        const rects: SegRect[] = [];
        const sortedSlotIndices = [...slotTrackMap.keys()].sort((a, b) => a - b);

        for (const si of sortedSlotIndices) {
          const tracks = slotTrackMap.get(si)!;
          // Group consecutive track indices into ranges
          let rangeStart = tracks[0];
          let prev = tracks[0];
          for (let i = 1; i <= tracks.length; i++) {
            if (i < tracks.length && tracks[i] === prev + 1) {
              prev = tracks[i];
            } else {
              // Close current range: [rangeStart, prev+1)
              // Try to extend an existing rectangle that ends at this slot row
              const mergeable = rects.find(
                (r) => r.endSlot === si && r.startTrack === rangeStart && r.endTrack === prev + 1
              );
              if (mergeable) {
                mergeable.endSlot = si + 1;
              } else {
                rects.push({
                  startSlot: si,
                  endSlot: si + 1,
                  startTrack: rangeStart,
                  endTrack: prev + 1,
                });
              }
              if (i < tracks.length) {
                rangeStart = tracks[i];
                prev = tracks[i];
              }
            }
          }
        }

        if (rects.length === 0) {
          segments.push({
            ...pos,
            isFirstSegment: true,
            isLastSegment: true,
            segmentKey: pos.session.id,
          });
        } else {
          rects.forEach((rect, idx) => {
            segments.push({
              session: pos.session,
              gridRowStart: rect.startSlot + 2,
              gridRowEnd: rect.endSlot + 2,
              gridColumnStart: rect.startTrack + 2,
              gridColumnEnd: rect.endTrack + 2,
              isGeneral: pos.isGeneral,
              isFirstSegment: idx === 0,
              isLastSegment: idx === rects.length - 1,
              segmentKey: `${pos.session.id}-seg${idx}`,
            });
          });
        }
      } else if (pos.session.allow_in_session_free && pos.session.slot_span > 1) {
        // Fallback: split around cells occupied by other sessions
        let segStart = startSlotIdx;
        const segmentRanges: Array<{ start: number; end: number }> = [];

        for (let s = startSlotIdx; s < endSlotIdx; s++) {
          let slotBlocked = true;
          for (let t = startTrackIdx; t < endTrackIdx; t++) {
            const occupant = occupiedCells.get(`${s}-${t}`);
            if (!occupant || occupant === pos.session.id) {
              slotBlocked = false;
              break;
            }
          }

          if (slotBlocked) {
            if (s > segStart) {
              segmentRanges.push({ start: segStart, end: s });
            }
            segStart = s + 1;
          }
        }
        if (segStart < endSlotIdx) {
          segmentRanges.push({ start: segStart, end: endSlotIdx });
        }

        if (segmentRanges.length === 0) {
          segments.push({
            ...pos,
            isFirstSegment: true,
            isLastSegment: true,
            segmentKey: pos.session.id,
          });
        } else {
          segmentRanges.forEach((range, idx) => {
            segments.push({
              session: pos.session,
              gridRowStart: range.start + 2,
              gridRowEnd: range.end + 2,
              gridColumnStart: pos.gridColumnStart,
              gridColumnEnd: pos.gridColumnEnd,
              isGeneral: pos.isGeneral,
              isFirstSegment: idx === 0,
              isLastSegment: idx === segmentRanges.length - 1,
              segmentKey: `${pos.session.id}-seg${idx}`,
            });
          });
        }
      } else {
        segments.push({
          ...pos,
          isFirstSegment: true,
          isLastSegment: true,
          segmentKey: pos.session.id,
        });
      }
    }
    return segments;
  }, [sessionPositions, occupiedCells, slotIndexMap, trackIndexMap]);

  // --- Cell marking & merge ---
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [markedCells, setMarkedCells] = useState<Set<string>>(new Set());

  // Compute bounding rectangle from marked cells
  const selectedRect = useMemo(() => {
    if (markedCells.size === 0) return null;
    let minSlotIndex = Infinity,
      maxSlotIndex = -Infinity;
    let minTrackIndex = Infinity,
      maxTrackIndex = -Infinity;
    for (const key of markedCells) {
      const [s, t] = key.split('-').map(Number);
      if (s < minSlotIndex) minSlotIndex = s;
      if (s > maxSlotIndex) maxSlotIndex = s;
      if (t < minTrackIndex) minTrackIndex = t;
      if (t > maxTrackIndex) maxTrackIndex = t;
    }
    return { minSlotIndex, maxSlotIndex, minTrackIndex, maxTrackIndex };
  }, [markedCells]);

  // Analyze selection: empty (new session) or extendable (one session fully inside)
  const selectionAnalysis = useMemo<
    { type: 'none' } | { type: 'valid_empty' } | { type: 'valid_extend'; session: ProgramSession }
  >(() => {
    if (!selectedRect) return { type: 'none' };

    // Collect unique session IDs overlapping the bounding rectangle
    const overlappingIds = new Set<string>();
    for (let s = selectedRect.minSlotIndex; s <= selectedRect.maxSlotIndex; s++) {
      for (let t = selectedRect.minTrackIndex; t <= selectedRect.maxTrackIndex; t++) {
        const sessionId = occupiedCells.get(`${s}-${t}`);
        if (sessionId) overlappingIds.add(sessionId);
      }
    }

    if (overlappingIds.size === 0) return { type: 'valid_empty' };

    // Exactly one session overlaps — check if it is fully contained (extend case)
    if (overlappingIds.size === 1) {
      const sessionId = [...overlappingIds][0];
      const pos = sessionPositions.find((p) => p?.session.id === sessionId);
      if (pos) {
        const sessionMinSlot = pos.gridRowStart - 2;
        const sessionMaxSlot = pos.gridRowEnd - 3;
        const sessionMinTrack = pos.gridColumnStart - 2;
        const sessionMaxTrack = pos.gridColumnEnd - 3;

        const fullyContained =
          sessionMinSlot >= selectedRect.minSlotIndex &&
          sessionMaxSlot <= selectedRect.maxSlotIndex &&
          sessionMinTrack >= selectedRect.minTrackIndex &&
          sessionMaxTrack <= selectedRect.maxTrackIndex;

        if (fullyContained) return { type: 'valid_extend', session: pos.session };
      }
    }

    return { type: 'valid_empty' };
  }, [selectedRect, occupiedCells, sessionPositions]);

  const isMultiCellSelection = markedCells.size > 1;

  // Check if other sessions exist within the bounding rectangle (auto-set allow_in_session_free)
  const selectionHasObstacles = useMemo(() => {
    if (!selectedRect) return false;
    const extendingId =
      selectionAnalysis.type === 'valid_extend' ? selectionAnalysis.session.id : null;
    for (let s = selectedRect.minSlotIndex; s <= selectedRect.maxSlotIndex; s++) {
      for (let t = selectedRect.minTrackIndex; t <= selectedRect.maxTrackIndex; t++) {
        const occupant = occupiedCells.get(`${s}-${t}`);
        if (occupant && occupant !== extendingId) return true;
      }
    }
    return false;
  }, [selectedRect, occupiedCells, selectionAnalysis]);

  // Click handler: toggle individual cells in the marked set
  const handleGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isAdmin || !gridRef.current) return;
      // Don't handle if clicking on a session card, button, or input
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-session-card]') ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select')
      )
        return;
      // Don't handle clicks on the time slot column or track headers (they are sticky and coordinate checks break when scrolled)
      if (target.closest('[data-time-slot]') || target.closest('[data-track-header]')) return;

      const cell = getCellFromPosition(
        e.clientX,
        e.clientY,
        gridRef.current,
        sortedSlots.length,
        sortedTracks.length
      );
      if (!cell) return;

      e.preventDefault();
      const key = `${cell.slotIndex}-${cell.trackIndex}`;

      setMarkedCells((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [isAdmin, sortedSlots.length, sortedTracks.length]
  );

  // Clear marked cells on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMarkedCells(new Set());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle merge (create new or extend existing)
  const handleMerge = useCallback(() => {
    if (!selectedRect || !onMergeCells || selectionAnalysis.type === 'none') return;
    const startSlot = sortedSlots[selectedRect.minSlotIndex];
    const startTrack = sortedTracks[selectedRect.minTrackIndex];
    if (!startSlot || !startTrack) return;

    const slotSpan = selectedRect.maxSlotIndex - selectedRect.minSlotIndex + 1;
    const trackSpan = selectedRect.maxTrackIndex - selectedRect.minTrackIndex + 1;

    // Only pass visibleCells when the marked cells don't fill the entire bounding rectangle
    const totalCellsInRect = slotSpan * trackSpan;
    let visibleCells: Array<{ slot_id: string; track_id: string }> | undefined;
    if (markedCells.size > 1 && markedCells.size < totalCellsInRect) {
      visibleCells = [];
      for (const key of markedCells) {
        const [s, t] = key.split('-').map(Number);
        const slot = sortedSlots[s];
        const track = sortedTracks[t];
        if (slot && track) {
          visibleCells.push({ slot_id: slot.id, track_id: track.id });
        }
      }
    }

    onMergeCells({
      start_slot_id: startSlot.id,
      start_track_id: startTrack.id,
      slot_span: slotSpan,
      track_span: trackSpan,
      sessionId:
        selectionAnalysis.type === 'valid_extend' ? selectionAnalysis.session.id : undefined,
      spansBreakSlot: selectionHasObstacles,
      visibleCells,
    });
    setMarkedCells(new Set());
  }, [
    selectedRect,
    onMergeCells,
    selectionAnalysis,
    sortedSlots,
    sortedTracks,
    selectionHasObstacles,
    markedCells,
  ]);

  // Show empty state only when both are missing and no add buttons are available
  if (sortedSlots.length === 0 && sortedTracks.length === 0 && (!onAddTrack || !onAddSlot)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-8">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No grid setup yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Add time slots and tracks to build your program grid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-auto">
      <div
        ref={gridRef}
        className="grid min-w-max relative select-none"
        style={{
          gridTemplateColumns: `80px repeat(${sortedTracks.length}, 150px)${isAdmin && onAddTrack ? ' 48px' : ''}`,
          gridTemplateRows: `48px repeat(${sortedSlots.length}, 80px)${isAdmin && onAddSlot ? ' 48px' : ''}`,
        }}
        onMouseDown={handleGridMouseDown}
      >
        {/* Header row - Time column */}
        <div className="sticky top-0 left-0 z-20 bg-gray-100 border-b border-r border-gray-300 flex items-center justify-center">
          <span className="text-xs font-medium text-gray-500 uppercase">Time</span>
        </div>

        {/* Header row - Track columns */}
        {sortedTracks.map((track) => (
          <TrackHeaderCell
            key={track.id}
            track={track}
            isAdmin={isAdmin}
            onUpdate={onUpdateTrack}
            onDelete={onDeleteTrack}
          />
        ))}

        {/* Add track button - end of header row */}
        {isAdmin && onAddTrack && (
          <div
            className="sticky top-0 z-10 bg-gray-50 border-b border-gray-300 flex items-center justify-center"
            style={{ gridRow: 1, gridColumn: sortedTracks.length + 2 }}
          >
            <button
              onClick={onAddTrack}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              title="Add track"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Time slots and cells */}
        {sortedSlots.map((slot, slotIndex) => (
          <React.Fragment key={slot.id}>
            {/* Time label - editable */}
            <TimeSlotCell
              slot={slot}
              slotIndex={slotIndex}
              isAdmin={isAdmin}
              onUpdate={onUpdateSlot}
              onDelete={onDeleteSlot}
            />

            {/* Track cells */}
            {sortedTracks.map((track, trackIndex) => (
              <GridCell
                key={`cell-${slot.id}-${track.id}`}
                slotId={slot.id}
                trackId={track.id}
                slotIndex={slotIndex}
                trackIndex={trackIndex}
                isAdmin={isAdmin}
                isDroppable={droppable}
                isSessionFree={slot.is_session_free}
                isMarked={markedCells.has(`${slotIndex}-${trackIndex}`)}
              />
            ))}
          </React.Fragment>
        ))}

        {/* Add time slot button - bottom of time column */}
        {isAdmin && onAddSlot && (
          <div
            className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200 flex items-center justify-center"
            style={{ gridRow: sortedSlots.length + 2, gridColumn: 1 }}
          >
            <button
              onClick={onAddSlot}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              title="Add time slot"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Session cards - positioned using CSS Grid placement, split around breaks */}
        {sessionVisualSegments.map((seg) => (
          <div
            key={seg.segmentKey}
            style={{
              gridRowStart: seg.gridRowStart,
              gridRowEnd: seg.gridRowEnd,
              gridColumnStart: seg.gridColumnStart,
              gridColumnEnd: seg.gridColumnEnd,
              zIndex: activeSessionId === seg.session.id ? 30 : 5,
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <SessionCard
              session={seg.session}
              draggableId={seg.segmentKey}
              onClick={() => onSessionClick(seg.session)}
              onDelete={onDeleteSession}
              onUnassignPaper={onUnassignPaper}
              onResize={seg.isLastSegment ? onResizeSession : undefined}
              isAdmin={isAdmin}
              isDraggable={seg.isFirstSegment}
              isDragging={activeSessionId === seg.session.id}
              gridCellHeight={80}
              gridCellWidth={150}
            />
          </div>
        ))}

        {/* Merge toolbar - shown when cells are marked */}
        {selectedRect && markedCells.size > 0 && (
          <div
            style={{
              gridRowStart: selectedRect.minSlotIndex + 2,
              gridColumnStart: selectedRect.minTrackIndex + 2,
              gridColumnEnd: selectedRect.maxTrackIndex + 3,
              zIndex: 20,
            }}
            className="flex items-start justify-center pt-2"
          >
            <div className="flex gap-2 bg-white shadow-lg rounded-lg border border-gray-200 px-3 py-2">
              <button
                onClick={handleMerge}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
              >
                {selectionAnalysis.type === 'valid_extend'
                  ? 'Extend Merge'
                  : isMultiCellSelection
                    ? 'Merge Cells'
                    : 'Add Session'}
              </button>
              <button
                onClick={() => setMarkedCells(new Set())}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              {selectionHasObstacles && (
                <span className="text-xs text-amber-600 flex items-center">
                  Spans other sessions
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
