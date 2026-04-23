import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParkingLotRow } from '../ParkingLotRow';
import type { ParkedAttendee } from '../types';

function makeAttendee(overrides: Partial<ParkedAttendee> = {}): ParkedAttendee {
  return {
    id: 'a-1',
    first_name: 'Alice',
    last_name: 'Parked',
    email: 'alice@test.com',
    status: 'parked',
    notes: null,
    cancellable: true,
    history: [
      {
        event_type: 'parked',
        training_name: 'Agile 2026',
        notes: 'schedule conflict',
        created_at: '2026-04-18T10:00:00Z',
      },
      {
        event_type: 'registered',
        training_name: 'Agile 2026',
        notes: null,
        created_at: '2026-04-01T10:00:00Z',
      },
    ],
    ...overrides,
  };
}

describe('ParkingLotRow — Cancel action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a Cancel Registration button (not Deactivate)', () => {
    const onReassign = vi.fn();
    const onCancel = vi.fn();
    render(
      <ParkingLotRow
        attendee={makeAttendee()}
        onReassign={onReassign}
        onCancel={onCancel}
        cancelling={false}
      />
    );
    expect(screen.getByRole('button', { name: /cancel registration/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it('fires onCancel when clicked', async () => {
    const user = userEvent.setup();
    const onReassign = vi.fn();
    const onCancel = vi.fn();
    const att = makeAttendee();
    render(
      <ParkingLotRow
        attendee={att}
        onReassign={onReassign}
        onCancel={onCancel}
        cancelling={false}
      />
    );
    await user.click(screen.getByRole('button', { name: /cancel registration/i }));
    expect(onCancel).toHaveBeenCalledWith(att);
  });

  it('disables Cancel when the attendee is not cancellable', () => {
    render(
      <ParkingLotRow
        attendee={makeAttendee({ cancellable: false })}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
        cancelling={false}
      />
    );
    const btn = screen.getByRole('button', { name: /cancel registration/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/portal registrations/i);
  });

  it('disables Cancel while the mutation is pending', () => {
    render(
      <ParkingLotRow
        attendee={makeAttendee()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
        cancelling={true}
      />
    );
    const btn = screen.getByRole('button', { name: /cancel registration/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
