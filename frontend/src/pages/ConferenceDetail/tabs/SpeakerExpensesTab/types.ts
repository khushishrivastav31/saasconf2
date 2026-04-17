import type { SpeakerExpense } from '../../../../types/conference';

export interface AttachmentItem {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
}

export interface ExpenseTierItem {
  id: string;
  name: string;
  max_amount: number;
  currency: string;
}

export interface SpeakerGroup {
  speakerName: string;
  cfpApplicantId: string;
  expenses: SpeakerExpense[];
  totalAmount: number;
  currency: string;
  statusCounts: Record<string, number>;
}

export interface MessageRecipient {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface NewExpenseDraft {
  title: string;
  amount: string;
  date: string;
  description: string;
}

export const emptyNewExpense: NewExpenseDraft = {
  title: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
};

export function groupBySpeaker(expenses: SpeakerExpense[]): SpeakerGroup[] {
  const groups: Record<string, SpeakerGroup> = {};
  for (const expense of expenses) {
    const key = expense.speaker_name;
    if (!groups[key]) {
      groups[key] = {
        speakerName: key,
        cfpApplicantId: expense.cfp_applicant_id,
        expenses: [],
        totalAmount: 0,
        currency: expense.original_currency,
        statusCounts: {},
      };
    }
    groups[key].expenses.push(expense);
    if (expense.status === 'approved' || expense.status === 'paid') {
      groups[key].totalAmount += expense.original_amount;
    }
    groups[key].statusCounts[expense.status] = (groups[key].statusCounts[expense.status] || 0) + 1;
  }
  return Object.values(groups).sort((a, b) => a.speakerName.localeCompare(b.speakerName));
}

export const VIEWS = ['expenses', 'allowances', 'defaults'] as const;
export type ExpensesView = (typeof VIEWS)[number];

export const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'] as const;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
