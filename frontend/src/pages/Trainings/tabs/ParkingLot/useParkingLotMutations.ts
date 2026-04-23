import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';

export function useParkingLotMutations(onReassignSuccess: () => void) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const cancelRegistration = useMutation({
    mutationFn: (attendeeId: string) => api.post(`/trainings/attendees/${attendeeId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-attendees'] });
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      showToast(
        'Booking cancelled — invoice voided, credit note sent. Attendee is now active.',
        'success'
      );
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        'Failed to cancel registration';
      showToast(detail, 'error');
    },
  });

  const reassign = useMutation({
    mutationFn: ({
      attendeeId,
      placementId,
      keepInvoice,
    }: {
      attendeeId: string;
      placementId: string;
      keepInvoice: boolean;
    }) =>
      api.post(`/trainings/attendees/${attendeeId}/reassign`, {
        placement_id: placementId,
        keep_invoice: keepInvoice,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-attendees'] });
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      const d = res.data;
      let msg = 'Attendee reassigned to new training';
      if (d.kept_invoice_id) msg = 'Attendee reassigned — invoice unchanged';
      else if (d.new_invoice_id)
        msg = 'Attendee reassigned — old invoice cancelled, new invoice sent';
      showToast(msg, 'success');
      onReassignSuccess();
    },
    onError: () => showToast('Failed to reassign attendee', 'error'),
  });

  return { cancelRegistration, reassign };
}
