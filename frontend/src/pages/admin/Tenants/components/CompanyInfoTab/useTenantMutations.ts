import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { useToast } from '../../../../../components/Toast';
import { parseApiError } from '../../../../../utils/apiError';
import type { Tenant, TenantUpdate } from '../../../../../types';

export type LogoStatus = 'idle' | 'uploading' | 'deleting' | 'error';

interface UseTenantMutationsArgs {
  tenant: Tenant;
  onUpdate: () => void;
  onClose: () => void;
}

export function useTenantMutations({ tenant, onUpdate, onClose }: UseTenantMutationsArgs) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [logoStatus, setLogoStatus] = useState<LogoStatus>('idle');
  const [logoError, setLogoError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUpdate) => {
      await api.put(`/admin/tenants/${tenant.id}`, data);
    },
    onSuccess: () => {
      onUpdate();
      showToast('Company details saved', 'success');
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/admin/tenants/${tenant.id}`, {
        is_active: !tenant.is_active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/admin/tenants/${tenant.id}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/admin/tenants/${tenant.id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onMutate: () => {
      setLogoStatus('uploading');
      setLogoError(null);
    },
    onSuccess: () => {
      setLogoStatus('idle');
      onUpdate();
    },
    onError: (err) => {
      setLogoStatus('error');
      setLogoError(parseApiError(err));
      setTimeout(() => setLogoStatus('idle'), 3000);
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/admin/tenants/${tenant.id}/logo`);
    },
    onMutate: () => {
      setLogoStatus('deleting');
      setLogoError(null);
    },
    onSuccess: () => {
      setLogoStatus('idle');
      onUpdate();
    },
    onError: (err) => {
      setLogoStatus('error');
      setLogoError(parseApiError(err));
      setTimeout(() => setLogoStatus('idle'), 3000);
    },
  });

  return {
    updateMutation,
    toggleActiveMutation,
    deleteMutation,
    uploadLogoMutation,
    deleteLogoMutation,
    logoStatus,
    logoError,
  };
}
