import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import type { Training, TrainingProgramYear } from '../../types/training';
import type {
  TrainingSectionId,
  TrainingSectionGroup,
  TrainingSectionChild,
} from './trainingSections';
import { sectionGroups } from './trainingSections';
import { DesignProgramIcon, AssignTrainersIcon, FinalProgramIcon } from './icons';

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
  programYears: TrainingProgramYear[];
  refetchProgramYears: () => void;
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
      // Auto-expand program parent for program-YYYY-* sections
      if (sectionParam.startsWith('program-') && sectionParam !== 'program') {
        initial.add('program');
      }
    }
    return initial;
  });

  const activeSection: TrainingSectionId = sectionParam ?? 'program';

  // Fetch program years for dynamic sidebar
  const { data: programYears = [], refetch: refetchProgramYears } = useQuery({
    queryKey: ['training-program-years'],
    queryFn: async () => {
      const res = await api.get<TrainingProgramYear[]>('/trainings/programs/years');
      return res.data;
    },
    staleTime: 30_000,
  });

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
      // Auto-expand program parent for dynamic program children
      if (id === 'program' || id.startsWith('program-')) {
        setExpandedSections((prev) => {
          const next = new Set(prev);
          next.add('program');
          return next;
        });
      }
    },
    [searchParams, setSearchParams]
  );

  // Build dynamic sidebar groups with program year children
  const filteredGroups = useMemo(() => {
    // Build dynamic children for the "Training Program" section
    const programChildren: TrainingSectionChild[] = [];
    for (const py of programYears) {
      const yearStr = String(py.year);
      programChildren.push(
        {
          id: `program-${py.year}-design` as TrainingSectionId,
          name: 'Design Program',
          icon: DesignProgramIcon,
          group: yearStr,
        },
        {
          id: `program-${py.year}-trainers` as TrainingSectionId,
          name: 'Assign Trainers',
          icon: AssignTrainersIcon,
          group: yearStr,
        },
        {
          id: `program-${py.year}-final` as TrainingSectionId,
          name: 'Final Program',
          icon: FinalProgramIcon,
          group: yearStr,
        }
      );
    }

    // Clone sectionGroups and inject dynamic children into the program section
    return sectionGroups.map((group) => ({
      ...group,
      sections: group.sections.map((section) => {
        if (section.id === 'program') {
          return { ...section, children: programChildren };
        }
        return section;
      }),
    }));
  }, [programYears]);

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
    programYears,
    refetchProgramYears,
  };
}
