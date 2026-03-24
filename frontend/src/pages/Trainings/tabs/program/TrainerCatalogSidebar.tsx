import React, { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Trainer } from '../../../../types/training';

interface TrainerCatalogSidebarProps {
  trainers: Trainer[];
  isLoading: boolean;
}

const DraggableTrainerCard = React.memo(function DraggableTrainerCard({
  trainer,
}: {
  trainer: Trainer;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `trainer-${trainer.id}`,
    data: { type: 'trainer', trainer },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const initials = `${trainer.first_name[0]}${trainer.last_name[0]}`;
  const trainingsCount = trainer.trainings?.length ?? 0;

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
      <span className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
        {initials}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {trainer.first_name} {trainer.last_name}
        </div>
        {trainingsCount > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {trainingsCount} training{trainingsCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      {trainer.is_internal && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          INT
        </span>
      )}
    </div>
  );
});

const TrainerCatalogSidebar = React.memo(function TrainerCatalogSidebar({
  trainers,
  isLoading,
}: TrainerCatalogSidebarProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return trainers;
    const q = search.toLowerCase();
    return trainers.filter(
      (t) =>
        t.first_name.toLowerCase().includes(q) ||
        t.last_name.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q)
    );
  }, [trainers, search]);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Trainers</h4>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search trainers..."
        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
      />
      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
          No trainers found
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto">
          {filtered.map((t) => (
            <DraggableTrainerCard key={t.id} trainer={t} />
          ))}
        </div>
      )}
    </div>
  );
});

export default TrainerCatalogSidebar;
