import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../config/api';

export interface AttendeeSearchHit {
  attendee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  registration_id: string;
  placement_id: string;
  training_name: string | null;
  training_date: string | null;
}

interface AttendeeSearchResponse {
  items: AttendeeSearchHit[];
  total: number;
}

interface Props {
  selected: AttendeeSearchHit[];
  onAdd: (hit: AttendeeSearchHit) => void;
  onRemove: (attendeeId: string) => void;
}

/**
 * Search-by-name/email recipient picker. Used in the Compose dialog when
 * the admin doesn't want to navigate by training session — they just
 * want to find one or more attendees by name/email and send.
 *
 * Hits the ``GET /trainings/messaging/attendees`` endpoint with a
 * debounced ``q`` parameter. Results show name + email + the training
 * session the attendee is on so the admin can disambiguate when the
 * same person is on multiple trainings.
 */
export default function TrainingAttendeeSearchPicker({ selected, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // 250ms debounce so we don't spam the search endpoint per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['training-attendee-search', debounced],
    queryFn: async (): Promise<AttendeeSearchResponse> => {
      const resp = await api.get<AttendeeSearchResponse>('/trainings/messaging/attendees', {
        params: { q: debounced, limit: 20 },
      });
      return resp.data;
    },
    // Always run when the dialog hosts this picker. Empty query returns
    // first-page-of-tenant rows, which is a useful "starting list".
    staleTime: 30_000,
  });

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.attendee_id)), [selected]);
  const results = (data?.items ?? []).filter((r) => !selectedIds.has(r.attendee_id));

  return (
    <div>
      <label
        htmlFor="training-attendee-search"
        className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        Search attendees
      </label>
      <input
        id="training-attendee-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a name or email…"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.attendee_id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200"
            >
              {s.first_name} {s.last_name} <span className="opacity-70 text-[10px]">{s.email}</span>
              <button
                type="button"
                onClick={() => onRemove(s.attendee_id)}
                className="ml-0.5 text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {results.length > 0 ? (
        <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.attendee_id}
              type="button"
              onClick={() => onAdd(r)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
            >
              <div className="text-gray-900 dark:text-gray-100">
                {r.first_name} {r.last_name}{' '}
                <span className="text-gray-500 dark:text-gray-400 text-xs">{r.email}</span>
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {r.training_name || '—'}
                {r.training_date ? ` — ${r.training_date}` : ''}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {isFetching
            ? 'Searching…'
            : debounced
              ? 'No matches.'
              : 'Start typing to search by name or email.'}
        </p>
      )}
    </div>
  );
}
