import React, { useCallback, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import CalendarTrainingBar from './CalendarTrainingBar';
import {
  MONTH_NAMES,
  daysInMonth,
  formatDateDE,
  computeBarSegments,
  assignLanes,
  buildGrid,
  type CellInfo,
  type BarSegment,
} from './calendarUtils';
import type { HolidayDateEntry, ProgramYearTraining } from '../../../../types/training';
import type { Location } from '../../../../types/location';

// --- Droppable Day Cell ---

const DroppableCell = React.memo(function DroppableCell({
  monthIdx,
  day,
  cell,
}: {
  monthIdx: number;
  day: number;
  cell: CellInfo;
}) {
  const cellId = `cell-${monthIdx}-${day}`;
  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: { month: monthIdx, day },
    disabled: !cell.exists,
  });

  if (!cell.exists) {
    return (
      <td className="px-0 py-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" />
    );
  }

  let cellClass = 'px-0 py-1.5 text-center border border-gray-200 dark:border-gray-700 ';

  if (isOver) {
    cellClass += 'bg-primary-100 dark:bg-primary-900/30 ring-1 ring-inset ring-primary-400';
  } else if (cell.holiday) {
    cellClass += 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
  } else if (cell.isWeekend) {
    cellClass += 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
  } else {
    cellClass += 'text-gray-700 dark:text-gray-300';
  }

  let tooltip: string | undefined;
  if (cell.holiday) {
    const h = cell.holiday;
    if (h.type === 'public') {
      const location = h.is_national
        ? `National — ${h.country_code}`
        : h.counties?.length
          ? `${h.counties.join(', ')}`
          : (h.country_code ?? '');
      tooltip = `${h.name} (${location})`;
    } else {
      tooltip = `${h.name} (Blocked Day)`;
    }
  }

  return (
    <td ref={setNodeRef} className={cellClass} title={tooltip}>
      {cell.day}
    </td>
  );
});

// --- Main Grid ---

interface YearCalendarGridProps {
  year: number;
  holidayDates: HolidayDateEntry[];
  placements: ProgramYearTraining[];
  locations: Location[];
  onRemovePlacement: (placementId: string) => void;
  onChangeLocation: (placementId: string, locationId: string | null) => void;
  onChangePlacementType: (placementId: string, type: string) => void;
  onToggleGuaranteed?: (placementId: string) => void;
}

const YearCalendarGrid = React.memo(function YearCalendarGrid({
  year,
  holidayDates,
  placements,
  locations,
  onRemovePlacement,
  onChangeLocation,
  onChangePlacementType,
  onToggleGuaranteed,
}: YearCalendarGridProps) {
  const { holidayMap, grid } = useMemo(() => buildGrid(year, holidayDates), [year, holidayDates]);

  const monthLanes = useMemo(() => {
    const result: BarSegment[][][] = [];
    for (let m = 0; m < 12; m++) {
      const segments = computeBarSegments(placements, m, year, holidayMap);
      result.push(assignLanes(segments));
    }
    return result;
  }, [placements, year, holidayMap]);

  const handleRemove = useCallback((id: string) => onRemovePlacement(id), [onRemovePlacement]);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-2 py-1.5 text-left text-gray-700 dark:text-gray-300 font-medium border border-gray-200 dark:border-gray-700 min-w-[90px]">
                Month
              </th>
              {Array.from({ length: 31 }, (_, i) => (
                <th
                  key={i}
                  className="px-0 py-1.5 text-center text-gray-500 dark:text-gray-400 font-medium border border-gray-200 dark:border-gray-700 w-8 min-w-[2rem]"
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, monthIdx) => {
              const lanes = monthLanes[monthIdx];
              return (
                <React.Fragment key={monthIdx}>
                  <tr>
                    <td
                      className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-2 py-1.5 font-medium text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 whitespace-nowrap"
                      rowSpan={1 + lanes.length}
                    >
                      {MONTH_NAMES[monthIdx]}
                    </td>
                    {row.map((cell, dayIdx) => (
                      <DroppableCell
                        key={dayIdx}
                        monthIdx={monthIdx}
                        day={dayIdx + 1}
                        cell={cell}
                      />
                    ))}
                  </tr>
                  {lanes.map((lane, laneIdx) => (
                    <tr key={`lane-${monthIdx}-${laneIdx}`}>
                      {renderLane(
                        lane,
                        daysInMonth(year, monthIdx),
                        year,
                        monthIdx,
                        locations,
                        handleRemove,
                        onChangeLocation,
                        onChangePlacementType,
                        onToggleGuaranteed
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700" />
          Weekend
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700" />
          Holiday / Blocked
        </div>
        {holidayMap.size > 0 && (
          <span className="text-gray-400 dark:text-gray-500">
            ({holidayMap.size} holiday{holidayMap.size !== 1 ? 's' : ''})
          </span>
        )}
      </div>
    </div>
  );
});

function renderLane(
  lane: BarSegment[],
  dim: number,
  year: number,
  monthIdx: number,
  locations: Location[],
  onRemove: (id: string) => void,
  onChangeLocation: (placementId: string, locationId: string | null) => void,
  onChangePlacementType: (placementId: string, type: string) => void,
  onToggleGuaranteed?: (placementId: string) => void
): React.ReactNode[] {
  const cells: React.ReactNode[] = [];
  let currentDay = 1;

  for (const seg of lane) {
    if (seg.startDay > currentDay) {
      const gap = seg.startDay - currentDay;
      cells.push(
        <td
          key={`gap-${currentDay}`}
          colSpan={gap}
          className="border border-gray-100 dark:border-gray-800"
        />
      );
    }

    const colSpan = seg.endDay - seg.startDay + 1;
    const p = seg.placement;
    const slug = p.training_slug || p.training_abbreviation || p.training_name;
    const color = p.training_color || '#6B7280';

    const startStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(seg.startDay).padStart(2, '0')}`;
    const duration = p.training_duration ?? 1;
    const endDate = new Date(p.start_date + 'T00:00:00');
    endDate.setDate(endDate.getDate() + duration - 1);
    const endStr = endDate.toISOString().slice(0, 10);

    cells.push(
      <CalendarTrainingBar
        key={p.id + '-' + monthIdx}
        placementId={p.id}
        slug={slug}
        name={p.training_name}
        colSpan={colSpan}
        color={color}
        hasWarning={seg.hasWarning}
        dateRange={`${formatDateDE(startStr)} → ${formatDateDE(endStr)}`}
        locationName={p.location_name}
        locationCode={p.location_code}
        placementType={p.placement_type || 'open'}
        customerName={p.customer_name}
        isGuaranteed={p.is_guaranteed}
        locations={locations}
        onRemove={() => onRemove(p.id)}
        onChangeLocation={onChangeLocation}
        onChangePlacementType={onChangePlacementType}
        onToggleGuaranteed={onToggleGuaranteed}
      />
    );

    currentDay = seg.endDay + 1;
  }

  if (currentDay <= dim) {
    cells.push(
      <td
        key={`trail-${currentDay}`}
        colSpan={dim - currentDay + 1}
        className="border border-gray-100 dark:border-gray-800"
      />
    );
  }

  if (dim < 31) {
    cells.push(
      <td
        key="nonexist"
        colSpan={31 - dim}
        className="border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800"
      />
    );
  }

  return cells;
}

export default YearCalendarGrid;
