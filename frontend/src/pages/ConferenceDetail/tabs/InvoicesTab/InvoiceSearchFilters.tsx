import type { InvoiceTemplateType } from '../../../../types';
import { CloseIcon } from '../../icons';

const TEMPLATE_TYPE_OPTIONS: { value: InvoiceTemplateType; label: string }[] = [
  { value: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { value: 'credit_card', label: 'Invoice (Credit Card)' },
  { value: 'credit_note', label: 'Credit Note' },
];

interface InvoiceSearchFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  hasActiveFilters: boolean;
  onClearAllFilters: () => void;
}

export default function InvoiceSearchFilters({
  search,
  onSearchChange,
  onClearSearch,
  filterStatus,
  setFilterStatus,
  filterType,
  setFilterType,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  hasActiveFilters,
  onClearAllFilters,
}: InvoiceSearchFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      <div className="relative flex-1 max-w-sm">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by number or recipient..."
          className="w-full pl-10 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        />
        {search && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <select
        value={filterStatus}
        onChange={(e) => setFilterStatus(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="sent">Sent</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">All Types</option>
        {TEMPLATE_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={filterDateFrom}
        onChange={(e) => setFilterDateFrom(e.target.value)}
        placeholder="From"
        title="Issue date from"
        className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
      />
      <input
        type="date"
        value={filterDateTo}
        onChange={(e) => setFilterDateTo(e.target.value)}
        placeholder="To"
        title="Issue date to"
        className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
      />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAllFilters}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 whitespace-nowrap"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
