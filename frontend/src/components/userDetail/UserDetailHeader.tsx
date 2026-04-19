import { useAuthMedia } from '../../hooks/useAuthMedia';

export interface UserDetailHeaderProps {
  firstName: string;
  lastName: string;
  email: string;
  pictureUrl?: string | null;
  statusLabel?: string;
  statusTone?: 'active' | 'inactive' | 'parked' | 'neutral';
  primaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    loadingLabel?: string;
  } | null;
}

const statusClasses: Record<NonNullable<UserDetailHeaderProps['statusTone']>, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  inactive: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  parked: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function UserDetailHeader({
  firstName,
  lastName,
  email,
  pictureUrl,
  statusLabel,
  statusTone = 'neutral',
  primaryAction,
}: UserDetailHeaderProps) {
  const imgSrc = useAuthMedia(pictureUrl ?? null);
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="px-6 py-5 flex items-center gap-4 flex-wrap">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={`${firstName} ${lastName}`}
            className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-lg">
            {initials || '?'}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
            {firstName} {lastName}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{email}</p>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {statusLabel && (
            <span
              className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold ${statusClasses[statusTone]}`}
            >
              {statusLabel}
            </span>
          )}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.loading}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
            >
              {primaryAction.loading
                ? (primaryAction.loadingLabel ?? `${primaryAction.label}...`)
                : primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
