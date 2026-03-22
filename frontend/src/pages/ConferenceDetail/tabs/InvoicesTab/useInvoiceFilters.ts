import { useState, useCallback } from 'react';
import { useDebouncedValue } from '../../../../hooks/useDebounce';

export function useInvoiceFilters() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const hasActiveFilters = !!(
    debouncedSearch ||
    filterStatus ||
    filterType ||
    filterDateFrom ||
    filterDateTo
  );

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setFilterStatus('');
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }, []);

  return {
    search,
    setSearch,
    debouncedSearch,
    filterStatus,
    setFilterStatus,
    filterType,
    setFilterType,
    filterDateFrom,
    setFilterDateFrom,
    filterDateTo,
    setFilterDateTo,
    hasActiveFilters,
    clearAllFilters,
  };
}
