import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router';
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
}

export function useTrainingsModule(): UseTrainingsModuleReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as TrainingSectionId | null;

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

  const setActiveSection = useCallback(
    (id: TrainingSectionId) => {
      setSearchParams({ section: id }, { replace: true });

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
    [setSearchParams]
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
  };
}
