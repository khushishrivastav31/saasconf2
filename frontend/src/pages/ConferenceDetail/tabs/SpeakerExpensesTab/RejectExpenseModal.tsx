interface Props {
  reason: string;
  onChangeReason: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export default function RejectExpenseModal({
  reason,
  onChangeReason,
  onCancel,
  onConfirm,
  isPending,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Reject Expense
        </h3>
        <textarea
          value={reason}
          onChange={(e) => onChangeReason(e.target.value)}
          placeholder="Reason for rejection..."
          rows={3}
          className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim() || isPending}
            className="text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
