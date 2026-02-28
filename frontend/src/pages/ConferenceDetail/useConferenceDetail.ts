import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useConferenceAdmin } from '../../hooks/useConferenceAdmin';
import api from '../../config/api';
import type { Conference } from '../../types';
import { SectionId, SectionDef, coreSections, moduleSections } from './conferenceSections';

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
  sections: SectionDef[];

  // Router helpers
  navigate: ReturnType<typeof useNavigate>;
  conferenceId: string | undefined;
}

// ---------------------------------------------------------------------------
// Custom hook
// ---------------------------------------------------------------------------

export function useConferenceDetail(conferenceId: string | undefined): UseConferenceDetailReturn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useConferenceAdmin(conferenceId);

  // -------------------------------------------------------------------------
  // Sidebar navigation — synced with URL ?tab= param
  // -------------------------------------------------------------------------

  const [searchParams, setSearchParams] = useSearchParams();

  // Collect all valid section IDs (including children)
  const validSectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of [...coreSections, ...moduleSections]) {
      ids.add(s.id);
      if (s.children) {
        for (const c of s.children) ids.add(c.id);
      }
    }
    return ids;
  }, []);

  const tabFromUrl = searchParams.get('tab');
  const initialSection: SectionId =
    tabFromUrl && validSectionIds.has(tabFromUrl) ? (tabFromUrl as SectionId) : 'details';

  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);

  // Sync URL ?tab= param whenever activeSection changes (in an effect, not during render)
  useEffect(() => {
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Auto-expand parent sections when a child is active
  useEffect(() => {
    for (const section of moduleSections) {
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
  }, [activeSection]);

  // Build sections: core sections are always visible, module sections depend on user's assigned modules
  const sections = useMemo(() => {
    const userModules = user?.modules ?? [];
    const isSuperAdmin = user?.role === 'super_admin';
    const available = moduleSections.filter(
      (s) => !s.moduleCode || isSuperAdmin || userModules.includes(s.moduleCode)
    );
    return [...coreSections, ...available];
  }, [user?.modules, user?.role]);

  // -------------------------------------------------------------------------
  // Conference data
  // -------------------------------------------------------------------------

  const {
    data: conference,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['conference', conferenceId],
    queryFn: async () => {
      const response = await api.get<Conference>(`/conferences/${conferenceId}`);
      return response.data;
    },
    enabled: !!conferenceId,
  });

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['conference', conferenceId] });
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
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    expandedSections,
    setExpandedSections,
    sections,

    // Router helpers
    navigate,
    conferenceId,
  };
}
