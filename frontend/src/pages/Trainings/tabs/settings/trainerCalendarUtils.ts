/* Pure types, constants, and layout helpers for TrainerMonthCalendar. */

export interface ScheduleItem {
  assignment_id: string;
  placement_id: string;
  training_id: string;
  training_name: string;
  start_date: string;
  location_name: string | null;
  location_city: string | null;
  placement_type: string;
  customer_name: string | null;
  attendee_count: number;
  training_duration: number;
  training_color: string | null;
  training_slug: string | null;
  year: number;
  month: number;
}

export interface CalendarEvent {
  item: ScheduleItem;
  startDate: Date;
  endDate: Date;
}

export interface BarLayout {
  event: CalendarEvent;
  /** 0-based column within the week (0=Mon) where bar starts */
  colStart: number;
  /** How many day columns the bar spans this week */
  span: number;
  /** Lane (row) index for vertical stacking */
  lane: number;
  /** Is this a continuation from a previous week? */
  isContinuation: boolean;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
export const MAX_VISIBLE_EVENTS = 3;

export function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build calendar grid weeks for a given month. Each week = 7 Date objects (Mon→Sun). */
export function buildMonthWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const start = getMonday(firstDay);
  const weeks: Date[][] = [];

  const current = new Date(start);
  while (current <= lastDay || current.getDay() !== 1) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current > lastDay && current.getDay() === 1) break;
  }

  return weeks;
}

/** Convert schedule items to calendar events with computed end dates. */
export function toCalendarEvents(items: ScheduleItem[]): CalendarEvent[] {
  return items.map((item) => {
    const startDate = new Date(item.start_date + 'T00:00:00');
    const duration = item.training_duration || 1;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);
    return { item, startDate, endDate };
  });
}

/** Get events that overlap a specific day. */
export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => day >= e.startDate && day <= e.endDate);
}

export function layoutBarsForWeek(events: CalendarEvent[], weekDays: Date[]): BarLayout[] {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  // Find events that overlap this week
  const overlapping = events.filter((e) => e.startDate <= weekEnd && e.endDate >= weekStart);

  if (overlapping.length === 0) return [];

  // Sort by start date, then by duration (longer first for better layout)
  const sorted = [...overlapping].sort((a, b) => {
    const aStart = a.startDate < weekStart ? weekStart.getTime() : a.startDate.getTime();
    const bStart = b.startDate < weekStart ? weekStart.getTime() : b.startDate.getTime();
    if (aStart !== bStart) return aStart - bStart;
    // Longer events first
    return (
      b.endDate.getTime() - b.startDate.getTime() - (a.endDate.getTime() - a.startDate.getTime())
    );
  });

  const bars: BarLayout[] = [];
  // Track lane occupancy: lane -> end column (inclusive)
  const lanes: number[] = [];

  for (const event of sorted) {
    const effectiveStart = event.startDate < weekStart ? weekStart : event.startDate;
    const effectiveEnd = event.endDate > weekEnd ? weekEnd : event.endDate;

    const colStart = effectiveStart.getDay() === 0 ? 6 : effectiveStart.getDay() - 1;
    const colEnd = effectiveEnd.getDay() === 0 ? 6 : effectiveEnd.getDay() - 1;
    const span = colEnd - colStart + 1;
    const isContinuation = event.startDate < weekStart;

    // Find first available lane
    let lane = 0;
    while (lane < lanes.length && lanes[lane] >= colStart) {
      lane++;
    }
    if (lane >= lanes.length) lanes.push(-1);
    lanes[lane] = colEnd;

    bars.push({ event, colStart, span, lane, isContinuation });
  }

  return bars;
}
