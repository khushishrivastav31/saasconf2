/**
 * Smart Filters Sidebar
 *
 * Auto-populated filter values with counts. Counts update as filters change.
 */
import React from 'react';
import type { ActiveFilters, FilterValues } from '../TrainingSearch';

interface SmartFiltersProps {
  filters: ActiveFilters;
  filterValues: FilterValues | undefined;
  onUpdateFilter: <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  t: (key: string) => string;
}

const SmartFilters = React.memo(function SmartFilters({
  filters,
  filterValues,
  onUpdateFilter,
  onClear,
  hasActiveFilters,
  t,
}: SmartFiltersProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('filters')}</h3>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            {t('filter_clear')}
          </button>
        )}
      </div>

      {/* Date Range */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {t('filter_date')}
        </label>
        <div className="space-y-1.5">
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => onUpdateFilter('date_from', e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => onUpdateFilter('date_to', e.target.value)}
            min={filters.date_from || new Date().toISOString().slice(0, 10)}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Location */}
      {filterValues && filterValues.locations.length > 0 && (
        <FilterSection title={t('filter_location')}>
          {filterValues.locations.map((loc) => (
            <CheckboxItem
              key={loc.value}
              label={loc.value}
              count={loc.count}
              checked={filters.location.includes(loc.value.toLowerCase())}
              onChange={(checked) => {
                const lcVal = loc.value.toLowerCase();
                onUpdateFilter(
                  'location',
                  checked
                    ? [...filters.location, lcVal]
                    : filters.location.filter((v) => v !== lcVal)
                );
              }}
            />
          ))}
        </FilterSection>
      )}

      {/* Language */}
      {filterValues && filterValues.languages.length > 0 && (
        <FilterSection title={t('filter_language')}>
          {filterValues.languages.map((lang) => (
            <CheckboxItem
              key={lang.id}
              label={lang.name}
              count={lang.count}
              checked={filters.language_id === lang.id}
              onChange={(checked) => onUpdateFilter('language_id', checked ? lang.id : '')}
            />
          ))}
        </FilterSection>
      )}

      {/* Certification Body */}
      {filterValues && filterValues.syllabi.length > 0 && (
        <FilterSection title={t('filter_syllabus')}>
          {filterValues.syllabi.map((cb) => (
            <CheckboxItem
              key={cb.id}
              label={cb.name}
              count={cb.count}
              checked={filters.syllabus_id === cb.id}
              onChange={(checked) => onUpdateFilter('syllabus_id', checked ? cb.id : '')}
            />
          ))}
        </FilterSection>
      )}

      {/* Guaranteed */}
      {filterValues && filterValues.guaranteed_count > 0 && (
        <FilterSection title={t('guaranteed')}>
          <CheckboxItem
            label={t('guaranteed')}
            count={filterValues.guaranteed_count}
            checked={filters.guaranteed}
            onChange={(checked) => onUpdateFilter('guaranteed', checked)}
          />
        </FilterSection>
      )}
    </div>
  );
});

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CheckboxItem({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 shrink-0"
      />
      <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 flex-1 truncate">
        {label}
      </span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{count}</span>
    </label>
  );
}

export default SmartFilters;
