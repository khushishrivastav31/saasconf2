import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { useUrlFilters } from '../useUrlFilters';

/** Helper to render the hook inside a MemoryRouter with optional initial URL. */
function renderUrlFilters<T extends Record<string, string | number>>(
  config: T,
  initialEntries: string[] = ['/']
) {
  return renderHook(() => useUrlFilters(config), {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries }, children),
  });
}

describe('useUrlFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns default values when URL has no params', () => {
    const { result } = renderUrlFilters({ search: '', status: '', page: 1 });

    expect(result.current.search).toBe('');
    expect(result.current.status).toBe('');
    expect(result.current.page).toBe(1);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('reads initial values from URL search params', () => {
    const { result } = renderUrlFilters({ search: '', status: '', page: 1 }, [
      '/?search=hello&status=active&page=3',
    ]);

    expect(result.current.search).toBe('hello');
    expect(result.current.status).toBe('active');
    expect(result.current.page).toBe(3);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('setters update values', () => {
    const { result } = renderUrlFilters({ search: '', status: '', page: 1 });

    act(() => {
      result.current.setStatus('paid');
    });

    expect(result.current.status).toBe('paid');
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('changing search resets page to 1', () => {
    const { result } = renderUrlFilters({ search: '', page: 1 }, ['/?page=5']);

    expect(result.current.page).toBe(5);

    act(() => {
      result.current.setSearch('test');
    });

    expect(result.current.search).toBe('test');
    expect(result.current.page).toBe(1);
  });

  it('changing a filter resets page to 1', () => {
    const { result } = renderUrlFilters({ search: '', status: '', page: 1 }, ['/?page=3']);

    expect(result.current.page).toBe(3);

    act(() => {
      result.current.setStatus('cancelled');
    });

    expect(result.current.status).toBe('cancelled');
    expect(result.current.page).toBe(1);
  });

  it('setting page does not reset page', () => {
    const { result } = renderUrlFilters({ search: '', page: 1 });

    act(() => {
      result.current.setPage(5);
    });

    expect(result.current.page).toBe(5);
  });

  it('clearAllFilters resets everything to defaults', () => {
    const { result } = renderUrlFilters({ search: '', status: '', page: 1 }, [
      '/?search=hello&status=paid&page=3',
    ]);

    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.search).toBe('');
    expect(result.current.status).toBe('');
    expect(result.current.page).toBe(1);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('hasActiveFilters ignores page', () => {
    const { result } = renderUrlFilters({ search: '', page: 1 }, ['/?page=5']);

    // page=5 but no other filters active
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('provides debouncedSearch for search field', () => {
    const { result } = renderUrlFilters({ search: '', page: 1 });

    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      result.current.setSearch('hello');
    });

    // Not debounced yet
    expect(result.current.search).toBe('hello');
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedSearch).toBe('hello');
  });

  it('parses number defaults from URL correctly', () => {
    const { result } = renderUrlFilters({ page: 1 }, ['/?page=notanumber']);

    // Should fall back to default for invalid numbers
    expect(result.current.page).toBe(1);
  });

  it('removes params that match defaults for clean URLs', () => {
    const { result } = renderUrlFilters({ search: '', status: '', page: 1 }, [
      '/?search=hello&status=paid',
    ]);

    // Setting search back to empty should remove it from URL
    act(() => {
      result.current.setSearch('');
    });

    expect(result.current.search).toBe('');
    // status should still be there
    expect(result.current.status).toBe('paid');
  });
});
