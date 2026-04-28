import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import YearCalendarGrid from './YearCalendarGrid';
import TrainingCatalogSidebar from './TrainingCatalogSidebar';
import LocationCatalogSidebar from './LocationCatalogSidebar';
import GridFilterBar from './GridFilterBar';
import type {
  Training,
  TrainingProgramYear,
  ProgramYearTraining,
  HolidayDateEntry,
} from '../../../../types/training';
import type { Location } from '../../../../types/location';
import PlacementTypeSidebar from './PlacementTypeSidebar';

interface Props {
  year: number;
}

interface TrainingListResponse {
  items: Training[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface LocationListResponse {
  items: Location[];
  total: number;
}

export default function DesignProgramTab({ year }: Props) {
  const queryClient = useQueryClient();
  const [activeDrag, setActiveDrag] = useState<Training | null>(null);
  const [activeDragLocation, setActiveDragLocation] = useState<Location | null>(null);
  const [filterTrainingIds, setFilterTrainingIds] = useState<Set<string>>(new Set());
  const [filterLocationIds, setFilterLocationIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Custom collision: locations prefer bar targets, trainings prefer cell targets
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const isLocationDrag = args.active.data.current?.type === 'location';
    if (isLocationDrag) {
      // For location drags, use pointerWithin to hit bar targets precisely
      const pointerHits = pointerWithin(args);
      // Prefer bar targets over cell targets
      const barHit = pointerHits.find((c) => String(c.id).startsWith('bar-'));
      if (barHit) return [barHit];
      return pointerHits;
    }
    // For training drags, use rectIntersection for cell targets
    return rectIntersection(args);
  }, []);

  // Fetch program year to get its ID
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

  // Fetch trainings catalog
  const { data: trainingsData, isLoading: trainingsLoading } = useQuery({
    queryKey: ['trainings-catalog'],
    queryFn: async () => {
      const res = await api.get<TrainingListResponse>('/trainings', {
        params: { page: 1, page_size: 100 },
      });
      return res.data;
    },
    staleTime: 60_000,
  });

  const trainings = trainingsData?.items ?? [];

  // Fetch holiday dates
  const { data: holidayDates = [] } = useQuery({
    queryKey: ['holiday-dates', year],
    queryFn: async () => {
      const res = await api.get<HolidayDateEntry[]>(`/trainings/holidays/dates/${year}`);
      return res.data;
    },
    staleTime: 60_000,
  });

  // Fetch locations
  const { data: locationsData } = useQuery({
    queryKey: ['locations-list'],
    queryFn: async () => {
      const res = await api.get<LocationListResponse>('/locations', {
        params: { page_size: 100, is_active: true, domain: 'training' },
      });
      return res.data;
    },
    staleTime: 60_000,
  });

  const locations = locationsData?.items ?? [];

  // Fetch placements
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
  });

  // Create placement mutation
  const createPlacement = useMutation({
    mutationFn: async (data: { training_id: string; start_date: string }) => {
      if (!programYear) throw new Error('No program year');
      const res = await api.post<ProgramYearTraining>(
        `/trainings/programs/years/${programYear.id}/trainings`,
        data
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-year-trainings', programYear?.id] });
    },
  });

  // Delete placement mutation
  const deletePlacement = useMutation({
    mutationFn: async (placementId: string) => {
      if (!programYear) throw new Error('No program year');
      await api.delete(`/trainings/programs/years/${programYear.id}/trainings/${placementId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-year-trainings', programYear?.id] });
    },
  });

  // Update placement mutation
  const updatePlacement = useMutation({
    mutationFn: async ({
      placementId,
      data,
    }: {
      placementId: string;
      data: { location_id?: string | null; placement_type?: string; start_date?: string };
    }) => {
      if (!programYear) throw new Error('No program year');
      console.log('Updating placement:', placementId, data);
      const res = await api.put<ProgramYearTraining>(
        `/trainings/programs/years/${programYear.id}/trainings/${placementId}`,
        data
      );
      console.log('Update result:', res.data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-year-trainings', programYear?.id] });
    },
  });

  // Derive filter options from placements
  const placedTrainings = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string | null }>();
    for (const p of placements) {
      if (!map.has(p.training_id)) {
        map.set(p.training_id, {
          id: p.training_id,
          name: p.training_slug || p.training_abbreviation || p.training_name,
          color: p.training_color,
        });
      }
    }
    return Array.from(map.values());
  }, [placements]);

  const placedLocations = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of placements) {
      if (p.location_id && p.location_name && !map.has(p.location_id)) {
        map.set(p.location_id, {
          id: p.location_id,
          name: p.location_code || p.location_name,
        });
      }
    }
    return Array.from(map.values());
  }, [placements]);

  const filteredPlacements = useMemo(() => {
    if (filterTrainingIds.size === 0 && filterLocationIds.size === 0) return placements;
    return placements.filter((p) => {
      if (filterTrainingIds.size > 0 && !filterTrainingIds.has(p.training_id)) return false;
      if (filterLocationIds.size > 0 && !filterLocationIds.has(p.location_id ?? '')) return false;
      return true;
    });
  }, [placements, filterTrainingIds, filterLocationIds]);

  const toggleTrainingFilter = useCallback((id: string) => {
    setFilterTrainingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleLocationFilter = useCallback((id: string) => {
    setFilterLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterTrainingIds(new Set());
    setFilterLocationIds(new Set());
  }, []);

  const handleChangeLocation = useCallback(
    (placementId: string, locationId: string | null) => {
      updatePlacement.mutate({ placementId, data: { location_id: locationId } });
    },
    [updatePlacement]
  );

  const handleChangePlacementType = useCallback(
    (placementId: string, placementType: string) => {
      updatePlacement.mutate({ placementId, data: { placement_type: placementType } });
    },
    [updatePlacement]
  );

  const toggleGuaranteed = useMutation({
    mutationFn: async (placementId: string) => {
      if (!programYear) throw new Error('No program year');
      const res = await api.patch<ProgramYearTraining>(
        `/trainings/programs/years/${programYear.id}/trainings/${placementId}/guaranteed`
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-year-trainings', programYear?.id] });
    },
  });

  const handleToggleGuaranteed = useCallback(
    (placementId: string) => {
      toggleGuaranteed.mutate(placementId);
    },
    [toggleGuaranteed]
  );

  const [activeDragType, setActiveDragType] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'training') {
      setActiveDrag(data.training as Training);
      setActiveDragLocation(null);
      setActiveDragType(null);
    } else if (data?.type === 'location') {
      setActiveDragLocation(data.location as Location);
      setActiveDrag(null);
      setActiveDragType(null);
    } else if (data?.type === 'placement-type') {
      setActiveDragType(data.placementType as string);
      setActiveDrag(null);
      setActiveDragLocation(null);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      setActiveDragLocation(null);
      setActiveDragType(null);

      const { active, over } = event;
      if (!over || !active.data.current) return;

      const dragData = active.data.current;
      const dropData = over.data.current as Record<string, unknown> | undefined;
      if (!dropData) return;

      // Training dropped on calendar cell → create placement
      if (dragData.type === 'training' && typeof dropData.month === 'number') {
        const training = dragData.training as Training;
        const startDate = `${year}-${String((dropData.month as number) + 1).padStart(2, '0')}-${String(dropData.day).padStart(2, '0')}`;
        createPlacement.mutate({
          training_id: training.id,
          start_date: startDate,
        });
      }

      // Location dropped on training bar → assign location
      if (dragData.type === 'location' && dropData.type === 'placement') {
        const location = dragData.location as Location;
        const placementId = dropData.placementId as string;
        handleChangeLocation(placementId, location.id);
      }

      // Placement type dropped on training bar → assign type
      if (dragData.type === 'placement-type' && dropData.type === 'placement') {
        const placementType = dragData.placementType as string;
        const placementId = dropData.placementId as string;
        handleChangePlacementType(placementId, placementType);
      }
    },
    [year, createPlacement, handleChangeLocation, handleChangePlacementType]
  );

  const handleRemovePlacement = useCallback(
    (placementId: string) => {
      deletePlacement.mutate(placementId);
    },
    [deletePlacement]
  );

  if (!programYear) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Program year {year} not found.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Program {year}</h3>

        {/* Filter bar */}
        {placements.length > 0 && (
          <GridFilterBar
            trainingOptions={placedTrainings.map((t) => ({
              id: t.id,
              label: t.name,
              color: t.color,
            }))}
            locationOptions={placedLocations.map((l) => ({
              id: l.id,
              label: l.name,
            }))}
            filterTrainingIds={filterTrainingIds}
            filterLocationIds={filterLocationIds}
            onToggleTraining={toggleTrainingFilter}
            onToggleLocation={toggleLocationFilter}
            onClear={clearFilters}
          />
        )}

        <div className="flex gap-4">
          <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 pr-4 self-start sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <TrainingCatalogSidebar trainings={trainings} isLoading={trainingsLoading} />
            <LocationCatalogSidebar locations={locations} />
            <PlacementTypeSidebar />
          </div>
          <div className="flex-1 min-w-0">
            <YearCalendarGrid
              year={year}
              holidayDates={holidayDates}
              placements={filteredPlacements}
              locations={locations}
              onRemovePlacement={handleRemovePlacement}
              onChangeLocation={handleChangeLocation}
              onChangePlacementType={handleChangePlacementType}
              onToggleGuaranteed={handleToggleGuaranteed}
            />
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div
            className="px-3 py-2 rounded-md text-white shadow-lg text-sm font-medium pointer-events-none"
            style={{
              backgroundColor: activeDrag.color || '#6B7280',
              opacity: 0.45,
              minWidth: 120,
            }}
          >
            {activeDrag.slug || activeDrag.abbreviation || activeDrag.name}
            {activeDrag.duration ? ` (${activeDrag.duration}d)` : ''}
          </div>
        ) : activeDragLocation ? (
          <div className="px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-primary-300 shadow-2xl opacity-90 text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg
              className="w-3.5 h-3.5 text-primary-500"
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
            {activeDragLocation.code
              ? `${activeDragLocation.code} — ${activeDragLocation.name}`
              : activeDragLocation.name}
          </div>
        ) : activeDragType ? (
          <div
            className={`px-3 py-2 rounded-md shadow-2xl opacity-90 text-sm font-medium text-white ${
              activeDragType === 'inhouse' ? 'bg-amber-600' : 'bg-teal-600'
            }`}
          >
            {activeDragType === 'inhouse' ? 'Inhouse' : 'Hybrid'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
