import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionModal from '../SessionModal';
import type { ProgramSession, SessionType, ProgramTimeSlot } from '../../../../../types';

vi.mock('../../../../../components/Modal', () => ({
  default: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../../../../components/ConfirmDialog', () => ({
  default: () => null,
}));

const SESSION_TYPES: SessionType[] = [
  {
    id: 'st-active',
    name: 'Keynote',
    slug: 'keynote',
    duration_minutes: 45,
    cfp_eligible: true,
    separately_bookable: false,
    max_attendees: null,
    is_active: true,
    user_role_id: null,
    conference_id: 'conf-1',
  },
  {
    id: 'st-inactive',
    name: 'Archived Type',
    slug: 'archived',
    duration_minutes: 30,
    cfp_eligible: false,
    separately_bookable: false,
    max_attendees: null,
    is_active: false,
    user_role_id: null,
    conference_id: 'conf-1',
  },
];

const MOCK_SLOT: ProgramTimeSlot = {
  id: 'slot-1',
  start_time: '09:00',
  end_time: '09:45',
  slot_type: 'session',
  is_session_free: false,
  day_id: 'day-1',
  display_order: 0,
};

const MOCK_SESSION: ProgramSession = {
  id: 'sess-1',
  title: 'Opening',
  description: null,
  session_type_id: null,
  slot_span: 1,
  track_span: 1,
  is_general_event: false,
  allow_in_session_free: false,
  color: null,
  notes: null,
  start_slot_id: 'slot-1',
  start_track_id: null,
  paper_id: null,
  separately_bookable: false,
  conference_id: 'conf-1',
  tenant_id: 'tenant-1',
} as unknown as ProgramSession;

function renderModal(sessionTypes = SESSION_TYPES) {
  return render(
    <SessionModal
      open
      onClose={vi.fn()}
      session={MOCK_SESSION}
      sessionTypes={sessionTypes}
      slots={[MOCK_SLOT]}
      maxSlotSpan={4}
      maxTrackSpan={4}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      isAdmin
    />
  );
}

describe('SessionModal — session type dropdown', () => {
  it('renders active session types in the dropdown', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Keynote/i })).toBeInTheDocument();
  });

  it('does not show inactive session types', () => {
    renderModal();

    expect(screen.queryByRole('option', { name: /Archived Type/i })).toBeNull();
  });

  it('includes a "No type" default option', () => {
    renderModal();

    expect(screen.getByRole('option', { name: /no type/i })).toBeInTheDocument();
  });

  it('does not render the session-type dropdown when no session types are configured', () => {
    renderModal([]);

    // The session-type select is only rendered when safeSessionTypes.length > 0
    expect(screen.queryByRole('option', { name: /no type/i })).toBeNull();
  });
});
