import api from '../../../../config/api';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { EXPENSE_STATUS_COLORS as STATUS_COLORS } from '../../../../config/statusColors';
import type { SpeakerExpense } from '../../../../types/conference';
import type { AttachmentItem } from './types';
import { formatFileSize } from './types';

interface Props {
  expense: SpeakerExpense;
  attachments: AttachmentItem[] | undefined;
  isAdmin: boolean;
  onClose: () => void;
  onApprove: () => void;
  onRequestReject: () => void;
  onMarkPaid: () => void;
}

export default function ExpenseDetailPanel({
  expense,
  attachments,
  isAdmin,
  onClose,
  onApprove,
  onRequestReject,
  onMarkPaid,
}: Props) {
  const downloadAttachment = async (attachmentId: string, filename: string) => {
    const { data } = await api.get(`/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Expense Details
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex px-2.5 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[expense.status] || ''}`}
            >
              {expense.status}
            </span>
            {expense.rejection_reason && (
              <span className="text-sm text-red-600 dark:text-red-400">
                Rejected: {expense.rejection_reason}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Speaker</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{expense.speaker_name}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Date</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{expense.expense_date}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Title</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{expense.title}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Category</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {expense.category_name || '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Amount</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(expense.original_amount, expense.original_currency)}
              </p>
            </div>
            {expense.session_title && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Session</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {expense.session_title}
                </p>
              </div>
            )}
          </div>

          {expense.description && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Description</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                {expense.description}
              </p>
            </div>
          )}
          {expense.notes && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                {expense.notes}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              Attachments ({expense.attachment_count})
            </p>
            {attachments && attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-5 h-5 shrink-0 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                          {att.filename}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(att.file_size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadAttachment(att.id, att.filename)}
                      className="shrink-0 text-sm text-blue-600 dark:text-blue-400 hover:underline ml-2"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            ) : expense.attachment_count === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No files attached.</p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            )}
          </div>

          {isAdmin && expense.status === 'submitted' && (
            <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onApprove}
                className="flex-1 text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={onRequestReject}
                className="flex-1 text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          )}
          {isAdmin && expense.status === 'approved' && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onMarkPaid}
                className="w-full text-sm px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Mark as Paid
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
