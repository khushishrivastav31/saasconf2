import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAttendeeManagement } from '../useAttendeeManagement';
import type { BaseAttendee } from '../useAttendeeManagement';

const createAttendee = (overrides: Partial<BaseAttendee> = {}): BaseAttendee => ({
  first_name: '',
  last_name: '',
  email: '',
  booking_option_ids: [],
  ...overrides,
});

describe('useAttendeeManagement', () => {
  const initialAttendee = createAttendee();

  it('starts with one attendee matching initialAttendee', () => {
    const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

    expect(result.current.attendees).toHaveLength(1);
    expect(result.current.attendees[0]).toEqual(initialAttendee);
  });

  describe('addAttendee', () => {
    it('adds a new attendee with initial values', () => {
      const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

      act(() => {
        result.current.addAttendee();
      });

      expect(result.current.attendees).toHaveLength(2);
      expect(result.current.attendees[1]).toEqual(initialAttendee);
    });

    it('can add multiple attendees', () => {
      const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

      act(() => {
        result.current.addAttendee();
        result.current.addAttendee();
        result.current.addAttendee();
      });

      expect(result.current.attendees).toHaveLength(4);
    });
  });

  describe('removeAttendee', () => {
    it('removes attendee at the given index', () => {
      const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

      act(() => {
        result.current.addAttendee();
      });

      // Update first attendee so we can verify which one remains
      act(() => {
        result.current.updateAttendee(0, createAttendee({ first_name: 'Alice' }));
      });

      act(() => {
        result.current.removeAttendee(0);
      });

      expect(result.current.attendees).toHaveLength(1);
      // The remaining attendee should be the second one (initial values)
      expect(result.current.attendees[0].first_name).toBe('');
    });

    it('does not remove the last attendee', () => {
      const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

      act(() => {
        result.current.removeAttendee(0);
      });

      expect(result.current.attendees).toHaveLength(1);
    });

    it('calls onSessionsCleared with removed booking option ids', () => {
      const onSessionsCleared = vi.fn();

      const { result } = renderHook(() =>
        useAttendeeManagement({ initialAttendee, onSessionsCleared })
      );

      // Add a second attendee and give it booking options
      act(() => {
        result.current.addAttendee();
      });

      act(() => {
        result.current.updateAttendee(
          1,
          createAttendee({
            first_name: 'Bob',
            booking_option_ids: ['opt-a', 'opt-b'],
          })
        );
      });

      onSessionsCleared.mockClear();

      act(() => {
        result.current.removeAttendee(1);
      });

      expect(onSessionsCleared).toHaveBeenCalledWith(1, ['opt-a', 'opt-b']);
    });

    it('does not call onSessionsCleared if callback not provided', () => {
      const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

      act(() => {
        result.current.addAttendee();
      });

      // Should not throw
      act(() => {
        result.current.removeAttendee(1);
      });

      expect(result.current.attendees).toHaveLength(1);
    });
  });

  describe('updateAttendee', () => {
    it('updates attendee at the given index', () => {
      const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

      const updated = createAttendee({
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
        booking_option_ids: ['opt-1'],
      });

      act(() => {
        result.current.updateAttendee(0, updated);
      });

      expect(result.current.attendees[0]).toEqual(updated);
    });

    it('calls onSessionsCleared when booking options are removed', () => {
      const onSessionsCleared = vi.fn();

      const { result } = renderHook(() =>
        useAttendeeManagement({ initialAttendee, onSessionsCleared })
      );

      // Set initial booking options
      act(() => {
        result.current.updateAttendee(
          0,
          createAttendee({
            booking_option_ids: ['opt-a', 'opt-b', 'opt-c'],
          })
        );
      });

      onSessionsCleared.mockClear();

      // Remove opt-b
      act(() => {
        result.current.updateAttendee(
          0,
          createAttendee({
            booking_option_ids: ['opt-a', 'opt-c'],
          })
        );
      });

      expect(onSessionsCleared).toHaveBeenCalledWith(0, ['opt-b']);
    });

    it('does not call onSessionsCleared when no options are removed', () => {
      const onSessionsCleared = vi.fn();

      const { result } = renderHook(() =>
        useAttendeeManagement({ initialAttendee, onSessionsCleared })
      );

      act(() => {
        result.current.updateAttendee(
          0,
          createAttendee({
            booking_option_ids: ['opt-a'],
          })
        );
      });

      onSessionsCleared.mockClear();

      // Add an option but don't remove any
      act(() => {
        result.current.updateAttendee(
          0,
          createAttendee({
            booking_option_ids: ['opt-a', 'opt-b'],
          })
        );
      });

      expect(onSessionsCleared).not.toHaveBeenCalled();
    });
  });

  describe('setAttendees', () => {
    it('allows bulk replacement of all attendees', () => {
      const { result } = renderHook(() => useAttendeeManagement({ initialAttendee }));

      const bulkAttendees = [
        createAttendee({ first_name: 'Alice' }),
        createAttendee({ first_name: 'Bob' }),
        createAttendee({ first_name: 'Charlie' }),
      ];

      act(() => {
        result.current.setAttendees(bulkAttendees);
      });

      expect(result.current.attendees).toHaveLength(3);
      expect(result.current.attendees[0].first_name).toBe('Alice');
      expect(result.current.attendees[2].first_name).toBe('Charlie');
    });
  });

  describe('generic type support', () => {
    interface ExtendedAttendee extends BaseAttendee {
      dietary_requirements?: string;
    }

    it('works with extended attendee types', () => {
      const extendedInitial: ExtendedAttendee = {
        ...createAttendee(),
        dietary_requirements: 'vegetarian',
      };

      const { result } = renderHook(() =>
        useAttendeeManagement<ExtendedAttendee>({ initialAttendee: extendedInitial })
      );

      expect(result.current.attendees[0].dietary_requirements).toBe('vegetarian');

      act(() => {
        result.current.addAttendee();
      });

      expect(result.current.attendees[1].dietary_requirements).toBe('vegetarian');
    });
  });
});
