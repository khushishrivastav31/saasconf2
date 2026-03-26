import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { PlacementTrainerAssignment } from '../../../../types/training';

interface ReadOnlyTrainingBarProps {
  placementId: string;
  slug: string;
  name: string;
  colSpan: number;
  color: string;
  hasWarning: boolean;
  dateRange: string;
  locationName: string | null;
  locationCode: string | null;
  placementType?: string;
  customerName?: string | null;
  trainerAssignments: PlacementTrainerAssignment[];
  isSelected: boolean;
  onClick: (placementId: string) => void;
}

function trainerInitials(a: PlacementTrainerAssignment): string {
  return `${a.trainer_first_name[0]}${a.trainer_last_name[0]}`;
}

const ReadOnlyTrainingBar = React.memo(function ReadOnlyTrainingBar({
  placementId,
  slug,
  name,
  colSpan,
  color,
  hasWarning,
  dateRange,
  locationName,
  locationCode,
  placementType,
  customerName,
  trainerAssignments,
  isSelected,
  onClick,
}: ReadOnlyTrainingBarProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `bar-${placementId}`,
    data: { type: 'placement', placementId },
  });

  const locationLabel = locationCode || locationName;
  const trainersTooltip =
    trainerAssignments.length > 0
      ? `\nTrainers: ${trainerAssignments.map((a) => `${a.trainer_first_name} ${a.trainer_last_name}`).join(', ')}`
      : '';

  return (
    <td ref={setNodeRef} colSpan={colSpan} className="px-0 py-0 relative">
      <div
        className={`mx-0.5 my-0.5 px-1.5 py-0.5 rounded text-xs font-medium truncate flex items-center gap-1 cursor-pointer transition-shadow ${
          isOver
            ? 'ring-2 ring-primary-400 ring-offset-1 shadow-lg'
            : isSelected
              ? 'ring-2 ring-primary-500 ring-offset-1'
              : ''
        } ${trainerAssignments.length === 0 ? 'border border-dashed' : ''}`}
        style={{
          backgroundColor: isOver ? `${color}40` : `${color}20`,
          borderLeft: `3px solid ${color}`,
          color: color,
          borderColor: trainerAssignments.length === 0 ? `${color}60` : undefined,
        }}
        title={`${name}\n${dateRange}${locationName ? `\nLocation: ${locationName}` : ''}${trainersTooltip}`}
        onClick={() => onClick(placementId)}
      >
        <span className="truncate">{slug}</span>
        {placementType && placementType !== 'open' && (
          <span
            className={`flex-shrink-0 text-[9px] px-1 py-px rounded font-bold ${
              placementType === 'inhouse'
                ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-800/60 dark:text-amber-200'
                : 'bg-teal-200/80 text-teal-900 dark:bg-teal-800/60 dark:text-teal-200'
            }`}
          >
            {placementType === 'inhouse' ? 'IH' : 'HY'}
          </span>
        )}
        {locationLabel && (
          <span
            className="flex-shrink-0 text-[10px] px-1 rounded bg-white/60 dark:bg-gray-900/60"
            style={{ color }}
          >
            {locationLabel}
          </span>
        )}
        {customerName && (
          <span className="flex-shrink-0 text-[9px] px-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium truncate max-w-15">
            {customerName}
          </span>
        )}
        {trainerAssignments.length > 0 && colSpan >= 3 && (
          <span className="flex-shrink-0 flex items-center gap-0.5">
            {trainerAssignments.slice(0, 2).map((a) => (
              <span
                key={a.id}
                className="text-[9px] px-1 rounded-full bg-white/80 dark:bg-gray-900/60 font-semibold"
                style={{ color }}
                title={`${a.trainer_first_name} ${a.trainer_last_name}`}
              >
                {trainerInitials(a)}
              </span>
            ))}
            {trainerAssignments.length > 2 && (
              <span className="text-[9px] opacity-70" style={{ color }}>
                +{trainerAssignments.length - 2}
              </span>
            )}
          </span>
        )}
        {trainerAssignments.length > 0 && colSpan < 3 && (
          <span
            className="flex-shrink-0 text-[9px] px-1 rounded-full bg-white/80 dark:bg-gray-900/60 font-semibold"
            style={{ color }}
          >
            {trainerAssignments.length}
          </span>
        )}
        {hasWarning && (
          <span className="flex-shrink-0 text-amber-500" title="Spans weekend or holiday">
            ⚠
          </span>
        )}
      </div>
    </td>
  );
});

export default ReadOnlyTrainingBar;
