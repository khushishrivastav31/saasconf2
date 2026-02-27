import { useMemo } from 'react';
import type { ProgramTimeSlot, ProgramTrack, ProgramSession } from '../../../../../types';

export interface SessionPosition {
  session: ProgramSession;
  gridRowStart: number;
  gridRowEnd: number;
  gridColumnStart: number;
  gridColumnEnd: number;
  isGeneral: boolean;
}

export interface SessionVisualSegment {
  session: ProgramSession;
  gridRowStart: number;
  gridRowEnd: number;
  gridColumnStart: number;
  gridColumnEnd: number;
  isGeneral: boolean;
  isFirstSegment: boolean;
  isLastSegment: boolean;
  segmentKey: string;
}

/**
 * Computes sorted arrays, index maps, session grid positions, and an occupancy map
 * for rendering a program grid. Shared between ProgramGrid and TaskAssignmentTab.
 */
export function useGridPositions(
  slots: ProgramTimeSlot[],
  tracks: ProgramTrack[],
  sessions: ProgramSession[]
) {
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
      .map((session): SessionPosition | null => {
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
      .filter((p): p is SessionPosition => p !== null);
  }, [sessions, slotIndexMap, trackIndexMap, sortedTracks.length]);

  // Build occupancy map: "slotIndex-trackIndex" -> sessionId
  const occupiedCells = useMemo(() => {
    const occupied = new Map<string, string>();

    const getSessionCells = (pos: SessionPosition): Array<[number, number]> => {
      const visibleCells = pos.session.settings?.visible_cells as
        | Array<{ slot_id: string; track_id: string }>
        | undefined;
      if (visibleCells && visibleCells.length > 0) {
        const cells: Array<[number, number]> = [];
        for (const vc of visibleCells) {
          const si = slotIndexMap.get(vc.slot_id);
          const ti = trackIndexMap.get(vc.track_id);
          if (si !== undefined && ti !== undefined) cells.push([si, ti]);
        }
        return cells;
      }
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
      if (pos.session.allow_in_session_free) continue;
      for (const [s, t] of getSessionCells(pos)) {
        occupied.set(`${s}-${t}`, pos.session.id);
      }
    }

    // Pass 2: sessions WITH allow_in_session_free only occupy cells not already taken
    for (const pos of sessionPositions) {
      if (!pos.session.allow_in_session_free) continue;
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
    const segments: SessionVisualSegment[] = [];

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
        for (const tis of slotTrackMap.values()) {
          tis.sort((a, b) => a - b);
        }

        // For each slot row, group consecutive tracks into horizontal ranges,
        // then merge vertically-adjacent ranges with the same track span
        type SegRect = { startSlot: number; endSlot: number; startTrack: number; endTrack: number };
        const rects: SegRect[] = [];
        const sortedSlotIndices = [...slotTrackMap.keys()].sort((a, b) => a - b);

        for (const si of sortedSlotIndices) {
          const tis = slotTrackMap.get(si)!;
          let rangeStart = tis[0];
          let prev = tis[0];
          for (let i = 1; i <= tis.length; i++) {
            if (i < tis.length && tis[i] === prev + 1) {
              prev = tis[i];
            } else {
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
              if (i < tis.length) {
                rangeStart = tis[i];
                prev = tis[i];
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

  return {
    sortedSlots,
    sortedTracks,
    slotIndexMap,
    trackIndexMap,
    sessionPositions,
    occupiedCells,
    sessionVisualSegments,
  };
}
