import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type {
  DynamicRecipientListListResponse,
  DynamicRecipientList,
  RecipientPreviewResponse,
} from '../../../../../types/messaging';

export function useDynamicRecipientLists(conferenceId: string) {
  const queryClient = useQueryClient();
  const dynamicBasePath = `/conferences/${conferenceId}/messaging/dynamic-lists`;

  const [showDynamicModal, setShowDynamicModal] = useState(false);
  const [editingDynamicId, setEditingDynamicId] = useState<string | null>(null);
  const [deleteDynamicConfirm, setDeleteDynamicConfirm] = useState<string | null>(null);

  const [dlName, setDlName] = useState('');
  const [dlDescription, setDlDescription] = useState('');
  const [dlTargetType, setDlTargetType] = useState<'registration' | 'sponsor'>('registration');
  const [dlFilters, setDlFilters] = useState<Record<string, unknown>>({});

  const { data: dynamicListsData, isLoading: dynamicLoading } =
    useQuery<DynamicRecipientListListResponse>({
      queryKey: queryKeys.messaging.dynamicLists(conferenceId),
      queryFn: () => api.get(dynamicBasePath).then((r) => r.data),
    });

  const dynamicLists = dynamicListsData?.items ?? [];

  const { data: bookingOptions } = useQuery({
    queryKey: queryKeys.booking.options(conferenceId),
    queryFn: () =>
      api.get(`/conferences/${conferenceId}/booking/options`).then((r) => r.data?.items ?? r.data),
    enabled: showDynamicModal && dlTargetType === 'registration',
  });

  const { data: bookableSessions } = useQuery({
    queryKey: queryKeys.program.sessions(conferenceId),
    queryFn: () =>
      api
        .get(`/conferences/${conferenceId}/program/sessions?bookable=true`)
        .then((r) => r.data?.items ?? r.data),
    enabled: showDynamicModal && dlTargetType === 'registration',
  });

  const { data: sponsorPackages } = useQuery({
    queryKey: queryKeys.sponsors.packages(conferenceId),
    queryFn: () =>
      api
        .get(`/conferences/${conferenceId}/settings/sponsor-packages`)
        .then((r) => r.data?.items ?? r.data),
    enabled: showDynamicModal && dlTargetType === 'sponsor',
  });

  const previewFilter = useMemo(() => {
    if (!showDynamicModal) return null;
    if (dlTargetType === 'registration') return { all_registrations: true };
    if (dlTargetType === 'sponsor') return { all_sponsors: true };
    return null;
  }, [showDynamicModal, dlTargetType]);

  const { data: dlPreview, isFetching: dlPreviewLoading } = useQuery<RecipientPreviewResponse>({
    queryKey: ['dl-preview', conferenceId, dlTargetType, dlFilters],
    queryFn: async () => {
      if (editingDynamicId) {
        return api.get(`${dynamicBasePath}/${editingDynamicId}/preview`).then((r) => r.data);
      }
      return api
        .post(`/conferences/${conferenceId}/messaging/recipient-count`, previewFilter)
        .then((r) => r.data);
    },
    enabled: showDynamicModal && previewFilter !== null,
    staleTime: 15_000,
  });

  const closeDynamicModal = useCallback(() => {
    setShowDynamicModal(false);
    setEditingDynamicId(null);
    setDlName('');
    setDlDescription('');
    setDlTargetType('registration');
    setDlFilters({});
  }, []);

  const createDynamicMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description: string;
      target_type: string;
      filters: Record<string, unknown>;
    }) => api.post(dynamicBasePath, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.dynamicLists(conferenceId),
      });
      closeDynamicModal();
    },
  });

  const updateDynamicMutation = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name: string;
      description: string;
      filters: Record<string, unknown>;
    }) => api.put(`${dynamicBasePath}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.dynamicLists(conferenceId),
      });
      closeDynamicModal();
    },
  });

  const deleteDynamicMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${dynamicBasePath}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.dynamicLists(conferenceId),
      });
      setDeleteDynamicConfirm(null);
    },
  });

  const openDynamicCreate = useCallback(() => {
    setEditingDynamicId(null);
    setDlName('');
    setDlDescription('');
    setDlTargetType('registration');
    setDlFilters({});
    setShowDynamicModal(true);
  }, []);

  const openDynamicEdit = useCallback((dl: DynamicRecipientList) => {
    setEditingDynamicId(dl.id);
    setDlName(dl.name);
    setDlDescription(dl.description ?? '');
    setDlTargetType(dl.target_type);
    setDlFilters(dl.filters);
    setShowDynamicModal(true);
  }, []);

  const handleDynamicSave = useCallback(() => {
    if (editingDynamicId) {
      updateDynamicMutation.mutate({
        id: editingDynamicId,
        name: dlName,
        description: dlDescription,
        filters: dlFilters,
      });
    } else {
      createDynamicMutation.mutate({
        name: dlName,
        description: dlDescription,
        target_type: dlTargetType,
        filters: dlFilters,
      });
    }
  }, [
    editingDynamicId,
    dlName,
    dlDescription,
    dlTargetType,
    dlFilters,
    updateDynamicMutation,
    createDynamicMutation,
  ]);

  const updateFilter = useCallback((key: string, value: unknown) => {
    setDlFilters((prev) => {
      const next = { ...prev };
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const dynamicSaving = createDynamicMutation.isPending || updateDynamicMutation.isPending;

  return {
    dynamicLists,
    dynamicLoading,
    showDynamicModal,
    editingDynamicId,
    deleteDynamicConfirm,
    setDeleteDynamicConfirm,
    dlName,
    setDlName,
    dlDescription,
    setDlDescription,
    dlTargetType,
    setDlTargetType,
    dlFilters,
    bookingOptions,
    bookableSessions,
    sponsorPackages,
    dlPreview,
    dlPreviewLoading,
    dynamicSaving,
    deleteDynamicMutation,
    openDynamicCreate,
    openDynamicEdit,
    closeDynamicModal,
    handleDynamicSave,
    updateFilter,
  };
}
