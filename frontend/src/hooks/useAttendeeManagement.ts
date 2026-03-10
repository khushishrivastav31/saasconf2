/**
 * Hook for managing multi-attendee registration state
 *
 * Provides consistent attendee add/remove/update logic across
 * admin, authenticated portal, and public registration flows.
 */

import { useState, useCallback } from 'react';

export interface BaseAttendee {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  job_title?: string;
  department?: string;
  pronouns?: string;
  booking_option_ids: string[];
  items?: Array<{
    booking_option_id: string;
    session_id?: string;
  }>;
}

export interface UseAttendeeManagementOptions<T extends BaseAttendee> {
  initialAttendee: T;
  onSessionsCleared?: (attendeeIndex: number, removedOptionIds: string[]) => void;
}

export function useAttendeeManagement<T extends BaseAttendee>({
  initialAttendee,
  onSessionsCleared,
}: UseAttendeeManagementOptions<T>) {
  const [attendees, setAttendees] = useState<T[]>([initialAttendee]);

  const addAttendee = useCallback(() => {
    setAttendees((prev) => [...prev, { ...initialAttendee } as T]);
  }, [initialAttendee]);

  const removeAttendee = useCallback(
    (index: number) => {
      if (attendees.length === 1) return; // Must have at least one attendee

      setAttendees((prev) => {
        const updated = prev.filter((_, i) => i !== index);
        return updated;
      });

      // Notify parent about cleared sessions if callback provided
      if (onSessionsCleared && attendees[index]?.booking_option_ids) {
        onSessionsCleared(index, attendees[index].booking_option_ids);
      }
    },
    [attendees, onSessionsCleared]
  );

  const updateAttendee = useCallback(
    (index: number, updated: T) => {
      setAttendees((prev) => {
        const newAttendees = [...prev];
        const oldOptionIds = prev[index]?.booking_option_ids || [];
        const newOptionIds = updated.booking_option_ids || [];

        // Detect removed booking options
        const removedOptionIds = oldOptionIds.filter((id) => !newOptionIds.includes(id));

        newAttendees[index] = updated;

        // Notify parent about cleared sessions if callback provided
        if (onSessionsCleared && removedOptionIds.length > 0) {
          onSessionsCleared(index, removedOptionIds);
        }

        return newAttendees;
      });
    },
    [onSessionsCleared]
  );

  return {
    attendees,
    addAttendee,
    removeAttendee,
    updateAttendee,
    setAttendees, // Exposed for initial loading or bulk updates
  };
}
