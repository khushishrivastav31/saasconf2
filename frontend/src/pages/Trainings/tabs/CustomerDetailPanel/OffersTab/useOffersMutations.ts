import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { useToast } from '../../../../../components/Toast';
import { parseApiError } from '../../../../../utils/apiError';
import { queryKeys } from '../../../../../config/queryKeys';
import type { CustomerOffer } from '../../../../../types/training';
import type { CreateOfferForm, OfferForm, OfferType } from './types';

interface Params {
  customerId: string;
  onOfferCreated: (offer: CustomerOffer) => void;
  onOfferUpdated: (offer: CustomerOffer) => void;
  onOfferDeleted: () => void;
  onPlacementsAdded: (offer: CustomerOffer) => void;
  onPlacementRemoved: () => void;
  onPlacementRemoveError: () => void;
}

export function useOffersMutations({
  customerId,
  onOfferCreated,
  onOfferUpdated,
  onOfferDeleted,
  onPlacementsAdded,
  onPlacementRemoved,
  onPlacementRemoveError,
}: Params) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const invalidateOffers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customerOffers(customerId) });
    queryClient.invalidateQueries({ queryKey: ['available-placements'] });
  }, [queryClient, customerId]);

  const createOffer = useMutation({
    mutationFn: async ({ offerType, form }: { offerType: OfferType; form: CreateOfferForm }) => {
      const res = await api.post('/trainings/offers', {
        customer_id: customerId,
        offer_type: offerType,
        placement_ids: form.placement_ids,
        attendees: form.attendees,
        training_price: form.training_price,
        certification_price: form.certification_price,
        currency: form.currency,
        comments: form.comments,
        notes: form.notes,
        po_number: form.po_number,
      });
      return res.data as CustomerOffer;
    },
    onSuccess: (newOffer) => {
      invalidateOffers();
      showToast('Offer created', 'success');
      onOfferCreated(newOffer);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const updateOffer = useMutation({
    mutationFn: async ({ offerId, form }: { offerId: string; form: OfferForm }) => {
      const res = await api.put(`/trainings/offers/${offerId}`, form);
      return res.data as CustomerOffer;
    },
    onSuccess: (updated) => {
      invalidateOffers();
      showToast('Offer updated', 'success');
      if (updated) onOfferUpdated(updated);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteOffer = useMutation({
    mutationFn: async (offerId: string) => {
      await api.delete(`/trainings/offers/${offerId}`);
    },
    onSuccess: () => {
      invalidateOffers();
      showToast('Offer deleted', 'success');
      onOfferDeleted();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const addPlacements = useMutation({
    mutationFn: async ({ offerId, placementIds }: { offerId: string; placementIds: string[] }) => {
      const res = await api.post(`/trainings/offers/${offerId}/placements`, {
        placement_ids: placementIds,
      });
      return res.data as CustomerOffer;
    },
    onSuccess: (updated) => {
      invalidateOffers();
      showToast('Trainings added', 'success');
      if (updated) onPlacementsAdded(updated);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const removePlacement = useMutation({
    mutationFn: async ({
      offerId,
      placementId,
      deleteFromProgram,
    }: {
      offerId: string;
      placementId: string;
      deleteFromProgram: boolean;
    }) => {
      const res = await api.delete(
        `/trainings/offers/${offerId}/placements/${placementId}?delete_from_program=${deleteFromProgram}`
      );
      return res.data as CustomerOffer;
    },
    onSuccess: () => {
      invalidateOffers();
      showToast('Training removed from offer', 'success');
      onPlacementRemoved();
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      onPlacementRemoveError();
    },
  });

  return {
    createOffer,
    updateOffer,
    deleteOffer,
    addPlacements,
    removePlacement,
    invalidateOffers,
  };
}
