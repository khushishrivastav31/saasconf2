import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';

interface Args {
  conferenceId: string;
  onCreateSuccess: () => void;
  onRejectSuccess: () => void;
}

export function useSpeakerExpensesMutations({
  conferenceId,
  onCreateSuccess,
  onRejectSuccess,
}: Args) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [messageSending, setMessageSending] = useState(false);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.speakerExpenses.byConference(conferenceId),
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.speakerExpenses.stats(conferenceId) });
    queryClient.invalidateQueries({
      queryKey: queryKeys.speakerExpenses.allowances(conferenceId),
    });
  }, [queryClient, conferenceId]);

  const approveExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      await api.post(`/conferences/${conferenceId}/speaker-expenses/${expenseId}/approve`);
    },
    onSuccess: invalidate,
  });

  const rejectExpense = useMutation({
    mutationFn: async ({ expenseId, reason }: { expenseId: string; reason: string }) => {
      await api.post(`/conferences/${conferenceId}/speaker-expenses/${expenseId}/reject`, {
        reason,
      });
    },
    onSuccess: () => {
      invalidate();
      onRejectSuccess();
    },
  });

  const markPaid = useMutation({
    mutationFn: async (expenseId: string) => {
      await api.post(`/conferences/${conferenceId}/speaker-expenses/${expenseId}/mark-paid`, {});
    },
    onSuccess: invalidate,
  });

  const createExpense = useMutation({
    mutationFn: async (data: {
      cfp_applicant_id: string;
      title: string;
      expense_date: string;
      original_amount: number;
      original_currency: string;
      description?: string;
      status: string;
    }) => {
      await api.post(`/conferences/${conferenceId}/speaker-expenses`, data);
    },
    onSuccess: () => {
      invalidate();
      onCreateSuccess();
    },
  });

  const assignTier = useMutation({
    mutationFn: async ({
      cfpApplicantId,
      tierId,
      allowanceId,
    }: {
      cfpApplicantId: string;
      tierId: string;
      allowanceId?: string;
    }) => {
      if (allowanceId) {
        await api.post(
          `/conferences/${conferenceId}/speaker-expenses/allowances/${allowanceId}/assign-tier`,
          { expense_tier_id: tierId }
        );
      } else {
        await api.post(`/conferences/${conferenceId}/speaker-expenses/assign-tier`, {
          expense_tier_id: tierId,
          cfp_applicant_id: cfpApplicantId,
        });
      }
    },
    onSuccess: invalidate,
  });

  const sendMessage = useCallback(
    async (
      data: {
        recipient_applicant_ids: string[];
        subject: string;
        body_html: string;
        attachment_ids: string[];
        screen_overlay_id?: string | null;
      },
      onSuccess: () => void
    ) => {
      setMessageSending(true);
      try {
        await api.post(`/conferences/${conferenceId}/messaging/threads`, data);
        showToast('Message sent successfully', 'success');
        onSuccess();
      } catch {
        showToast('Failed to send message', 'error');
      } finally {
        setMessageSending(false);
      }
    },
    [conferenceId, showToast]
  );

  return {
    approveExpense,
    rejectExpense,
    markPaid,
    createExpense,
    assignTier,
    sendMessage,
    messageSending,
  };
}
