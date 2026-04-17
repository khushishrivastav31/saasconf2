import { formatCurrency } from '../../../../utils/formatCurrency';
import { EXPENSE_STATUS_COLORS as STATUS_COLORS } from '../../../../config/statusColors';
import type { SpeakerExpense } from '../../../../types/conference';

interface Props {
  expenses: SpeakerExpense[];
  isAdmin: boolean;
  onSelect: (expense: SpeakerExpense) => void;
  onApprove: (expenseId: string) => void;
  onRequestReject: (expenseId: string) => void;
  onMarkPaid: (expenseId: string) => void;
}

export default function ExpenseRowsTable({
  expenses,
  isAdmin,
  onSelect,
  onApprove,
  onRequestReject,
  onMarkPaid,
}: Props) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Date
            </th>
            <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Title
            </th>
            <th className="text-right px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Amount
            </th>
            <th
              className="text-center px-4 py-2 text-gray-500 dark:text-gray-400 font-medium w-10"
              title="Attachments"
            >
              <PaperclipIcon className="w-4 h-4 mx-auto" />
            </th>
            <th className="text-center px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Status
            </th>
            {isAdmin && (
              <th className="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Actions</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {expenses.map((expense) => (
            <tr
              key={expense.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => onSelect(expense)}
            >
              <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                {expense.expense_date}
              </td>
              <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{expense.title}</td>
              <td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">
                {formatCurrency(expense.original_amount, expense.original_currency)}
              </td>
              <td className="px-4 py-2.5 text-center">
                {expense.attachment_count > 0 ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400"
                    title={`${expense.attachment_count} file(s)`}
                  >
                    <PaperclipIcon className="w-4 h-4" />
                    <span className="text-xs font-medium">{expense.attachment_count}</span>
                  </span>
                ) : (
                  <span className="text-gray-300 dark:text-gray-600">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center">
                <span
                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[expense.status] || ''}`}
                >
                  {expense.status}
                </span>
              </td>
              {isAdmin && (
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    {expense.status === 'submitted' && (
                      <>
                        <button
                          onClick={() => onApprove(expense.id)}
                          className="text-xs text-green-600 dark:text-green-400 hover:underline"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => onRequestReject(expense.id)}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {expense.status === 'approved' && (
                      <button
                        onClick={() => onMarkPaid(expense.id)}
                        className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        Mark Paid
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaperclipIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
      />
    </svg>
  );
}
