export interface TabDescriptor<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  tabs: TabDescriptor<T>[];
  active: T;
  onChange: (id: T) => void;
}

export default function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const cls = `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          isActive
            ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
        }`;
        return (
          <button key={tab.id} type="button" className={cls} onClick={() => onChange(tab.id)}>
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({tab.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
