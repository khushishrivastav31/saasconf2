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
        <div className="flex gap-2">
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => onUpdateFilter('date_from', e.target.value)}
            min={filterValues?.date_range?.min || undefined}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="From"
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => onUpdateFilter('date_to', e.target.value)}
            max={filterValues?.date_range?.max || undefined}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="To"
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
            <RadioItem
              key={lang.id}
              label={lang.name}
              count={lang.count}
              checked={filters.language_id === lang.id}
              onChange={() =>
                onUpdateFilter('language_id', filters.language_id === lang.id ? '' : lang.id)
              }
            />
          ))}
        </FilterSection>
      )}

      {/* Certification Body */}
      {filterValues && filterValues.certification_bodies.length > 0 && (
        <FilterSection title={t('filter_certification')}>
          {filterValues.certification_bodies.map((cb) => (
            <RadioItem
              key={cb.id}
              label={cb.name}
              count={cb.count}
              checked={filters.certification_body_id === cb.id}
              onChange={() =>
                onUpdateFilter(
                  'certification_body_id',
                  filters.certification_body_id === cb.id ? '' : cb.id
                )
              }
            />
          ))}
        </FilterSection>
      )}

      {/* Theme */}
      {filterValues && filterValues.themes.length > 0 && (
        <FilterSection title={t('filter_theme')}>
          {filterValues.themes.map((theme) => (
            <RadioItem
              key={theme.id}
              label={theme.name}
              count={theme.count}
              checked={filters.theme_id === theme.id}
              onChange={() =>
                onUpdateFilter('theme_id', filters.theme_id === theme.id ? '' : theme.id)
              }
            />
          ))}
        </FilterSection>
      )}

      {/* Placement Type */}
      {filterValues && filterValues.types.length > 1 && (
        <FilterSection title={t('filter_type')}>
          {filterValues.types.map((t) => (
            <RadioItem
              key={t.value}
              label={t.value === 'open' ? 'Open' : 'Hybrid'}
              count={t.count}
              checked={filters.placement_type === t.value}
              onChange={() =>
                onUpdateFilter('placement_type', filters.placement_type === t.value ? '' : t.value)
              }
            />
          ))}
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
        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
      />
      <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 flex-1">
        {label}
      </span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500">{count}</span>
    </label>
  );
}

function RadioItem({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs ${
        checked
          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <span className="flex-1">{label}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500">{count}</span>
    </button>
  );
}

export default SmartFilters;
