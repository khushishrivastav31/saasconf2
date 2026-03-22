import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import { parseApiError } from '../../../../../utils/apiError';
import type {
  UnifiedRegistrationCreate,
  UnifiedRegistrationResponse,
  RegistrationItemCreate,
  RegistrationItem,
} from '../../../../../types';

interface MutationCallbacks {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onCreateSuccess: (res: UnifiedRegistrationResponse) => void;
  onDeleteSuccess: () => void;
  onAddItemSuccess: () => void;
}

export function useRegistrationMutations(conferenceId: string, callbacks: MutationCallbacks) {
  const queryClient = useQueryClient();

  const invalidateRegistrations = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.registrations.byConference(conferenceId),
    });
  };

  const invalidateInvoices = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.invoices.byConference(conferenceId),
    });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: UnifiedRegistrationCreate) => {
      const response = await api.post<UnifiedRegistrationResponse>(
        `/conferences/${conferenceId}/registrations`,
        payload
      );
      return response.data;
    },
    onSuccess: (res) => {
      invalidateRegistrations();
      invalidateInvoices();
      callbacks.onCreateSuccess(res);
    },
    onError: (err: unknown) =>
      callbacks.onError(parseApiError(err, 'Failed to create registration')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/registrations/${id}`);
    },
    onSuccess: () => {
      invalidateRegistrations();
      callbacks.onDeleteSuccess();
      callbacks.onSuccess('Registration deleted');
    },
    onError: (err: unknown) =>
      callbacks.onError(parseApiError(err, 'Failed to delete registration')),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ regId, data: d }: { regId: string; data: RegistrationItemCreate }) => {
      const response = await api.post<RegistrationItem>(
        `/conferences/${conferenceId}/registrations/${regId}/items`,
        d
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateRegistrations();
      callbacks.onAddItemSuccess();
      callbacks.onSuccess('Item added to registration');
    },
    onError: (err: unknown) => callbacks.onError(parseApiError(err, 'Failed to add item')),
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ regId, itemId }: { regId: string; itemId: string }) => {
      await api.delete(`/conferences/${conferenceId}/registrations/${regId}/items/${itemId}`);
    },
    onSuccess: () => {
      invalidateRegistrations();
      callbacks.onSuccess('Item removed');
    },
    onError: (err: unknown) => callbacks.onError(parseApiError(err, 'Failed to remove item')),
  });

  const updateItemSessionMutation = useMutation({
    mutationFn: async ({
      regId,
      itemId,
      sessionId,
    }: {
      regId: string;
      itemId: string;
      sessionId: string | null;
    }) => {
      const response = await api.patch(
        `/conferences/${conferenceId}/registrations/${regId}/items/${itemId}`,
        { program_session_id: sessionId }
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateRegistrations();
      callbacks.onSuccess('Session updated');
    },
    onError: (err: unknown) => callbacks.onError(parseApiError(err, 'Failed to update session')),
  });

  const updateMainSessionMutation = useMutation({
    mutationFn: async ({ regId, sessionId }: { regId: string; sessionId: string | null }) => {
      const response = await api.put(`/conferences/${conferenceId}/registrations/${regId}`, {
        main_session_id: sessionId,
      });
      return response.data;
    },
    onSuccess: () => {
      invalidateRegistrations();
      callbacks.onSuccess('Tutorial selection updated');
    },
    onError: (err: unknown) =>
      callbacks.onError(parseApiError(err, 'Failed to update tutorial selection')),
  });

  return {
    createMutation,
    deleteMutation,
    addItemMutation,
    removeItemMutation,
    updateItemSessionMutation,
    updateMainSessionMutation,
  };
}
