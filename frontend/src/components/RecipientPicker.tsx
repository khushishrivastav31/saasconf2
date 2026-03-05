import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import { queryKeys } from '../config/queryKeys';
import type { RecipientSearchResult } from '../types';

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  sponsor: {
    label: 'Sponsor',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  },
  speaker: {
    label: 'Speaker',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  committee: {
    label: 'Committee',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  volunteer: {
    label: 'Volunteer',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  registration: {
    label: 'Registration',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  },
};

interface RecipientPickerProps {
  conferenceId: string;
  onSelect: (result: RecipientSearchResult) => void;
  onManualEntry: () => void;
  disabled?: boolean;
}

export default function RecipientPicker({
  conferenceId,
  onSelect,
  onManualEntry,
  disabled,
}: RecipientPickerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Click-outside detection
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim().length >= 2) {
      timerRef.current = setTimeout(() => {
        setDebouncedQuery(value.trim());
        setShowDropdown(true);
      }, 300);
    } else {
      setDebouncedQuery('');
      setShowDropdown(false);
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.invoices.recipientSearch(conferenceId, debouncedQuery),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/invoices/recipient-search`, {
        params: { q: debouncedQuery },
      });
      return res.data as { results: RecipientSearchResult[] };
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const results = data?.results ?? [];

  // Group results by source_type
  const grouped = results.reduce(
    (acc, r) => {
      if (!acc[r.source_type]) acc[r.source_type] = [];
      acc[r.source_type].push(r);
      return acc;
    },
    {} as Record<string, RecipientSearchResult[]>
  );

  const sourceOrder = ['sponsor', 'speaker', 'committee', 'volunteer', 'registration'];
  const sortedGroups = sourceOrder.filter((s) => grouped[s]?.length);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Search Recipient
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => {
            if (debouncedQuery.length >= 2) setShowDropdown(true);
          }}
          placeholder="Search sponsors, speakers, committee, volunteers..."
          disabled={disabled}
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setDebouncedQuery('');
            setShowDropdown(false);
            onManualEntry();
          }}
          disabled={disabled}
          className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Manual entry
        </button>
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          {isFetching && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Searching...</div>
          )}
          {!isFetching && results.length === 0 && debouncedQuery.length >= 2 && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No results found
            </div>
          )}
          {sortedGroups.map((sourceType) => (
            <div key={sourceType}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${SOURCE_BADGES[sourceType]?.className ?? ''}`}
                >
                  {SOURCE_BADGES[sourceType]?.label ?? sourceType}
                </span>
              </div>
              {grouped[sourceType].map((result) => (
                <button
                  key={`${result.source_type}-${result.id}`}
                  type="button"
                  onClick={() => {
                    onSelect(result);
                    setQuery('');
                    setDebouncedQuery('');
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {result.display_name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    {result.email && <span>{result.email}</span>}
                    {result.company && (
                      <>
                        {result.email && <span>&middot;</span>}
                        <span>{result.company}</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
