import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import ReadOnlyCalendarGrid from './ReadOnlyCalendarGrid';
import { formatDateDE } from './calendarUtils';
import ChangesPreviewDialog from './ChangesPreviewDialog';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import type {
  TrainingProgramYear,
  ProgramYearTraining,
  HolidayDateEntry,
  ProgramSnapshotListItem,
  ProgramSnapshot,
  ProgramDiffResponse,
} from '../../../../types/training';

interface Props {
  year: number;
}

export default function FinalProgramTab({ year }: Props) {
  const queryClient = useQueryClient();
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [diffData, setDiffData] = useState<ProgramDiffResponse | null>(null);

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

  // Fetch current placements
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

  // Fetch snapshots (version history)
  const { data: snapshots = [] } = useQuery({
    queryKey: ['program-snapshots', programYear?.id],
    queryFn: async () => {
      if (!programYear) return [];
      const res = await api.get<ProgramSnapshotListItem[]>(
        `/trainings/programs/years/${programYear.id}/snapshots`
      );
      return res.data;
    },
    enabled: !!programYear && (programYear.published_version ?? 0) > 0,
    staleTime: 0,
  });

  // Fetch latest snapshot data for display when published
  const { data: latestSnapshot } = useQuery({
    queryKey: ['program-snapshot', programYear?.id, programYear?.published_version],
    queryFn: async () => {
      if (!programYear || !programYear.published_version) return null;
      const res = await api.get<ProgramSnapshot>(
        `/trainings/programs/years/${programYear.id}/snapshots/${programYear.published_version}`
      );
      return res.data;
    },
    enabled: !!programYear && (programYear.published_version ?? 0) > 0,
    staleTime: 0,
  });

  const isPublished = (programYear?.published_version ?? 0) > 0;

  // Publish mutation (initial)
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!programYear) throw new Error('No program year');
      const res = await api.post(`/trainings/programs/years/${programYear.id}/publish`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-years'] });
      queryClient.invalidateQueries({ queryKey: ['program-snapshots', programYear?.id] });
      queryClient.invalidateQueries({ queryKey: ['program-snapshot'] });
      setShowPublishConfirm(false);
    },
  });

  // Preview changes mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!programYear) throw new Error('No program year');
      const res = await api.get<ProgramDiffResponse>(
        `/trainings/programs/years/${programYear.id}/preview-changes`
      );
      return res.data;
    },
    onSuccess: (data) => {
      setDiffData(data);
      setShowChangesDialog(true);
    },
  });

  // Confirm update mutation
  const confirmUpdateMutation = useMutation({
    mutationFn: async () => {
      if (!programYear) throw new Error('No program year');
      const res = await api.post(`/trainings/programs/years/${programYear.id}/confirm-update`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-years'] });
      queryClient.invalidateQueries({ queryKey: ['program-snapshots', programYear?.id] });
      queryClient.invalidateQueries({ queryKey: ['program-snapshot'] });
      setShowChangesDialog(false);
      setDiffData(null);
    },
  });

  const handleClickPlacement = useCallback((placementId: string) => {
    setSelectedPlacementId((prev) => (prev === placementId ? null : placementId));
  }, []);

  const handlePublish = useCallback(() => {
    setShowPublishConfirm(true);
  }, []);

  const handleUpdate = useCallback(() => {
    previewMutation.mutate();
  }, [previewMutation]);

  // Build a lookup from live placements for fields not in older snapshots
  const livePlacementMap = useMemo(() => {
    const map = new Map<string, ProgramYearTraining>();
    for (const p of placements) map.set(p.id, p);
    return map;
  }, [placements]);

  // Convert snapshot data to ProgramYearTraining format for the grid
  const snapshotPlacements: ProgramYearTraining[] = useMemo(() => {
    if (!latestSnapshot?.snapshot_data) return [];
    return latestSnapshot.snapshot_data.map((entry) => {
      const live = livePlacementMap.get(entry.placement_id);
      return {
        id: entry.placement_id,
        program_year_id: programYear?.id ?? '',
        training_id: '',
        training_name: entry.training_name,
        training_slug: entry.training_slug,
        training_abbreviation: entry.training_abbreviation,
        training_duration: entry.duration,
        training_color: entry.training_color,
        location_id: null,
        location_name: entry.location_name,
        location_code: entry.location_code,
        start_date: entry.start_date,
        placement_type: (live?.placement_type || entry.placement_type || 'open') as
          | 'open'
          | 'inhouse'
          | 'hybrid',
        created_at: '',
        updated_at: '',
        trainer_assignments: entry.trainer_ids.map((tid, idx) => {
          const nameParts = (entry.trainer_names[idx] || '').split(' ');
          return {
            id: `snap-${tid}-${entry.placement_id}`,
            placement_id: entry.placement_id,
            trainer_id: tid,
            trainer_first_name: nameParts[0] || '',
            trainer_last_name: nameParts.slice(1).join(' ') || '',
            created_at: '',
          };
        }),
      };
    });
  }, [latestSnapshot, programYear?.id, livePlacementMap]);

  if (!programYear) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Program year {year} not found.
      </div>
    );
  }

  const hasTrainers = placements.some((p) => (p.trainer_assignments?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Final Program {year}
          </h3>
          {isPublished && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              Published v{programYear.published_version}
            </span>
          )}
          {!isPublished && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              Not published
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isPublished && (
            <button
              onClick={handlePublish}
              disabled={publishMutation.isPending || placements.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishMutation.isPending ? 'Publishing...' : 'Publish Program'}
            </button>
          )}
          {isPublished && (
            <button
              onClick={handleUpdate}
              disabled={previewMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {previewMutation.isPending ? 'Checking changes...' : 'Update Program'}
            </button>
          )}
        </div>
      </div>

      {!isPublished && !hasTrainers && placements.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          No trainers have been assigned yet. Assign trainers in the &ldquo;Assign Trainers&rdquo;
          tab before publishing.
        </div>
      )}

      {publishMutation.isError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Failed to publish: {(publishMutation.error as Error).message}
        </div>
      )}

      {confirmUpdateMutation.isError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Failed to update: {(confirmUpdateMutation.error as Error).message}
        </div>
      )}

      {/* Published info */}
      {isPublished && programYear.published_at && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last published: {formatDateDE(programYear.published_at.slice(0, 10))}
          {snapshots.length > 1 && ` (${snapshots.length} versions)`}
        </div>
      )}

      {/* Calendar grid: show snapshot when published, current placements when draft */}
      {isPublished && snapshotPlacements.length > 0 ? (
        <ReadOnlyCalendarGrid
          year={year}
          holidayDates={holidayDates}
          placements={snapshotPlacements}
          selectedPlacementId={selectedPlacementId}
          onClickPlacement={handleClickPlacement}
        />
      ) : (
        <ReadOnlyCalendarGrid
          year={year}
          holidayDates={holidayDates}
          placements={placements}
          selectedPlacementId={selectedPlacementId}
          onClickPlacement={handleClickPlacement}
        />
      )}

      {/* Selected placement detail */}
      {selectedPlacementId &&
        (() => {
          const all = isPublished ? snapshotPlacements : placements;
          const selected = all.find((p) => p.id === selectedPlacementId);
          if (!selected) return null;
          const slug =
            selected.training_slug || selected.training_abbreviation || selected.training_name;
          return (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {slug}
                  </span>
                  {selected.placement_type && selected.placement_type !== 'open' && (
                    <span
                      className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        selected.placement_type === 'inhouse'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
                      }`}
                    >
                      {selected.placement_type === 'inhouse' ? 'IH' : 'HY'}
                    </span>
                  )}
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {formatDateDE(selected.start_date)}
                    {selected.training_duration ? ` (${selected.training_duration}d)` : ''}
                    {selected.location_name
                      ? ` — ${selected.location_code || selected.location_name}`
                      : ''}
                  </span>
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
              {(selected.trainer_assignments?.length ?? 0) > 0 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Trainers:</span>
                  {selected.trainer_assignments.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium"
                    >
                      {a.trainer_first_name} {a.trainer_last_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      {/* Publish confirmation dialog */}
      <ConfirmDialog
        open={showPublishConfirm}
        title="Publish Program"
        message={
          <div className="space-y-2">
            <p>
              This will publish the training program for <strong>{year}</strong>.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              All assigned trainers will receive an email with their personal training schedule as a
              PDF attachment.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {placements.length} placement{placements.length !== 1 ? 's' : ''},{' '}
              {
                new Set(
                  placements.flatMap((p) => p.trainer_assignments?.map((a) => a.trainer_id) ?? [])
                ).size
              }{' '}
              trainer
              {new Set(
                placements.flatMap((p) => p.trainer_assignments?.map((a) => a.trainer_id) ?? [])
              ).size !== 1
                ? 's'
                : ''}{' '}
              will be notified.
            </p>
          </div>
        }
        confirmLabel={publishMutation.isPending ? 'Publishing...' : 'Publish & Notify'}
        onConfirm={() => publishMutation.mutate()}
        onCancel={() => setShowPublishConfirm(false)}
        variant="primary"
      />

      {/* Changes preview dialog */}
      {showChangesDialog && diffData && (
        <ChangesPreviewDialog
          open={showChangesDialog}
          diff={diffData}
          year={year}
          isPending={confirmUpdateMutation.isPending}
          onConfirm={() => confirmUpdateMutation.mutate()}
          onCancel={() => {
            setShowChangesDialog(false);
            setDiffData(null);
          }}
        />
      )}
    </div>
  );
}
