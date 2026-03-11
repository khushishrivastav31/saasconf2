import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionSelection } from '../useSessionSelection';

describe('useSessionSelection', () => {
  it('starts with empty session selections', () => {
    const { result } = renderHook(() => useSessionSelection());
    expect(result.current.sessionSelections).toEqual({});
  });

  describe('handleSessionChange', () => {
    it('sets session selections for an attendee and option', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', {
          'period-a': 'session-1',
          'period-b': 'session-2',
        });
      });

      expect(result.current.sessionSelections).toEqual({
        0: {
          'opt-1': {
            'period-a': 'session-1',
            'period-b': 'session-2',
          },
        },
      });
    });

    it('preserves selections for other options on the same attendee', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-1' });
      });

      act(() => {
        result.current.handleSessionChange(0, 'opt-2', { 'period-a': 'session-3' });
      });

      expect(result.current.sessionSelections[0]).toEqual({
        'opt-1': { 'period-a': 'session-1' },
        'opt-2': { 'period-a': 'session-3' },
      });
    });

    it('preserves selections for other attendees', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-1' });
      });

      act(() => {
        result.current.handleSessionChange(1, 'opt-1', { 'period-a': 'session-2' });
      });

      expect(result.current.sessionSelections[0]['opt-1']['period-a']).toBe('session-1');
      expect(result.current.sessionSelections[1]['opt-1']['period-a']).toBe('session-2');
    });

    it('overwrites existing selections for the same attendee/option', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-1' });
      });

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-99' });
      });

      expect(result.current.sessionSelections[0]['opt-1']['period-a']).toBe('session-99');
    });
  });

  describe('clearSessionsForAttendee', () => {
    it('removes all selections for a specific attendee', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-1' });
        result.current.handleSessionChange(0, 'opt-2', { 'period-a': 'session-2' });
        result.current.handleSessionChange(1, 'opt-1', { 'period-a': 'session-3' });
      });

      act(() => {
        result.current.clearSessionsForAttendee(0);
      });

      expect(result.current.sessionSelections[0]).toBeUndefined();
      expect(result.current.sessionSelections[1]).toBeDefined();
    });

    it('is a no-op when attendee has no selections', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.clearSessionsForAttendee(5);
      });

      expect(result.current.sessionSelections).toEqual({});
    });
  });

  describe('clearSessionsForOption', () => {
    it('removes selections for a specific option on an attendee', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-1' });
        result.current.handleSessionChange(0, 'opt-2', { 'period-a': 'session-2' });
      });

      act(() => {
        result.current.clearSessionsForOption(0, 'opt-1');
      });

      expect(result.current.sessionSelections[0]['opt-1']).toBeUndefined();
      expect(result.current.sessionSelections[0]['opt-2']).toBeDefined();
    });

    it('removes attendee entry when last option is cleared', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-1' });
      });

      act(() => {
        result.current.clearSessionsForOption(0, 'opt-1');
      });

      expect(result.current.sessionSelections[0]).toBeUndefined();
    });

    it('is a no-op when attendee has no selections', () => {
      const { result } = renderHook(() => useSessionSelection());

      const before = result.current.sessionSelections;

      act(() => {
        result.current.clearSessionsForOption(99, 'opt-1');
      });

      expect(result.current.sessionSelections).toEqual(before);
    });
  });

  describe('getSessionsForAttendee', () => {
    it('returns selections for a specific attendee', () => {
      const { result } = renderHook(() => useSessionSelection());

      act(() => {
        result.current.handleSessionChange(0, 'opt-1', { 'period-a': 'session-1' });
      });

      const sessions = result.current.getSessionsForAttendee(0);
      expect(sessions).toEqual({
        'opt-1': { 'period-a': 'session-1' },
      });
    });

    it('returns empty object for attendee with no selections', () => {
      const { result } = renderHook(() => useSessionSelection());

      const sessions = result.current.getSessionsForAttendee(99);
      expect(sessions).toEqual({});
    });
  });

  describe('setSessionSelections', () => {
    it('allows bulk replacement of all session selections', () => {
      const { result } = renderHook(() => useSessionSelection());

      const bulkSelections = {
        0: { 'opt-1': { 'period-a': 'session-1' } },
        1: { 'opt-2': { 'period-b': 'session-5' } },
      };

      act(() => {
        result.current.setSessionSelections(bulkSelections);
      });

      expect(result.current.sessionSelections).toEqual(bulkSelections);
    });
  });
});
