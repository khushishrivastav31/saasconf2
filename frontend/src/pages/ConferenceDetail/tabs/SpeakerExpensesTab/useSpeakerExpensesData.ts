import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type {
  SpeakerExpense,
  ExpenseStats,
  SpeakerAllowance,
  AllowanceDefault,
} from '../../../../types/conference';
import type { AttachmentItem, ExpenseTierItem } from './types';

interface Args {
  conferenceId: string;
  statusFilter: string;
  search: string;
  activeView: string;
  selectedExpenseId: string | null;
}

export function useSpeakerExpensesData({
  conferenceId,
  statusFilter,
  search,
  activeView,
  selectedExpenseId,
}: Args) {
  const { data: expensesData } = useQuery({
    queryKey: [...queryKeys.speakerExpenses.byConference(conferenceId), statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const { data } = await api.get(
        `/conferences/${conferenceId}/speaker-expenses?${params.toString()}`
      );
      return data as { items: SpeakerExpense[]; total: number };
    },
  });

  const { data: stats } = useQuery({
    queryKey: queryKeys.speakerExpenses.stats(conferenceId),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conferenceId}/speaker-expenses/stats`);
      return data as ExpenseStats;
    },
  });

  const { data: allowances } = useQuery({
    queryKey: queryKeys.speakerExpenses.allowances(conferenceId),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conferenceId}/speaker-expenses/allowances`);
      return data as SpeakerAllowance[];
    },
  });

  const { data: tiers = [] } = useQuery({
    queryKey: queryKeys.speakerExpenses.tiers(conferenceId),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conferenceId}/speaker-expenses/tiers`);
      return data as ExpenseTierItem[];
    },
  });

  const { data: allowanceDefaults } = useQuery({
    queryKey: queryKeys.speakerExpenses.allowanceDefaults(conferenceId),
    queryFn: async () => {
      const { data } = await api.get(
        `/conferences/${conferenceId}/speaker-expenses/allowance-defaults`
      );
      return data as AllowanceDefault[];
    },
    enabled: activeView === 'defaults',
  });

  const { data: attachments } = useQuery({
    queryKey: ['attachments', 'speaker_expense', selectedExpenseId],
    queryFn: async () => {
      const { data } = await api.get(
        `/attachments?entity_type=speaker_expense&entity_id=${selectedExpenseId}`
      );
      return data.items as AttachmentItem[];
    },
    enabled: !!selectedExpenseId,
  });

  return { expensesData, stats, allowances, tiers, allowanceDefaults, attachments };
}
