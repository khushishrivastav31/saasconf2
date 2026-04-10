import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SmartFilters from '../components/SmartFilters';
import type { ActiveFilters, FilterValues } from '../TrainingSearch';

const emptyFilters: ActiveFilters = {
  search: '',
  date_from: '',
  date_to: '',
  location: [],
  language_id: '',
  syllabus_id: '',
  theme_id: '',
  guaranteed: false,
};

const mockFilterValues: FilterValues = {
  locations: [
    { value: 'Berlin', count: 5 },
    { value: 'Online', count: 3 },
  ],
  languages: [
    { id: 'l1', name: 'Deutsch', count: 7 },
    { id: 'l2', name: 'English', count: 1 },
  ],
  syllabi: [{ id: 's1', name: 'ISTQB FL', count: 6 }],
  themes: [],
  guaranteed_count: 2,
  date_range: { min: '2027-01-01', max: '2027-12-31' },
};

const t = (key: string) => {
  const map: Record<string, string> = {
    filters: 'Filters',
    filter_clear: 'Clear all',
    filter_date: 'Date Range',
    filter_location: 'Location',
    filter_language: 'Language',
    filter_syllabus: 'Syllabus',
    guaranteed: 'Guaranteed',
  };
  return map[key] || key;
};

describe('SmartFilters', () => {
  it('renders filter sections', () => {
    render(
      <SmartFilters
        filters={emptyFilters}
        filterValues={mockFilterValues}
        onUpdateFilter={vi.fn()}
        onClear={vi.fn()}
        hasActiveFilters={false}
        t={t}
      />
    );

    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Date Range')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Syllabus')).toBeInTheDocument();
    // "Guaranteed" appears as section title + checkbox label
    expect(screen.getAllByText('Guaranteed').length).toBeGreaterThanOrEqual(1);
  });

  it('shows location filter with city names', () => {
    render(
      <SmartFilters
        filters={emptyFilters}
        filterValues={mockFilterValues}
        onUpdateFilter={vi.fn()}
        onClear={vi.fn()}
        hasActiveFilters={false}
        t={t}
      />
    );

    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // Berlin count
    expect(screen.getByText('3')).toBeInTheDocument(); // Online count
  });

  it('shows guaranteed filter with count', () => {
    render(
      <SmartFilters
        filters={emptyFilters}
        filterValues={mockFilterValues}
        onUpdateFilter={vi.fn()}
        onClear={vi.fn()}
        hasActiveFilters={false}
        t={t}
      />
    );

    // "Guaranteed" appears twice: section title + checkbox label
    const guaranteedElements = screen.getAllByText('Guaranteed');
    expect(guaranteedElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not show guaranteed filter when count is 0', () => {
    render(
      <SmartFilters
        filters={emptyFilters}
        filterValues={{ ...mockFilterValues, guaranteed_count: 0 }}
        onUpdateFilter={vi.fn()}
        onClear={vi.fn()}
        hasActiveFilters={false}
        t={t}
      />
    );

    // Only "Filters" heading, not a Guaranteed section
    const guaranteedElements = screen.queryAllByText('Guaranteed');
    expect(guaranteedElements.length).toBe(0);
  });

  it('calls onUpdateFilter when guaranteed checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onUpdateFilter = vi.fn();

    render(
      <SmartFilters
        filters={emptyFilters}
        filterValues={mockFilterValues}
        onUpdateFilter={onUpdateFilter}
        onClear={vi.fn()}
        hasActiveFilters={false}
        t={t}
      />
    );

    // Find the guaranteed checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    const guaranteedCheckbox = checkboxes[checkboxes.length - 1]; // last one is guaranteed
    await user.click(guaranteedCheckbox);

    expect(onUpdateFilter).toHaveBeenCalledWith('guaranteed', true);
  });

  it('shows clear button when filters are active', () => {
    render(
      <SmartFilters
        filters={emptyFilters}
        filterValues={mockFilterValues}
        onUpdateFilter={vi.fn()}
        onClear={vi.fn()}
        hasActiveFilters={true}
        t={t}
      />
    );

    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('does not show clear button when no filters active', () => {
    render(
      <SmartFilters
        filters={emptyFilters}
        filterValues={mockFilterValues}
        onUpdateFilter={vi.fn()}
        onClear={vi.fn()}
        hasActiveFilters={false}
        t={t}
      />
    );

    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
  });
});
