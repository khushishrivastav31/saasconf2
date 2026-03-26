import React, { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Training } from '../../../../types/training';

interface TrainingCatalogSidebarProps {
  trainings: Training[];
  isLoading: boolean;
}

const DraggableCard = React.memo(function DraggableCard({ training }: { training: Training }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `catalog-${training.id}`,
    data: { type: 'training', training },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const slug = training.slug || training.abbreviation || training.name;
  const hasDuration = training.duration != null && training.duration > 0;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-grab active:cursor-grabbing select-none transition-colors ${
        isDragging
          ? 'opacity-50 border-primary-300 bg-primary-50 dark:bg-primary-900/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: training.color || '#6B7280' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{slug}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {training.name !== slug ? training.name : ''}
        </div>
      </div>
      <span
        className={`text-xs px-1.5 py-0.5 rounded ${
          hasDuration
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
        }`}
      >
        {hasDuration ? `${training.duration}d` : 'no dur.'}
      </span>
    </div>
  );
});

const TrainingCatalogSidebar = React.memo(function TrainingCatalogSidebar({
  trainings,
  isLoading,
}: TrainingCatalogSidebarProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return trainings;
    const q = search.toLowerCase();
    return trainings.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.abbreviation?.toLowerCase().includes(q)
    );
  }, [trainings, search]);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Training Catalog</h4>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search trainings..."
        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
      />
      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
          No trainings found
        </p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {filtered.map((t) => (
            <DraggableCard key={t.id} training={t} />
          ))}
        </div>
      )}
    </div>
  );
});

export default TrainingCatalogSidebar;
