import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConferenceAdmin } from '../../hooks/useConferenceAdmin';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import type { Conference } from '../../types';
import { SectionId, SectionGroup, sectionGroups } from './conferenceSections';

// ---------------------------------------------------------------------------
// Delete Preview
// ---------------------------------------------------------------------------

export interface DeletePreview {
  conference_name: string;
  is_active: boolean;
  can_delete: boolean;
  must_deactivate_first: boolean;
  volunteers: {
    total_linked: number;
    will_delete: number;
    will_unlink: number;
  };
  locations: { total_linked: number; will_delete: number; will_unlink: number };
  cfps: { total_linked: number; will_delete: number; will_unlink: number };
  invoices: {
    count: number;
    export_available: boolean;
    export_url: string | null;
  };
  papers: {
    count: number;
    export_available: boolean;
    export_url: string | null;
  };
  sponsors: {
    count: number;
  };
  applicants: {
    orphaned_count: number;
    note: string;
  };
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseConferenceDetailReturn {
  // Conference data
  conference: Conference | undefined;
  isLoading: boolean;
  isError: boolean;
  isAdmin: boolean;
  handleUpdate: () => void;

  // Sidebar navigation
  activeSection: SectionId;
  setActiveSection: React.Dispatch<React.SetStateAction<SectionId>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  expandedSections: Set<string>;
  setExpandedSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  filteredGroups: SectionGroup[];

  // Router helpers
  navigate: ReturnType<typeof useNavigate>;
  conferenceId: string | undefined;

  // Unsaved changes guard
  setIsDirty: (dirty: boolean) => void;
  showUnsavedDialog: boolean;
  confirmLeaveTab: () => void;
  cancelLeaveTab: () => void;
}

// ---------------------------------------------------------------------------
// Custom hook
// ---------------------------------------------------------------------------

export function useConferenceDetail(conferenceId: string | undefined): UseConferenceDetailReturn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useConferenceAdmin(conferenceId);

  // -------------------------------------------------------------------------
  // Sidebar navigation — synced with URL ?tab= param
  // -------------------------------------------------------------------------

  const [searchParams, setSearchParams] = useSearchParams();

  // Collect all valid section IDs (including children) from groups
  const validSectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of sectionGroups) {
      for (const s of group.sections) {
        ids.add(s.id);
        if (s.children) {
          for (const c of s.children) ids.add(c.id);
        }
      }
    }
    return ids;
  }, []);

  const tabFromUrl = searchParams.get('tab');
  const initialSection: SectionId =
    tabFromUrl && validSectionIds.has(tabFromUrl) ? (tabFromUrl as SectionId) : 'details';

  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);

  // Tracks activeSection in a ref so the URL→state effect can read it without
  // needing it as a dep (which would cause a loop).
  const activeSectionRef = useRef(initialSection);
  activeSectionRef.current = activeSection;
  // When the URL→state effect updates state it sets this to true so the
  // state→URL effect below knows to skip that one cycle (URL is already right).
  const skipUrlSyncRef = useRef(false);

  // URL → state: fires when external navigation changes ?tab= (e.g. bell dropdown)
  useEffect(() => {
    const wanted: SectionId =
      tabFromUrl && validSectionIds.has(tabFromUrl) ? (tabFromUrl as SectionId) : 'details';
    if (wanted !== activeSectionRef.current) {
      skipUrlSyncRef.current = true;
      setActiveSection(wanted);
    }
  }, [tabFromUrl, validSectionIds]);

  // State → URL: fires when activeSection changes (sidebar clicks)
  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    const currentTab = searchParams.get('tab');
    const expectedTab = activeSection === 'details' ? null : activeSection;
    if (currentTab !== expectedTab) {
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params);
          if (activeSection === 'details') {
            updated.delete('tab');
          } else {
            updated.set('tab', activeSection);
          }
          return updated;
        },
        { replace: true }
      );
    }
  }, [activeSection, searchParams, setSearchParams]);

  // -------------------------------------------------------------------------
  // Unsaved changes guard for tab switching
  // -------------------------------------------------------------------------

  const isDirtyRef = useRef(false);
  const [pendingSection, setPendingSection] = useState<SectionId | null>(null);

  const setIsDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
  }, []);

  const guardedSetActiveSection = useCallback(
    (section: SectionId | ((prev: SectionId) => SectionId)) => {
      // Support both direct value and updater function
      const nextSection = typeof section === 'function' ? section(activeSection) : section;
      if (isDirtyRef.current) {
        setPendingSection(nextSection);
      } else {
        setActiveSection(nextSection);
      }
    },
    [activeSection]
  );

  const confirmLeaveTab = useCallback(() => {
    if (pendingSection !== null) {
      isDirtyRef.current = false;
      setActiveSection(pendingSection);
      setPendingSection(null);
    }
  }, [pendingSection]);

  const cancelLeaveTab = useCallback(() => {
    setPendingSection(null);
  }, []);

  const showUnsavedDialog = pendingSection !== null;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Auto-expand parent sections when a child is active
  useEffect(() => {
    for (const group of sectionGroups) {
      for (const section of group.sections) {
        if (
          section.children &&
          (activeSection === section.id || section.children.some((c) => c.id === activeSection))
        ) {
          setExpandedSections((prev) => {
            if (prev.has(section.id)) return prev;
            const next = new Set(prev);
            next.add(section.id);
            return next;
          });
        }
      }
    }
  }, [activeSection]);

  const filteredGroups = useMemo(
    () => sectionGroups.filter((group) => group.sections.length > 0),
    []
  );

  // -------------------------------------------------------------------------
  // Conference data
  // -------------------------------------------------------------------------

  const {
    data: conference,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.conferences.detail(conferenceId),
    queryFn: async () => {
      const response = await api.get<Conference>(`/conferences/${conferenceId}`);
      return response.data;
    },
    enabled: !!conferenceId,
  });

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.conferences.detail(conferenceId) });
  };

  return {
    // Conference data
    conference,
    isLoading,
    isError,
    isAdmin,
    handleUpdate,

    // Sidebar navigation
    activeSection,
    setActiveSection: guardedSetActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    expandedSections,
    setExpandedSections,
    filteredGroups,

    // Router helpers
    navigate,
    conferenceId,

    // Unsaved changes guard
    setIsDirty,
    showUnsavedDialog,
    confirmLeaveTab,
    cancelLeaveTab,
  };
}
