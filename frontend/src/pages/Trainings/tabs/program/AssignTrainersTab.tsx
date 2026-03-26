import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import ReadOnlyCalendarGrid from './ReadOnlyCalendarGrid';
import TrainerCatalogSidebar from './TrainerCatalogSidebar';
import { formatDateDE } from './calendarUtils';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import type {
  Trainer,
  TrainingProgramYear,
  ProgramYearTraining,
  HolidayDateEntry,
  AvailabilityCheckResponse,
} from '../../../../types/training';

interface Props {
  year: number;
}

interface TrainerListResponse {
  items: Trainer[];
  total: number;
  pages: number;
}

export default function AssignTrainersTab({ year }: Props) {
  const queryClient = useQueryClient();
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [filterTrainerId, setFilterTrainerId] = useState<string>('');
  const [activeDragTrainer, setActiveDragTrainer] = useState<Trainer | null>(null);
  const [conflictData, setConflictData] = useState<{
    trainerId: string;
    trainerName: string;
    placementId: string;
    conflicts: AvailabilityCheckResponse['conflicts'];
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Fetch program year
  const { data: programYears = [] } = useQuery({
    queryKey: ['program-years'],
    queryFn: async () => {
      const res = await api.get<TrainingProgramYear[]>('/trainings/programs/years');
      return res.data;
    },
    staleTime: 60_000,
  });

  const programYear = useMemo(
    () => programYears.find((py) => py.year === year),
    [programYears, year]
  );

  // Fetch holiday dates
  const { data: holidayDates = [] } = useQuery({
    queryKey: ['holiday-dates', year],
    queryFn: async () => {
      const res = await api.get<HolidayDateEntry[]>(`/trainings/holidays/dates/${year}`);
      return res.data;
    },
    staleTime: 60_000,
  });

  // Fetch placements (includes trainer_assignments)
  const { data: placements = [] } = useQuery({
    queryKey: ['program-year-trainings', programYear?.id],
    queryFn: async () => {
      if (!programYear) return [];
      const res = await api.get<ProgramYearTraining[]>(
        `/trainings/programs/years/${programYear.id}/trainings`
      );
      return res.data;
    },
    enabled: !!programYear,
    staleTime: 0,
  });

  // Fetch trainers
  const { data: trainersData, isLoading: trainersLoading } = useQuery({
    queryKey: ['trainers-list'],
    queryFn: async () => {
      const res = await api.get<TrainerListResponse>('/trainings/trainers', {
        params: { is_active: true, page_size: 200 },
      });
      return res.data;
    },
    staleTime: 60_000,
  });

  const trainers = useMemo(() => trainersData?.items ?? [], [trainersData]);

  // Filter placements by trainer
  const filteredPlacements = useMemo(() => {
    if (!filterTrainerId) return placements;
    return placements.filter((p) =>
      p.trainer_assignments?.some((ta) => ta.trainer_id === filterTrainerId)
    );
  }, [placements, filterTrainerId]);

  // Selected placement
  const selectedPlacement = useMemo(
    () => placements.find((p) => p.id === selectedPlacementId) ?? null,
    [placements, selectedPlacementId]
  );

  // Assign trainer mutation
  const assignTrainer = useMutation({
    mutationFn: async ({ placementId, trainerId }: { placementId: string; trainerId: string }) => {
      if (!programYear) throw new Error('No program year');
      const res = await api.post(
        `/trainings/programs/years/${programYear.id}/trainings/${placementId}/trainers`,
        { trainer_id: trainerId }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-year-trainings', programYear?.id] });
    },
  });

  // Remove trainer mutation
  const removeTrainer = useMutation({
    mutationFn: async ({
      placementId,
      assignmentId,
    }: {
      placementId: string;
      assignmentId: string;
    }) => {
      if (!programYear) throw new Error('No program year');
      await api.delete(
        `/trainings/programs/years/${programYear.id}/trainings/${placementId}/trainers/${assignmentId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-year-trainings', programYear?.id] });
    },
  });

  const handleClickPlacement = useCallback((placementId: string) => {
    setSelectedPlacementId((prev) => (prev === placementId ? null : placementId));
  }, []);

  const tryAssignTrainer = useCallback(
    async (placementId: string, trainerId: string) => {
      if (!programYear) return;
      const trainer = trainers.find((t) => t.id === trainerId);
      if (!trainer) return;

      // Check if already assigned
      const placement = placements.find((p) => p.id === placementId);
      if (placement?.trainer_assignments?.some((ta) => ta.trainer_id === trainerId)) return;

      // Check availability first
      try {
        const res = await api.get<AvailabilityCheckResponse>(
          `/trainings/programs/years/${programYear.id}/trainings/${placementId}/check-trainer`,
          { params: { trainer_id: trainerId } }
        );
        if (!res.data.available) {
          setConflictData({
            trainerId,
            trainerName: `${trainer.first_name} ${trainer.last_name}`,
            placementId,
            conflicts: res.data.conflicts,
          });
          return;
        }
      } catch {
        // If check fails, proceed with assignment
      }

      assignTrainer.mutate({ placementId, trainerId });
    },
    [programYear, trainers, placements, assignTrainer]
  );

  const handleConfirmConflictAssign = useCallback(() => {
    if (!conflictData) return;
    assignTrainer.mutate({
      placementId: conflictData.placementId,
      trainerId: conflictData.trainerId,
    });
    setConflictData(null);
  }, [conflictData, assignTrainer]);

  const handleRemoveTrainer = useCallback(
    (placementId: string, assignmentId: string) => {
      removeTrainer.mutate({ placementId, assignmentId });
    },
    [removeTrainer]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'trainer') {
      setActiveDragTrainer(data.trainer as Trainer);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragTrainer(null);

      const { active, over } = event;
      if (!over || !active.data.current) return;

      const dragData = active.data.current;
      const dropData = over.data.current as Record<string, unknown> | undefined;
      if (!dropData) return;

      // Trainer dropped on training bar → assign trainer
      if (dragData.type === 'trainer' && dropData.type === 'placement') {
        const trainer = dragData.trainer as Trainer;
        const placementId = dropData.placementId as string;
        tryAssignTrainer(placementId, trainer.id);
      }
    },
    [tryAssignTrainer]
  );

  if (!programYear) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Program year {year} not found.
      </div>
    );
  }

  const selectedSlug = selectedPlacement
    ? selectedPlacement.training_slug ||
      selectedPlacement.training_abbreviation ||
      selectedPlacement.training_name
    : '';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Assign Trainers {year}
        </h3>

        {/* Filter by trainer */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Filter by trainer:
          </label>
          <select
            value={filterTrainerId}
            onChange={(e) => setFilterTrainerId(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All trainers</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.first_name} {t.last_name}
              </option>
            ))}
          </select>
          {filterTrainerId && (
            <button
              onClick={() => setFilterTrainerId('')}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            Drag a trainer onto a training bar to assign
          </span>
        </div>

        <div className="flex gap-4">
          {/* Trainer sidebar */}
          <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 pr-4 self-start sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <TrainerCatalogSidebar trainers={trainers} isLoading={trainersLoading} />
          </div>

          {/* Calendar grid */}
          <div className="flex-1 min-w-0">
            <ReadOnlyCalendarGrid
              year={year}
              holidayDates={holidayDates}
              placements={filteredPlacements}
              selectedPlacementId={selectedPlacementId}
              onClickPlacement={handleClickPlacement}
            />
          </div>
        </div>

        {/* Assignment panel */}
        {selectedPlacement && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {selectedSlug}
                  {selectedPlacement.placement_type &&
                    selectedPlacement.placement_type !== 'open' && (
                      <span
                        className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          selectedPlacement.placement_type === 'inhouse'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
                        }`}
                      >
                        {selectedPlacement.placement_type === 'inhouse' ? 'IH' : 'HY'}
                      </span>
                    )}
                  <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
                    {formatDateDE(selectedPlacement.start_date)}
                    {selectedPlacement.training_duration
                      ? ` (${selectedPlacement.training_duration}d)`
                      : ''}
                    {selectedPlacement.location_name
                      ? ` — ${selectedPlacement.location_code || selectedPlacement.location_name}`
                      : ''}
                  </span>
                </h4>
              </div>
              <button
                onClick={() => setSelectedPlacementId(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Current assignments */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400">Assigned:</span>
              {(selectedPlacement.trainer_assignments ?? []).length === 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                  No trainers assigned
                </span>
              )}
              {(selectedPlacement.trainer_assignments ?? []).map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium"
                >
                  {a.trainer_first_name} {a.trainer_last_name}
                  <button
                    onClick={() => handleRemoveTrainer(selectedPlacement.id, a.id)}
                    className="text-primary-400 hover:text-red-500 dark:hover:text-red-400 ml-0.5"
                    title="Remove trainer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {assignTrainer.isPending && (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600" />
                Assigning...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragTrainer ? (
          <div className="px-3 py-2 rounded-md bg-primary-50 dark:bg-primary-900/40 border border-primary-300 dark:border-primary-600 shadow-2xl opacity-90 text-sm font-medium text-primary-700 dark:text-primary-300 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold bg-primary-100 dark:bg-primary-800 text-primary-700 dark:text-primary-300">
              {activeDragTrainer.first_name[0]}
              {activeDragTrainer.last_name[0]}
            </span>
            {activeDragTrainer.first_name} {activeDragTrainer.last_name}
          </div>
        ) : null}
      </DragOverlay>

      {/* Conflict warning dialog */}
      {conflictData && (
        <ConfirmDialog
          open={!!conflictData}
          title="Scheduling Conflict"
          message={
            <div className="space-y-2">
              <p>
                <strong>{conflictData.trainerName}</strong> has the following conflicts:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {conflictData.conflicts.map((c, i) => (
                  <li
                    key={i}
                    className={
                      c.type === 'unavailability'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {c.type === 'unavailability' ? 'Unavailable: ' : 'Double-booking: '}
                    {c.description}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Do you want to assign them anyway?
              </p>
            </div>
          }
          confirmLabel="Assign Anyway"
          onConfirm={handleConfirmConflictAssign}
          onCancel={() => setConflictData(null)}
          variant="danger"
        />
      )}
    </DndContext>
  );
}
