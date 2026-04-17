import type { NewExpenseDraft } from './types';

interface Props {
  active: boolean;
  draft: NewExpenseDraft;
  currency: string;
  isPending: boolean;
  onStart: () => void;
  onChange: (next: NewExpenseDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function AddExpenseInline({
  active,
  draft,
  currency,
  isPending,
  onStart,
  onChange,
  onCancel,
  onSave,
}: Props) {
  if (!active) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
        <button
          onClick={onStart}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Expense
        </button>
      </div>
    );
  }

  const canSave =
    draft.title.trim() &&
    parseFloat(draft.amount) > 0 &&
    !isNaN(parseFloat(draft.amount)) &&
    draft.date;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={draft.date}
          onChange={(e) => onChange({ ...draft, date: e.target.value })}
          className="text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5"
        />
        <input
          type="text"
          placeholder="Title (e.g. Hotel)"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          className="flex-1 min-w-32 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5"
        />
        <input
          type="number"
          placeholder="Amount"
          value={draft.amount}
          onChange={(e) => onChange({ ...draft, amount: e.target.value })}
          className="w-28 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1.5"
          step="0.01"
          min="0"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">{currency}</span>
        <button
          onClick={() => {
            if (canSave) onSave();
          }}
          disabled={isPending}
          className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
