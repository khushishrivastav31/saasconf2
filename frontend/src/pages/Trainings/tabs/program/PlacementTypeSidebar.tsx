import React from 'react';
import { useDraggable } from '@dnd-kit/core';

const PLACEMENT_TYPES = [
  {
    id: 'inhouse',
    label: 'Inhouse',
    color:
      'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300',
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    color:
      'bg-teal-100 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-300',
  },
] as const;

const DraggableTypeCard = React.memo(function DraggableTypeCard({
  typeId,
  label,
  colorClasses,
}: {
  typeId: string;
  label: string;
  colorClasses: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `type-${typeId}`,
    data: { type: 'placement-type', placementType: typeId },
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
        isDragging ? 'opacity-50' : ''
      } ${colorClasses}`}
    >
      <svg
        className="w-3.5 h-3.5 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
        />
      </svg>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
});

const PlacementTypeSidebar = React.memo(function PlacementTypeSidebar() {
  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Type</h4>
      <div className="space-y-1">
        {PLACEMENT_TYPES.map((t) => (
          <DraggableTypeCard key={t.id} typeId={t.id} label={t.label} colorClasses={t.color} />
        ))}
      </div>
    </div>
  );
});

export default PlacementTypeSidebar;
