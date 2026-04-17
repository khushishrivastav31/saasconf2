import type { DetailTab } from '../types';

interface Props {
  active: DetailTab;
  registrationCount: number;
  onChange: (tab: DetailTab) => void;
}

export default function DetailTabs({ active, registrationCount, onChange }: Props) {
  const tabCls = (tab: DetailTab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active === tab
        ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
    }`;

  return (
    <div className="flex border-b border-gray-200 dark:border-gray-700">
      <button type="button" className={tabCls('profile')} onClick={() => onChange('profile')}>
        Profile
      </button>
      <button
        type="button"
        className={tabCls('registrations')}
        onClick={() => onChange('registrations')}
      >
        Registrations
        {registrationCount > 0 && (
          <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
            ({registrationCount})
          </span>
        )}
      </button>
    </div>
  );
}
