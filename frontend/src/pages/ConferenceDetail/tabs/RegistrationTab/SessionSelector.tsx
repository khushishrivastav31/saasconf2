import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type {
  BookableSessionsResponse,
  BookableSlot,
  BookableSessionGroup,
} from '../../../../types';

function selectionKey(group: BookableSessionGroup, slot: BookableSlot): string {
  const typeKey = group.session_type_id || 'untyped';
  return `${typeKey}:${slot.slot_id}`;
}

function formatSessionLabel(session: {
  title: string;
  speaker_name: string | null;
  has_paper: boolean;
  max_attendees?: number | null;
  current_count?: number;
  available_spots?: number | null;
}): string {
  let label = '';
  if (!session.has_paper) {
    label = 'To be announced';
  } else if (session.speaker_name) {
    label = `${session.title} – ${session.speaker_name}`;
  } else {
    label = session.title;
  }

  // Add capacity information if available
  if (session.max_attendees && session.available_spots !== undefined) {
    label += ` (${session.available_spots} spots left)`;
  }

  return label;
}

function SlotDropdown({
  slot,
  typeName,
  selectedSessionId,
  onSelect,
  compact = false,
}: {
  slot: BookableSlot;
  typeName: string;
  selectedSessionId: string | undefined;
  onSelect: (sessionId: string) => void;
  compact?: boolean;
}) {
  return (
    <div>
      {!compact && (
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          {slot.label}
        </label>
      )}
      <select
        className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
        value={selectedSessionId || ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">-- Choose a {typeName} --</option>
        {slot.sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {formatSessionLabel(session)}
          </option>
        ))}
      </select>
    </div>
  );
}

function SessionTypeGroup({
  group,
  selections,
  onChange,
  compact = false,
}: {
  group: BookableSessionGroup;
  selections: Record<string, string>;
  onChange: (selections: Record<string, string>) => void;
  compact?: boolean;
}) {
  const allTba = group.slots.every((slot) => slot.sessions.every((s) => !s.has_paper));

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Choose a {group.session_type_name}:
        </div>
      )}
      {allTba ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          You can choose your sessions later. We will come back to you.
        </p>
      ) : (
        group.slots.map((slot) => {
          const key = selectionKey(group, slot);
          return (
            <SlotDropdown
              key={key}
              slot={slot}
              typeName={group.session_type_name}
              selectedSessionId={selections[key]}
              onSelect={(sessionId) => onChange({ ...selections, [key]: sessionId })}
              compact={compact}
            />
          );
        })
      )}
    </div>
  );
}

export function OptionSessions({
  conferenceId,
  optionId,
  selections,
  selectedSessionId,
  onChange,
  compact = false,
}: {
  conferenceId: string;
  optionId: string;
  selections: Record<string, string>;
  selectedSessionId?: string | null;
  onChange: (selections: Record<string, string>) => void;
  compact?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.registrations.bookableSessions(conferenceId, optionId),
    queryFn: async () => {
      const response = await api.get<BookableSessionsResponse>(
        `/conferences/${conferenceId}/registrations/bookable-sessions/${optionId}`
      );
      return response.data;
    },
    staleTime: 0,
  });

  // Build selections from selectedSessionId if provided and selections is empty
  const effectiveSelections = React.useMemo(() => {
    if (Object.keys(selections).length > 0) {
      return selections;
    }
    if (!selectedSessionId || !data) {
      return {};
    }
    // Find which slot contains this session
    for (const group of data.groups) {
      for (const slot of group.slots) {
        const session = slot.sessions.find((s) => s.id === selectedSessionId);
        if (session) {
          const key = selectionKey(group, slot);
          return { [key]: selectedSessionId };
        }
      }
    }
    return {};
  }, [selections, selectedSessionId, data]);

  if (isLoading) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 py-2">Loading sessions...</div>;
  }

  if (!data || data.groups.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3">
      {data.groups.map((group) => (
        <SessionTypeGroup
          key={group.session_type_id || 'untyped'}
          group={group}
          selections={effectiveSelections}
          onChange={onChange}
          compact={compact}
        />
      ))}
    </div>
  );
}
