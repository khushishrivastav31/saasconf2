import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type {
  RecipientListListResponse,
  RecipientListDetailResponse,
} from '../../../../../types/messaging';

interface Applicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export function useStaticRecipientLists(conferenceId: string) {
  const queryClient = useQueryClient();
  const basePath = `/conferences/${conferenceId}/messaging/recipient-lists`;

  const [showModal, setShowModal] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formApplicantIds, setFormApplicantIds] = useState<string[]>([]);
  const [applicantSearch, setApplicantSearch] = useState('');

  const { data, isLoading } = useQuery<RecipientListListResponse>({
    queryKey: queryKeys.messaging.recipientLists(conferenceId),
    queryFn: () => api.get(basePath).then((r) => r.data),
  });

  const { data: editDetail } = useQuery<RecipientListDetailResponse>({
    queryKey: queryKeys.messaging.recipientListDetail(conferenceId, editingListId),
    queryFn: () => api.get(`${basePath}/${editingListId}`).then((r) => r.data),
    enabled: !!editingListId,
  });

  const { data: allApplicants } = useQuery({
    queryKey: queryKeys.cfp.applicantsForMessaging(conferenceId),
    queryFn: async () => {
      const resp = await api.get(`/cfp/applicants?conference_id=${conferenceId}`);
      return resp.data.items as Applicant[];
    },
    enabled: showModal,
  });

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingListId(null);
    setFormName('');
    setFormDescription('');
    setFormApplicantIds([]);
    setApplicantSearch('');
  }, []);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string; applicant_ids: string[] }) =>
      api.post(basePath, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.recipientLists(conferenceId),
      });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name: string;
      description: string;
      applicant_ids: string[];
    }) => api.put(`${basePath}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.recipientLists(conferenceId),
      });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${basePath}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.recipientLists(conferenceId),
      });
      setDeleteConfirm(null);
    },
  });

  const openCreate = useCallback(() => {
    setEditingListId(null);
    setFormName('');
    setFormDescription('');
    setFormApplicantIds([]);
    setApplicantSearch('');
    setShowModal(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingListId(id);
    setShowModal(true);
  }, []);

  useEffect(() => {
    if (editDetail && editingListId) {
      setFormName(editDetail.name);
      setFormDescription(editDetail.description ?? '');
      setFormApplicantIds(editDetail.members.map((m) => m.id));
    }
  }, [editDetail, editingListId]);

  const handleSave = useCallback(() => {
    const payload = {
      name: formName,
      description: formDescription,
      applicant_ids: formApplicantIds,
    };
    if (editingListId) {
      updateMutation.mutate({ id: editingListId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }, [formName, formDescription, formApplicantIds, editingListId, updateMutation, createMutation]);

  const lists = data?.items ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  return {
    lists,
    isLoading,
    showModal,
    editingListId,
    deleteConfirm,
    setDeleteConfirm,
    formName,
    setFormName,
    formDescription,
    setFormDescription,
    formApplicantIds,
    setFormApplicantIds,
    applicantSearch,
    setApplicantSearch,
    allApplicants,
    saving,
    deleteMutation,
    openCreate,
    openEdit,
    closeModal,
    handleSave,
  };
}
