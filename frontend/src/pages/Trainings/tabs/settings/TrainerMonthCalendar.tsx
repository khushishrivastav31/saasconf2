import React, { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import type { HolidayDateEntry } from '../../../../types/training';

/* ── Types ─────────────────────────────────────────────────────── */

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

interface CalendarEvent {
  item: ScheduleItem;
  startDate: Date;
  endDate: Date;
}

interface TrainerMonthCalendarProps {
  items: ScheduleItem[];
}

/* ── Constants ─────────────────────────────────────────────────── */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
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
const MAX_VISIBLE_EVENTS = 3;

/* ── Helpers ───────────────────────────────────────────────────── */

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build calendar grid weeks for a given month. Each week = 7 Date objects (Mon→Sun). */
function buildMonthWeeks(year: number, month: number): Date[][] {
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
function toCalendarEvents(items: ScheduleItem[]): CalendarEvent[] {
  return items.map((item) => {
    const startDate = new Date(item.start_date + 'T00:00:00');
    const duration = item.training_duration || 1;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);
    return { item, startDate, endDate };
  });
}

/** Get events that overlap a specific day. */
function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => day >= e.startDate && day <= e.endDate);
}

/* ── Multi-day bar layout ──────────────────────────────────────── */

interface BarLayout {
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

function layoutBarsForWeek(events: CalendarEvent[], weekDays: Date[]): BarLayout[] {
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

/* ── Event Pill Component ──────────────────────────────────────── */

const EventPill = React.memo(function EventPill({ bar }: { bar: BarLayout }) {
  const { event, isContinuation } = bar;
  const { item } = event;
  const color = item.training_color || '#6B7280';
  const label = item.training_slug || item.training_name;

  const placementBadge =
    item.placement_type === 'inhouse' ? 'IH' : item.placement_type === 'hybrid' ? 'HY' : null;

  return (
    <div
      className="group relative flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-white truncate cursor-default"
      style={{
        backgroundColor: color,
        borderTopLeftRadius: isContinuation ? 0 : undefined,
        borderBottomLeftRadius: isContinuation ? 0 : undefined,
      }}
      title={[
        item.training_name,
        item.location_name &&
          `📍 ${[item.location_name, item.location_city].filter(Boolean).join(', ')}`,
        item.customer_name && `👤 ${item.customer_name}`,
        item.attendee_count > 0 &&
          `${item.attendee_count} attendee${item.attendee_count !== 1 ? 's' : ''}`,
        `${item.start_date} (${item.training_duration || 1}d)`,
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <span className="truncate">{label}</span>
      {placementBadge && (
        <span className="shrink-0 text-[9px] opacity-80 bg-white/20 px-0.5 rounded">
          {placementBadge}
        </span>
      )}
    </div>
  );
});

/* ── Main Calendar Component ───────────────────────────────────── */

const TrainerMonthCalendar = React.memo(function TrainerMonthCalendar({
  items,
}: TrainerMonthCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const goToday = useCallback(() => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }, [today]);

  const goPrev = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNext = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  // Fetch holidays for the viewed year
  const { data: holidayDates = [] } = useQuery<HolidayDateEntry[]>({
    queryKey: ['holiday-dates', viewYear],
    queryFn: async () => {
      const res = await api.get<HolidayDateEntry[]>(`/trainings/holidays/dates/${viewYear}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const holidayMap = useMemo(() => {
    const map = new Map<string, HolidayDateEntry>();
    for (const h of holidayDates) map.set(h.date, h);
    return map;
  }, [holidayDates]);

  const weeks = useMemo(() => buildMonthWeeks(viewYear, viewMonth), [viewYear, viewMonth]);
  const events = useMemo(() => toCalendarEvents(items), [items]);

  return (
    <div className="space-y-3">
      {/* Header: Month title + navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="Previous month"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={goToday}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Today
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="Next month"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={`py-1.5 text-center text-xs font-medium ${
              i >= 5 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {weeks.map((week, weekIdx) => {
          const bars = layoutBarsForWeek(events, week);
          const maxLane = bars.length > 0 ? Math.max(...bars.map((b) => b.lane)) : -1;
          const laneCount = maxLane + 1;
          const visibleLanes = Math.min(laneCount, MAX_VISIBLE_EVENTS);
          const hasOverflow = laneCount > MAX_VISIBLE_EVENTS;

          return (
            <div
              key={weekIdx}
              className={`grid grid-cols-7 ${weekIdx > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
            >
              {/* Day number row */}
              {week.map((day, dayIdx) => {
                const isCurrentMonth = day.getMonth() === viewMonth;
                const isToday = isSameDay(day, today);
                const isWeekend = dayIdx >= 5;
                const dk = dateKey(day);
                const holiday = holidayMap.get(dk);
                const dayEvents = eventsForDay(events, day);
                const overflowCount = dayEvents.length - MAX_VISIBLE_EVENTS;

                return (
                  <div
                    key={dayIdx}
                    className={`relative min-h-[90px] p-1 ${
                      dayIdx < 6 ? 'border-r border-gray-200 dark:border-gray-700' : ''
                    } ${
                      holiday
                        ? 'bg-purple-50 dark:bg-purple-900/20'
                        : isWeekend
                          ? 'bg-gray-50 dark:bg-gray-800/50'
                          : 'bg-white dark:bg-gray-900'
                    } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className={`text-xs font-medium leading-none ${
                          isToday
                            ? 'bg-primary-600 text-white rounded-full w-5 h-5 flex items-center justify-center'
                            : isCurrentMonth
                              ? 'text-gray-700 dark:text-gray-300'
                              : 'text-gray-400 dark:text-gray-600'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Holiday label */}
                    {holiday && isCurrentMonth && (
                      <div
                        className="text-[9px] text-purple-600 dark:text-purple-400 font-medium truncate mb-0.5"
                        title={holiday.name}
                      >
                        {holiday.name}
                      </div>
                    )}

                    {/* Overflow indicator */}
                    {hasOverflow && dayIdx === 0 && overflowCount > 0 && (
                      <div className="absolute bottom-1 left-1 text-[9px] text-gray-500 dark:text-gray-400">
                        +{overflowCount} more
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Event bar lanes (absolute overlay row) */}
              {Array.from({ length: visibleLanes }, (_, laneIdx) => (
                <div key={`lane-${laneIdx}`} className="col-span-7 grid grid-cols-7 -mt-px">
                  {renderLaneBars(bars.filter((b) => b.lane === laneIdx))}
                </div>
              ))}

              {/* Overflow "+N more" row if needed */}
              {hasOverflow && (
                <div className="col-span-7 grid grid-cols-7">
                  {week.map((day, dayIdx) => {
                    const dayEvts = eventsForDay(events, day);
                    const overflow = dayEvts.length - MAX_VISIBLE_EVENTS;
                    const isCurrentMonth = day.getMonth() === viewMonth;
                    return (
                      <div
                        key={dayIdx}
                        className={`text-center text-[9px] text-gray-500 dark:text-gray-400 py-0.5 ${
                          dayIdx < 6 ? 'border-r border-gray-200 dark:border-gray-700' : ''
                        } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                      >
                        {overflow > 0 ? `+${overflow} more` : ''}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-600" />
          Weekend
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700" />
          Holiday
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700" />
          IH = Inhouse
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-teal-100 dark:bg-teal-900/30 border border-teal-300 dark:border-teal-700" />
          HY = Hybrid
        </div>
      </div>
    </div>
  );
});

/* ── Lane bar rendering ────────────────────────────────────────── */

function renderLaneBars(bars: BarLayout[]): React.ReactNode[] {
  const cells: React.ReactNode[] = [];
  let col = 0;

  // Sort bars by colStart
  const sorted = [...bars].sort((a, b) => a.colStart - b.colStart);

  for (const bar of sorted) {
    // Fill gap before this bar
    if (bar.colStart > col) {
      const gap = bar.colStart - col;
      cells.push(<div key={`gap-${col}`} style={{ gridColumn: `span ${gap}` }} className="h-5" />);
    }

    cells.push(
      <div
        key={`bar-${bar.event.item.assignment_id}-${bar.colStart}`}
        style={{ gridColumn: `span ${bar.span}` }}
        className="px-0.5 h-5"
      >
        <EventPill bar={bar} />
      </div>
    );

    col = bar.colStart + bar.span;
  }

  // Fill trailing gap
  if (col < 7) {
    cells.push(
      <div key={`trail-${col}`} style={{ gridColumn: `span ${7 - col}` }} className="h-5" />
    );
  }

  return cells;
}

export default TrainerMonthCalendar;
