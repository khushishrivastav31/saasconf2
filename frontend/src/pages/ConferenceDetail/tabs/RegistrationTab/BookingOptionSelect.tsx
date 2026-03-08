import type { BookingOption, BookingPeriod } from '../../../../types';
import { getCurrentPrice, formatPrice } from './helpers';
import { OptionSessions } from './SessionSelector';

interface BookingOptionSelectProps {
  options: BookingOption[];
  periods: BookingPeriod[];
  value: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
  id?: string;
  conferenceId?: string;
  sessionSelections?: Record<string, Record<string, string>>;
  onSessionChange?: (optionId: string, selections: Record<string, string>) => void;
}

export default function BookingOptionSelect({
  options,
  periods,
  value,
  onChange,
  conferenceId,
  sessionSelections,
  onSessionChange,
}: BookingOptionSelectProps) {
  const activeOptions = options.filter((o) => o.is_active);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {activeOptions.map((o) => {
        const isSelected = value.includes(o.id);
        const priceInfo = getCurrentPrice(o.id, periods);
        return (
          <div
            key={o.id}
            className={`relative flex flex-col items-start text-left rounded-lg border-2 p-4 transition-all ${
              isSelected
                ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {/* Clickable header area */}
            <button
              type="button"
              onClick={() => toggle(o.id)}
              className="w-full flex flex-col items-start text-left"
            >
              {/* Selection indicator (checkbox style) */}
              <span
                className={`absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded border-2 ${
                  isSelected
                    ? 'border-primary-600 bg-primary-600'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                }`}
              >
                {isSelected && (
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                  </svg>
                )}
              </span>

              {/* Name + price */}
              <span
                className={`text-sm font-semibold pr-6 ${isSelected ? 'text-primary-900' : 'text-gray-900 dark:text-gray-100'}`}
              >
                {o.name}
              </span>
              {priceInfo && (
                <span
                  className={`mt-1 text-sm font-medium ${isSelected ? 'text-primary-700' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  {formatPrice(priceInfo.price, priceInfo.currency)}
                  <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">
                    ({priceInfo.periodName})
                  </span>
                </span>
              )}

              {/* Description */}
              {o.description && (
                <span className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {o.description}
                </span>
              )}
            </button>

            {/* Session selectors inside the card */}
            {isSelected &&
              conferenceId &&
              o.conference_day_id &&
              sessionSelections &&
              onSessionChange && (
                <OptionSessions
                  conferenceId={conferenceId}
                  optionId={o.id}
                  selections={sessionSelections[o.id] || {}}
                  onChange={(sel) => onSessionChange(o.id, sel)}
                />
              )}
          </div>
        );
      })}
    </div>
  );
}
