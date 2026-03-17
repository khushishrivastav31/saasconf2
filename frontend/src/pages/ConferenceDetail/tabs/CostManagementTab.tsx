import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { formatCurrency } from '../../../utils/formatCurrency';
import type { Conference } from '../../../types';
import type { Budget, ExpenseStats } from '../../../types/conference';

interface CostManagementTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function CostManagementTab({ conference }: CostManagementTabProps) {
  const currency = conference.currency || 'EUR';

  // ── Budget data ──
  const { data: budgetsData, isLoading: budgetsLoading } = useQuery({
    queryKey: queryKeys.budgets.byConference(conference.id),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/budgets`);
      return data as { items: Budget[]; total: number };
    },
  });

  // ── Speaker Expenses stats ──
  const { data: expenseStats, isLoading: expensesLoading } = useQuery({
    queryKey: queryKeys.speakerExpenses.stats(conference.id),
    queryFn: async () => {
      const { data } = await api.get(`/conferences/${conference.id}/speaker-expenses/stats`);
      return data as ExpenseStats;
    },
  });

  // ── Aggregate budget totals across all budgets ──
  const budgetTotals = useMemo(() => {
    if (!budgetsData?.items?.length) return null;
    const budgets = budgetsData.items;
    return {
      count: budgets.length,
      totalPlanned: budgets.reduce((s, b) => s + b.total_planned, 0),
      totalActual: budgets.reduce((s, b) => s + b.total_actual, 0),
      totalRemaining: budgets.reduce((s, b) => s + b.total_remaining, 0),
    };
  }, [budgetsData]);

  // ── Expense status breakdown ──
  const expenseBreakdown = useMemo(() => {
    if (!expenseStats?.by_status?.length) return null;
    const map: Record<string, { count: number; amount: number }> = {};
    for (const s of expenseStats.by_status) {
      map[s.status] = { count: s.count, amount: s.total_amount };
    }
    return map;
  }, [expenseStats]);

  const isLoading = budgetsLoading || expensesLoading;
  const hasBudgets = !!budgetTotals;
  const hasExpenses = expenseStats && expenseStats.total_expenses > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Cost Management</h2>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : !hasBudgets && !hasExpenses ? (
        <div className="text-center py-12">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No Cost Data Yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Create a budget in Budget Planning or add speaker expenses to see a summary here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Budget Planning Summary ── */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Budget Planning
            </h3>
            {hasBudgets ? (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <SummaryCard
                    label="Total Planned"
                    value={formatCurrency(budgetTotals.totalPlanned, currency)}
                    color="text-gray-900 dark:text-gray-100"
                  />
                  <SummaryCard
                    label="Total Spent"
                    value={formatCurrency(budgetTotals.totalActual, currency)}
                    color="text-gray-900 dark:text-gray-100"
                  />
                  <SummaryCard
                    label="Remaining"
                    value={formatCurrency(budgetTotals.totalRemaining, currency)}
                    color={
                      budgetTotals.totalRemaining >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }
                  />
                  <SummaryCard
                    label="Budgets"
                    value={String(budgetTotals.count)}
                    color="text-gray-900 dark:text-gray-100"
                  />
                </div>
                {/* Progress bar */}
                {budgetTotals.totalPlanned > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Budget Used</span>
                      <span>
                        {Math.min(
                          100,
                          Math.round((budgetTotals.totalActual / budgetTotals.totalPlanned) * 100)
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          budgetTotals.totalActual / budgetTotals.totalPlanned > 1
                            ? 'bg-red-500'
                            : budgetTotals.totalActual / budgetTotals.totalPlanned > 0.8
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (budgetTotals.totalActual / budgetTotals.totalPlanned) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No budgets created yet. Go to Budget Planning to get started.
              </p>
            )}
          </div>

          {/* ── Speaker Expenses Summary ── */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Speaker Expenses
            </h3>
            {hasExpenses ? (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <SummaryCard
                    label="Total Expenses"
                    value={String(expenseStats.total_expenses)}
                    color="text-gray-900 dark:text-gray-100"
                  />
                  <SummaryCard
                    label="Total Amount"
                    value={formatCurrency(
                      expenseStats.total_amount,
                      expenseStats.currency || currency
                    )}
                    color="text-gray-900 dark:text-gray-100"
                  />
                  <SummaryCard
                    label="Approved"
                    value={formatCurrency(
                      expenseBreakdown?.approved?.amount ?? 0,
                      expenseStats.currency || currency
                    )}
                    color="text-green-600 dark:text-green-400"
                  />
                  <SummaryCard
                    label="Paid"
                    value={formatCurrency(
                      expenseBreakdown?.paid?.amount ?? 0,
                      expenseStats.currency || currency
                    )}
                    color="text-purple-600 dark:text-purple-400"
                  />
                </div>
                {/* Status breakdown */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    By Status
                  </p>
                  {expenseStats.by_status.map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <StatusDot status={s.status} />
                        <span className="capitalize text-gray-700 dark:text-gray-300">
                          {s.status}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">({s.count})</span>
                      </span>
                      <span className="text-gray-900 dark:text-gray-100 font-medium">
                        {formatCurrency(s.total_amount, expenseStats.currency || currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No speaker expenses recorded yet. Go to Speaker Expenses to add claims.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper components ──

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-900 p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

const STATUS_DOT_COLORS: Record<string, string> = {
  draft: 'bg-gray-400',
  submitted: 'bg-blue-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  paid: 'bg-purple-500',
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT_COLORS[status] || 'bg-gray-400'}`}
    />
  );
}
