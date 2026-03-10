/**
 * Hook for managing session selections per attendee per booking option
 *
 * Provides consistent session selection state management across
 * admin, authenticated portal, and public registration flows.
 */

import { useState, useCallback } from 'react';

export type SessionSelections = Record<number, Record<string, Record<string, string>>>;
// Structure: { [attendeeIndex]: { [bookingOptionId]: { [periodId]: sessionId } } }

export function useSessionSelection() {
  const [sessionSelections, setSessionSelections] = useState<SessionSelections>({});

  const handleSessionChange = useCallback(
    (attendeeIndex: number, optionId: string, selections: Record<string, string>) => {
      setSessionSelections((prev) => ({
        ...prev,
        [attendeeIndex]: {
          ...(prev[attendeeIndex] || {}),
          [optionId]: selections,
        },
      }));
    },
    []
  );

  const clearSessionsForAttendee = useCallback((attendeeIndex: number) => {
    setSessionSelections((prev) => {
      const updated = { ...prev };
      delete updated[attendeeIndex];
      return updated;
    });
  }, []);

  const clearSessionsForOption = useCallback((attendeeIndex: number, optionId: string) => {
    setSessionSelections((prev) => {
      const attendeeSessions = prev[attendeeIndex];
      if (!attendeeSessions) return prev;

      const updated = { ...prev };
      const updatedAttendee = { ...attendeeSessions };
      delete updatedAttendee[optionId];

      if (Object.keys(updatedAttendee).length === 0) {
        delete updated[attendeeIndex];
      } else {
        updated[attendeeIndex] = updatedAttendee;
      }

      return updated;
    });
  }, []);

  const getSessionsForAttendee = useCallback(
    (attendeeIndex: number): Record<string, Record<string, string>> => {
      return sessionSelections[attendeeIndex] || {};
    },
    [sessionSelections]
  );

  return {
    sessionSelections,
    handleSessionChange,
    clearSessionsForAttendee,
    clearSessionsForOption,
    getSessionsForAttendee,
    setSessionSelections, // Exposed for bulk updates if needed
  };
}
