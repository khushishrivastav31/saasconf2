import { VIEWS, type ExpensesView } from './types';

interface Props {
  activeView: ExpensesView;
  onChange: (view: ExpensesView) => void;
}

export default function ExpensesViewToggle({ activeView, onChange }: Props) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Speaker Expenses</h2>
      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
        {VIEWS.map((view) => (
          <button
            key={view}
            onClick={() => onChange(view)}
            className={`text-sm px-3 py-1.5 rounded-md capitalize ${
              activeView === view
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {view === 'defaults' ? 'Allowance Defaults' : view}
          </button>
        ))}
      </div>
    </div>
  );
}
