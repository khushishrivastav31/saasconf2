import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { parseApiError } from '../../../../utils/apiError';
import type {
  BookingPeriodCreate,
  BookingOptionCreate,
  BookingPackageCreate,
  DiscountCodeCreate,
  BulkDiscountCodeCreate,
} from '../../../../types';

/** Callbacks used to close the relevant modal / clear inline edit on success. */
export interface BookingMutationClosers {
  addPeriod: () => void;
  editPeriod: () => void;
  delete: () => void;
  addOption: () => void;
  editOption: () => void;
  addDiscount: () => void;
  editDiscount: () => void;
  bulkDiscount: () => void;
  addPackage: () => void;
  editPackage: () => void;
}

/**
 * All create/update/delete mutations for the booking matrix (periods, options,
 * packages, discount codes). Extracted from BookingTab so the tab component
 * stays focused on layout and modal state.
 */
export function useBookingMutations(
  conferenceId: string,
  setApiError: (message: string) => void,
  close: BookingMutationClosers
) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.booking.matrix(conferenceId) });
  };

  const invalidateDiscounts = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.booking.discountCodes(conferenceId) });
  };

  const onError = (error: unknown) => setApiError(parseApiError(error));

  // --- Period mutations ---
  const createPeriodMutation = useMutation({
    mutationFn: async (data: BookingPeriodCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/booking-periods`, data);
    },
    onSuccess: () => {
      invalidate();
      close.addPeriod();
      setApiError('');
    },
    onError,
  });

  const updatePeriodMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/booking-periods/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      close.editPeriod();
      setApiError('');
    },
    onError,
  });

  const deletePeriodMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/booking-periods/${id}`);
    },
    onSuccess: () => {
      invalidate();
      close.delete();
      setApiError('');
    },
    onError,
  });

  // --- Option mutations ---
  const createOptionMutation = useMutation({
    mutationFn: async (data: BookingOptionCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/booking-options`, data);
    },
    onSuccess: () => {
      invalidate();
      close.addOption();
      setApiError('');
    },
    onError,
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/booking-options/${id}`);
    },
    onSuccess: () => {
      invalidate();
      close.delete();
      setApiError('');
    },
    onError,
  });

  const updateOptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/booking-options/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      // Option name syncs to program day name on the backend, so refresh program days too
      queryClient.invalidateQueries({ queryKey: queryKeys.program.days(conferenceId) });
      close.editOption();
      setApiError('');
    },
    onError,
  });

  // --- Discount code mutations ---
  const createDiscountMutation = useMutation({
    mutationFn: async (data: DiscountCodeCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/discount-codes`, data);
    },
    onSuccess: () => {
      invalidateDiscounts();
      close.addDiscount();
      setApiError('');
    },
    onError,
  });

  const updateDiscountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/discount-codes/${id}`, data);
    },
    onSuccess: () => {
      invalidateDiscounts();
      close.editDiscount();
      setApiError('');
    },
    onError,
  });

  const deleteDiscountMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/discount-codes/${id}`);
    },
    onSuccess: () => {
      invalidateDiscounts();
      close.delete();
      setApiError('');
    },
    onError,
  });

  const bulkCreateDiscountMutation = useMutation({
    mutationFn: async (data: BulkDiscountCodeCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/discount-codes/bulk`, data);
    },
    onSuccess: () => {
      invalidateDiscounts();
      close.bulkDiscount();
      setApiError('');
    },
    onError,
  });

  // --- Package mutations ---
  const createPackageMutation = useMutation({
    mutationFn: async (data: BookingPackageCreate) => {
      await api.post(`/conferences/${conferenceId}/settings/booking-packages`, data);
    },
    onSuccess: () => {
      invalidate();
      close.addPackage();
      setApiError('');
    },
    onError,
  });

  const updatePackageMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.put(`/conferences/${conferenceId}/settings/booking-packages/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      close.editPackage();
      setApiError('');
    },
    onError,
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/settings/booking-packages/${id}`);
    },
    onSuccess: () => {
      invalidate();
      close.delete();
      setApiError('');
    },
    onError,
  });

  return {
    createPeriodMutation,
    updatePeriodMutation,
    deletePeriodMutation,
    createOptionMutation,
    deleteOptionMutation,
    updateOptionMutation,
    createDiscountMutation,
    updateDiscountMutation,
    deleteDiscountMutation,
    bulkCreateDiscountMutation,
    createPackageMutation,
    updatePackageMutation,
    deletePackageMutation,
  };
}
