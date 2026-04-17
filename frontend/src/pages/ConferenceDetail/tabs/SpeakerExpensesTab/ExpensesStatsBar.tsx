import { formatCurrency } from '../../../../utils/formatCurrency';
import type { ExpenseStats } from '../../../../types/conference';
import { STATUSES } from './types';

interface Props {
  stats: ExpenseStats | undefined;
  currency: string;
  statusFilter: string;
  onStatusClick: (status: string) => void;
}

export default function ExpensesStatsBar({ stats, currency, statusFilter, onStatusClick }: Props) {
  const statsByStatus = (status: string) => {
    const entry = stats?.by_status.find((s) => s.status === status);
    return { count: entry?.count || 0, amount: entry?.total_amount || 0 };
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {STATUSES.map((status) => {
        const s = statsByStatus(status);
        return (
          <div
            key={status}
            className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:shadow-sm ${
              statusFilter === status ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => onStatusClick(status)}
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{status}</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.count}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatCurrency(s.amount, currency)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
