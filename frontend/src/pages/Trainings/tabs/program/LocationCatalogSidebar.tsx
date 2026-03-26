import React, { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Location } from '../../../../types/location';

interface LocationCatalogSidebarProps {
  locations: Location[];
}

const DraggableLocationCard = React.memo(function DraggableLocationCard({
  location,
}: {
  location: Location;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `location-${location.id}`,
    data: { type: 'location', location },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-grab active:cursor-grabbing select-none transition-colors ${
        isDragging
          ? 'opacity-50 border-primary-300 bg-primary-50 dark:bg-primary-900/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <svg
        className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
          {location.name}
        </div>
      </div>
      {location.code && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
          {location.code}
        </span>
      )}
      {location.capacity != null && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
          {location.capacity}
        </span>
      )}
    </div>
  );
});

const LocationCatalogSidebar = React.memo(function LocationCatalogSidebar({
  locations,
}: LocationCatalogSidebarProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return locations;
    const q = search.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.code?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q)
    );
  }, [locations, search]);

  if (locations.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Locations</h4>
      {locations.length > 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search locations..."
          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        />
      )}
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {filtered.map((l) => (
          <DraggableLocationCard key={l.id} location={l} />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
            No locations found
          </p>
        )}
      </div>
    </div>
  );
});

export default LocationCatalogSidebar;
