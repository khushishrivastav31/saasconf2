import { formatCurrency } from '../../../../utils/formatCurrency';
import { EXPENSE_STATUS_COLORS as STATUS_COLORS } from '../../../../config/statusColors';
import type { SpeakerAllowance, SpeakerExpense } from '../../../../types/conference';
import type { ExpenseTierItem, NewExpenseDraft, SpeakerGroup } from './types';
import TierBudgetBar from './TierBudgetBar';
import ExpenseRowsTable from './ExpenseRowsTable';
import AddExpenseInline from './AddExpenseInline';

interface Props {
  group: SpeakerGroup;
  expanded: boolean;
  isAdmin: boolean;
  allowance: SpeakerAllowance | undefined;
  tiers: ExpenseTierItem[];
  addDraft: NewExpenseDraft | null;
  isCreating: boolean;
  onToggle: () => void;
  onMessage: () => void;
  onAssignTier: (args: { cfpApplicantId: string; tierId: string; allowanceId?: string }) => void;
  onSelectExpense: (expense: SpeakerExpense) => void;
  onApprove: (expenseId: string) => void;
  onRequestReject: (expenseId: string) => void;
  onMarkPaid: (expenseId: string) => void;
  onStartAdd: () => void;
  onChangeDraft: (next: NewExpenseDraft) => void;
  onCancelAdd: () => void;
  onSaveAdd: () => void;
}

export default function SpeakerGroupCard({
  group,
  expanded,
  isAdmin,
  allowance,
  tiers,
  addDraft,
  isCreating,
  onToggle,
  onMessage,
  onAssignTier,
  onSelectExpense,
  onApprove,
  onRequestReject,
  onMarkPaid,
  onStartAdd,
  onChangeDraft,
  onCancelAdd,
  onSaveAdd,
}: Props) {
  const totalAmount = allowance?.total_approved ?? group.totalAmount;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="font-medium text-gray-900 dark:text-gray-100">{group.speakerName}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {group.expenses.length} expense{group.expenses.length !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-1">
            {Object.entries(group.statusCounts).map(([st, count]) => (
              <span
                key={st}
                className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[st] || ''}`}
              >
                {count} {st}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMessage();
              }}
              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              title={`Send message to ${group.speakerName}`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </button>
          )}
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(totalAmount, group.currency)}
          </span>
        </div>
      </div>

      {expanded && (
        <>
          <TierBudgetBar
            allowance={allowance}
            tiers={tiers}
            cfpApplicantId={group.cfpApplicantId}
            isAdmin={isAdmin}
            onAssignTier={onAssignTier}
          />
          <ExpenseRowsTable
            expenses={group.expenses}
            isAdmin={isAdmin}
            onSelect={onSelectExpense}
            onApprove={onApprove}
            onRequestReject={onRequestReject}
            onMarkPaid={onMarkPaid}
          />
          {isAdmin && (
            <AddExpenseInline
              active={!!addDraft}
              draft={addDraft ?? { title: '', amount: '', date: '', description: '' }}
              currency={group.currency}
              isPending={isCreating}
              onStart={onStartAdd}
              onChange={onChangeDraft}
              onCancel={onCancelAdd}
              onSave={onSaveAdd}
            />
          )}
        </>
      )}
    </div>
  );
}
