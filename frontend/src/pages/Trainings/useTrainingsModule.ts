import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import type { Training } from '../../types/training';
import type { TrainingSectionId, TrainingSectionGroup } from './trainingSections';
import { sectionGroups } from './trainingSections';

export interface UseTrainingsModuleReturn {
  activeSection: TrainingSectionId;
  setActiveSection: (id: TrainingSectionId) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  expandedSections: Set<TrainingSectionId>;
  setExpandedSections: React.Dispatch<React.SetStateAction<Set<TrainingSectionId>>>;
  filteredGroups: TrainingSectionGroup[];
  selectedTrainingId: string | null;
  setSelectedTrainingId: (id: string | null) => void;
  selectedTraining: Training | undefined;
  isLoadingTraining: boolean;
  refetchTraining: () => void;
}

export function useTrainingsModule(): UseTrainingsModuleReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const sectionParam = searchParams.get('section') as TrainingSectionId | null;
  const trainingIdParam = searchParams.get('trainingId');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<TrainingSectionId>>(() => {
    // Auto-expand the parent if section param is a child
    const initial = new Set<TrainingSectionId>();
    if (sectionParam) {
      for (const group of sectionGroups) {
        for (const section of group.sections) {
          if (section.children?.some((c) => c.id === sectionParam)) {
            initial.add(section.id);
          }
        }
      }
    }
    return initial;
  });

  const activeSection: TrainingSectionId = sectionParam ?? 'trainings-list';

  const setSelectedTrainingId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams);
      if (id) {
        params.set('trainingId', id);
      } else {
        params.delete('trainingId');
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const selectedTrainingId = trainingIdParam || null;

  const {
    data: selectedTraining,
    isLoading: isLoadingTraining,
    refetch: refetchTraining,
  } = useQuery({
    queryKey: ['training', selectedTrainingId],
    queryFn: async () => {
      const res = await api.get<Training>(`/trainings/${selectedTrainingId}`);
      return res.data;
    },
    enabled: !!selectedTrainingId,
    staleTime: 30_000,
  });

  const handleRefetchTraining = useCallback(() => {
    if (selectedTrainingId) {
      refetchTraining();
      queryClient.invalidateQueries({ queryKey: ['trainings'] });
    }
  }, [selectedTrainingId, refetchTraining, queryClient]);

  const setActiveSection = useCallback(
    (id: TrainingSectionId) => {
      const params = new URLSearchParams(searchParams);
      params.set('section', id);
      setSearchParams(params, { replace: true });

      // Auto-expand parent if clicking a parent with children
      for (const group of sectionGroups) {
        for (const section of group.sections) {
          if (section.id === id && section.children) {
            setExpandedSections((prev) => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
          }
        }
      }
    },
    [searchParams, setSearchParams]
  );

  // For now, show all groups (no module-based filtering needed at this level)
  const filteredGroups = useMemo(() => sectionGroups, []);

  return {
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    expandedSections,
    setExpandedSections,
    filteredGroups,
    selectedTrainingId,
    setSelectedTrainingId,
    selectedTraining,
    isLoadingTraining,
    refetchTraining: handleRefetchTraining,
  };
}
