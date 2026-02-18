import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useConferenceAdmin } from '../../hooks/useConferenceAdmin';
import api from '../../config/api';
import type { Conference } from '../../types';
import { parseApiError } from '../../utils/apiError';
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
  canDelete: boolean | undefined;
  handleUpdate: () => void;

  // Sidebar navigation
  activeSection: SectionId;
  setActiveSection: React.Dispatch<React.SetStateAction<SectionId>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  expandedSections: Set<string>;
  setExpandedSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  sections: SectionDef[];

  // Delete logic
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  deletePreview: DeletePreview | null;
  setDeletePreview: React.Dispatch<React.SetStateAction<DeletePreview | null>>;
  deleteLoading: boolean;
  deleteError: string | null;
  setDeleteError: React.Dispatch<React.SetStateAction<string | null>>;
  handleDeleteClick: () => Promise<void>;
  handleConfirmDelete: () => Promise<void>;

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

  // Only super admins and tenant super users can delete conferences
  const canDelete = user?.role === 'super_admin' || user?.is_tenant_super_user;

  // -------------------------------------------------------------------------
  // Sidebar navigation
  // -------------------------------------------------------------------------

  const [activeSection, setActiveSection] = useState<SectionId>('details');
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
  // Delete logic
  // -------------------------------------------------------------------------

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const handleDeleteClick = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      const response = await api.get<DeletePreview>(`/conferences/${conferenceId}/delete-preview`);
      setDeletePreview(response.data);
      setShowDeleteConfirm(true);
    } catch {
      setDeleteError('Failed to load deletion preview');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await api.delete(`/conferences/${conferenceId}`);
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      queryClient.invalidateQueries({ queryKey: ['conference-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-volunteers'] });
      queryClient.invalidateQueries({ queryKey: ['all-locations'] });
      queryClient.invalidateQueries({ queryKey: ['all-cfps'] });
      navigate('/modules/conferences');
    } catch (error: unknown) {
      setDeleteError(parseApiError(error, 'Failed to delete conference'));
      setDeleteLoading(false);
    }
  };

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['conference', conferenceId] });
  };

  return {
    // Conference data
    conference,
    isLoading,
    isError,
    isAdmin,
    canDelete,
    handleUpdate,

    // Sidebar navigation
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    expandedSections,
    setExpandedSections,
    sections,

    // Delete logic
    showDeleteConfirm,
    setShowDeleteConfirm,
    deletePreview,
    setDeletePreview,
    deleteLoading,
    deleteError,
    setDeleteError,
    handleDeleteClick,
    handleConfirmDelete,

    // Router helpers
    navigate,
    conferenceId,
  };
}
