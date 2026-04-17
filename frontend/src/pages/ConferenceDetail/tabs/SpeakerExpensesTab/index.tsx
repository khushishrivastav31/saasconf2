import { useMemo, useState } from 'react';
import { formatCurrency } from '../../../../utils/formatCurrency';
import ComposeModal from '../MessagingTab/ComposeModal';
import { EmptyState } from '../../../../components/common/EmptyState';
import type { Conference } from '../../../../types';
import type { SpeakerExpense, SpeakerAllowance } from '../../../../types/conference';
import AllowancesView from './AllowancesView';
import DefaultsView from './DefaultsView';
import ExpensesViewToggle from './ExpensesViewToggle';
import ExpensesStatsBar from './ExpensesStatsBar';
import ExpensesFilters from './ExpensesFilters';
import SpeakerGroupCard from './SpeakerGroupCard';
import ExpenseDetailPanel from './ExpenseDetailPanel';
import RejectExpenseModal from './RejectExpenseModal';
import { useSpeakerExpensesData } from './useSpeakerExpensesData';
import { useSpeakerExpensesMutations } from './useSpeakerExpensesMutations';
import {
  emptyNewExpense,
  groupBySpeaker,
  type ExpensesView,
  type MessageRecipient,
  type NewExpenseDraft,
} from './types';

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

export default function SpeakerExpensesTab({ conference, isAdmin }: Props) {
  const currency = conference.currency || 'EUR';

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<ExpensesView>('expenses');
  const [expandedSpeaker, setExpandedSpeaker] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<SpeakerExpense | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [addExpenseFor, setAddExpenseFor] = useState<{
    speakerName: string;
    cfpApplicantId: string;
  } | null>(null);
  const [newExpense, setNewExpense] = useState<NewExpenseDraft>(emptyNewExpense);
  const [messageRecipient, setMessageRecipient] = useState<MessageRecipient | null>(null);

  const { expensesData, stats, allowances, tiers, allowanceDefaults, attachments } =
    useSpeakerExpensesData({
      conferenceId: conference.id,
      statusFilter,
      search,
      activeView,
      selectedExpenseId: selectedExpense?.id ?? null,
    });

  const {
    approveExpense,
    rejectExpense,
    markPaid,
    createExpense,
    assignTier,
    sendMessage,
    messageSending,
  } = useSpeakerExpensesMutations({
    conferenceId: conference.id,
    onCreateSuccess: () => {
      setAddExpenseFor(null);
      setNewExpense(emptyNewExpense);
    },
    onRejectSuccess: () => {
      setRejectId(null);
      setRejectReason('');
    },
  });

  const speakerGroups = useMemo(
    () => groupBySpeaker(expensesData?.items || []),
    [expensesData?.items]
  );

  const allowanceByApplicant = useMemo(() => {
    const map = new Map<string, SpeakerAllowance>();
    for (const a of allowances || []) {
      if (a.speaker_name) map.set(a.speaker_name, a);
    }
    return map;
  }, [allowances]);

  const handleSaveAdd = () => {
    if (!addExpenseFor) return;
    const amount = parseFloat(newExpense.amount);
    if (!newExpense.title.trim() || isNaN(amount) || amount <= 0 || !newExpense.date) return;
    createExpense.mutate({
      cfp_applicant_id: addExpenseFor.cfpApplicantId,
      title: newExpense.title.trim(),
      expense_date: newExpense.date,
      original_amount: amount,
      original_currency: currency,
      description: newExpense.description || undefined,
      status: 'submitted',
    });
  };

  return (
    <div className="space-y-6">
      <ExpensesViewToggle activeView={activeView} onChange={setActiveView} />

      <ExpensesStatsBar
        stats={stats}
        currency={currency}
        statusFilter={statusFilter}
        onStatusClick={(status) => setStatusFilter(statusFilter === status ? '' : status)}
      />

      {activeView === 'expenses' && (
        <>
          <ExpensesFilters
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

          <div className="space-y-3">
            {speakerGroups.map((group) => {
              const isAddingForGroup = addExpenseFor?.cfpApplicantId === group.cfpApplicantId;
              return (
                <SpeakerGroupCard
                  key={group.speakerName}
                  group={group}
                  expanded={expandedSpeaker === group.speakerName}
                  isAdmin={isAdmin}
                  allowance={allowanceByApplicant.get(group.speakerName)}
                  tiers={tiers}
                  addDraft={isAddingForGroup ? newExpense : null}
                  isCreating={createExpense.isPending}
                  onToggle={() =>
                    setExpandedSpeaker(
                      expandedSpeaker === group.speakerName ? null : group.speakerName
                    )
                  }
                  onMessage={() => {
                    const nameParts = group.speakerName.split(' ');
                    setMessageRecipient({
                      id: group.cfpApplicantId,
                      first_name: nameParts[0] || '',
                      last_name: nameParts.slice(1).join(' ') || '',
                      email: '',
                    });
                  }}
                  onAssignTier={(args) => assignTier.mutate(args)}
                  onSelectExpense={setSelectedExpense}
                  onApprove={(expenseId) => approveExpense.mutate(expenseId)}
                  onRequestReject={(expenseId) => setRejectId(expenseId)}
                  onMarkPaid={(expenseId) => markPaid.mutate(expenseId)}
                  onStartAdd={() =>
                    setAddExpenseFor({
                      speakerName: group.speakerName,
                      cfpApplicantId: group.cfpApplicantId,
                    })
                  }
                  onChangeDraft={setNewExpense}
                  onCancelAdd={() => {
                    setAddExpenseFor(null);
                    setNewExpense(emptyNewExpense);
                  }}
                  onSaveAdd={handleSaveAdd}
                />
              );
            })}

            {speakerGroups.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <EmptyState
                  icon={
                    <svg
                      className="w-12 h-12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                      />
                    </svg>
                  }
                  title="No expenses found"
                  description="Speakers submit expenses through the portal."
                />
              </div>
            )}
          </div>
        </>
      )}

      {activeView === 'allowances' && (
        <AllowancesView
          isAdmin={isAdmin}
          allowances={allowances}
          tiers={tiers}
          assignTier={assignTier}
          formatCurrency={formatCurrency}
        />
      )}

      {activeView === 'defaults' && (
        <DefaultsView allowanceDefaults={allowanceDefaults} formatCurrency={formatCurrency} />
      )}

      {selectedExpense && (
        <ExpenseDetailPanel
          expense={selectedExpense}
          attachments={attachments}
          isAdmin={isAdmin}
          onClose={() => setSelectedExpense(null)}
          onApprove={() => {
            approveExpense.mutate(selectedExpense.id);
            setSelectedExpense(null);
          }}
          onRequestReject={() => {
            setRejectId(selectedExpense.id);
            setSelectedExpense(null);
          }}
          onMarkPaid={() => {
            markPaid.mutate(selectedExpense.id);
            setSelectedExpense(null);
          }}
        />
      )}

      {rejectId && (
        <RejectExpenseModal
          reason={rejectReason}
          onChangeReason={setRejectReason}
          onCancel={() => {
            setRejectId(null);
            setRejectReason('');
          }}
          onConfirm={() => rejectExpense.mutate({ expenseId: rejectId, reason: rejectReason })}
          isPending={rejectExpense.isPending}
        />
      )}

      <ComposeModal
        conferenceId={conference.id}
        open={!!messageRecipient}
        onClose={() => setMessageRecipient(null)}
        onSend={(data) => sendMessage(data, () => setMessageRecipient(null))}
        sending={messageSending}
        initialRecipient={messageRecipient}
        initialSubject="Regarding your speaker expenses"
      />
    </div>
  );
}
