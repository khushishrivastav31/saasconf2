import React, { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Location } from '../../../../types/location';

interface CalendarTrainingBarProps {
  placementId: string;
  slug: string;
  name: string;
  colSpan: number;
  color: string;
  hasWarning: boolean;
  dateRange: string;
  locationName: string | null;
  locationCode: string | null;
  placementType: string;
  locations: Location[];
  onRemove: () => void;
  onChangeLocation: (placementId: string, locationId: string | null) => void;
  onChangePlacementType: (placementId: string, type: string) => void;
}

const CalendarTrainingBar = React.memo(function CalendarTrainingBar({
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
  locations,
  onRemove,
  onChangeLocation,
  onChangePlacementType,
}: CalendarTrainingBarProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `bar-${placementId}`,
    data: { type: 'placement', placementId },
  });

  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLocationPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowLocationPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showLocationPicker]);

  const locationLabel = locationCode || locationName;

  return (
    <td ref={setDropRef} colSpan={colSpan} className="px-0 py-0 relative group">
      <div
        className={`mx-0.5 my-0.5 px-1.5 py-0.5 rounded text-xs font-medium truncate flex items-center gap-1 cursor-pointer transition-shadow ${
          isOver ? 'ring-2 ring-primary-500 ring-offset-1' : ''
        }`}
        style={{
          backgroundColor: `${color}20`,
          borderLeft: `3px solid ${color}`,
          color: color,
        }}
        title={`${name}\n${dateRange}${locationName ? `\nLocation: ${locationName}` : ''}`}
        onClick={() => setShowLocationPicker(!showLocationPicker)}
      >
        <span className="truncate">{slug}</span>
        {placementType !== 'open' && (
          <span
            className={`shrink-0 text-[9px] px-1 rounded font-bold uppercase ${
              placementType === 'inhouse'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
            }`}
          >
            {placementType === 'inhouse' ? 'IH' : 'HY'}
          </span>
        )}
        {locationLabel && (
          <span
            className="shrink-0 text-[10px] px-1 rounded bg-white/60 dark:bg-gray-900/60"
            style={{ color }}
          >
            {locationLabel}
          </span>
        )}
        {hasWarning && (
          <span className="flex-shrink-0 text-amber-500" title="Spans weekend or holiday">
            ⚠
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 dark:hover:text-red-400"
          title="Remove training"
        >
          ×
        </button>
      </div>
      {showLocationPicker && (
        <div
          ref={pickerRef}
          className="absolute z-50 top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[180px] max-h-48 overflow-y-auto"
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => {
              onChangeLocation(placementId, null);
              setShowLocationPicker(false);
            }}
          >
            No location
          </button>
          {locations.map((loc) => (
            <button
              key={loc.id}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                onChangeLocation(placementId, loc.id);
                setShowLocationPicker(false);
              }}
            >
              {loc.code ? `${loc.code} — ${loc.name}` : loc.name}
            </button>
          ))}
          {locations.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">
              No locations available
            </p>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
            <p className="px-3 py-0.5 text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">
              Type
            </p>
            {(['open', 'inhouse', 'hybrid'] as const).map((type) => (
              <button
                key={type}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  placementType === type
                    ? 'text-primary-600 font-medium'
                    : 'text-gray-900 dark:text-gray-100'
                }`}
                onClick={() => {
                  onChangePlacementType(placementId, type);
                  setShowLocationPicker(false);
                }}
              >
                {type === 'open' ? 'Open' : type === 'inhouse' ? 'Inhouse' : 'Hybrid'}
                {placementType === type && ' ✓'}
              </button>
            ))}
          </div>
        </div>
      )}
    </td>
  );
});

export default CalendarTrainingBar;
