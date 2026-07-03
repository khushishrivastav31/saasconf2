import type {
  HolidayDateEntry,
  ProgramYearTraining,
  ProgramSnapshot,
} from '../../../../types/training';

/**
 * Convert a published program snapshot into ProgramYearTraining rows for the
 * read-only grid, layering in live placement fields (guaranteed / type) that
 * older snapshots may not carry.
 */
export function snapshotToPlacements(
  snapshot: ProgramSnapshot | null | undefined,
  programYearId: string,
  livePlacementMap: Map<string, ProgramYearTraining>
): ProgramYearTraining[] {
  if (!snapshot?.snapshot_data) return [];
  return snapshot.snapshot_data.map((entry) => {
    const live = livePlacementMap.get(entry.placement_id);
    return {
      id: entry.placement_id,
      program_year_id: programYearId,
      training_id: '',
      training_name: entry.training_name,
      training_slug: entry.training_slug,
      training_abbreviation: entry.training_abbreviation,
      training_duration: entry.duration,
      training_color: entry.training_color,
      location_id: null,
      location_name: entry.location_name,
      location_code: entry.location_code,
      start_date: entry.start_date,
      placement_type: (live?.placement_type || entry.placement_type || 'open') as
        | 'open'
        | 'inhouse'
        | 'hybrid',
      is_guaranteed: live?.is_guaranteed ?? false,
      created_at: '',
      updated_at: '',
      trainer_assignments: entry.trainer_ids.map((tid, idx) => {
        const nameParts = (entry.trainer_names[idx] || '').split(' ');
        return {
          id: `snap-${tid}-${entry.placement_id}`,
          placement_id: entry.placement_id,
          trainer_id: tid,
          trainer_first_name: nameParts[0] || '',
          trainer_last_name: nameParts.slice(1).join(' ') || '',
          created_at: '',
        };
      }),
    };
  });
}

/** Format YYYY-MM-DD as DD.MM.YYYY */
export function formatDateDE(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface CellInfo {
  day: number;
  exists: boolean;
  isWeekend: boolean;
  holiday: HolidayDateEntry | null;
}

export interface BarSegment {
  placement: ProgramYearTraining;
  startDay: number;
  endDay: number;
  hasWarning: boolean;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isWeekendDay(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month, day).getDay();
  return dow === 0 || dow === 6;
}

export function computeBarSegments(
  placements: ProgramYearTraining[],
  monthIdx: number,
  year: number,
  holidayMap: Map<string, HolidayDateEntry>
): BarSegment[] {
  const dim = daysInMonth(year, monthIdx);
  const segments: BarSegment[] = [];

  for (const p of placements) {
    const duration = p.training_duration ?? 1;
    const startDate = new Date(p.start_date + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);

    const monthStart = new Date(year, monthIdx, 1);
    const monthEnd = new Date(year, monthIdx, dim);

    if (endDate < monthStart || startDate > monthEnd) continue;

    const segStart = startDate < monthStart ? 1 : startDate.getDate();
    const segEnd = endDate > monthEnd ? dim : endDate.getDate();

    let hasWarning = false;
    for (let d = segStart; d <= segEnd; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (isWeekendDay(year, monthIdx, d) || holidayMap.has(dateStr)) {
        hasWarning = true;
        break;
      }
    }

    segments.push({ placement: p, startDay: segStart, endDay: segEnd, hasWarning });
  }

  return segments;
}

export function assignLanes(segments: BarSegment[]): BarSegment[][] {
  const sorted = [...segments].sort((a, b) => {
    if (a.startDay !== b.startDay) return a.startDay - b.startDay;
    // Stable tie-break: preserve insertion order (created_at)
    const aTime = a.placement.created_at ? new Date(a.placement.created_at).getTime() : 0;
    const bTime = b.placement.created_at ? new Date(b.placement.created_at).getTime() : 0;
    return aTime - bTime;
  });
  const lanes: BarSegment[][] = [];

  for (const seg of sorted) {
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      if (last.endDay < seg.startDay) {
        lane.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([seg]);
    }
  }

  return lanes;
}

export function buildGrid(
  year: number,
  holidayDates: HolidayDateEntry[]
): { holidayMap: Map<string, HolidayDateEntry>; grid: CellInfo[][] } {
  const holidayMap = new Map<string, HolidayDateEntry>();
  for (const entry of holidayDates) {
    holidayMap.set(entry.date, entry);
  }

  const rows: CellInfo[][] = [];
  for (let m = 0; m < 12; m++) {
    const dim = daysInMonth(year, m);
    const row: CellInfo[] = [];
    for (let d = 1; d <= 31; d++) {
      if (d > dim) {
        row.push({ day: d, exists: false, isWeekend: false, holiday: null });
      } else {
        const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        row.push({
          day: d,
          exists: true,
          isWeekend: isWeekendDay(year, m, d),
          holiday: holidayMap.get(dateStr) ?? null,
        });
      }
    }
    rows.push(row);
  }

  return { holidayMap, grid: rows };
}
