/**
 * Portal "My Registration" page.
 *
 * Shows the authenticated user's registrations across conferences.
 * If a booking session hasn't been chosen yet, the user can select one.
 * Once selected, it's locked — only the admin can change it.
 */
import { memo, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { useToast } from '../../components/Toast';
import type {
  BookableSessionsResponse,
  BookableSessionGroup,
  BookableSlot,
} from '../../types/registration';

// ── Types ─────────────────────────────────────────────────────────────

interface RegistrationItem {
  id: string;
  item_type: string;
  item_name: string;
  booking_option_id: string | null;
  program_session_id: string | null;
  program_session_name: string | null;
  has_bookable_sessions: boolean;
}

interface MyRegistration {
  id: string;
  conference_id: string;
  conference_name: string | null;
  conference_abbreviation: string | null;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  booking_option_id: string;
  booking_option_name: string | null;
  has_bookable_sessions: boolean;
  main_session_id: string | null;
  main_session_name: string | null;
  created_at: string | null;
  items: RegistrationItem[];
}

// ── Status badge ──────────────────────────────────────────────────────

function statusClasses(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'invoiced':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'registered_pending_invoice':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'invoiced':
      return 'Invoiced';
    case 'registered_pending_invoice':
      return 'Pending Invoice';
    default:
      return status.replace(/_/g, ' ');
  }
}

// ── Session selector (inline) ─────────────────────────────────────────

function formatSessionLabel(session: {
  title: string;
  speaker_name: string | null;
  has_paper: boolean;
  max_attendees?: number | null;
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

  if (
    session.max_attendees &&
    session.available_spots !== undefined &&
    session.available_spots !== null
  ) {
    label += ` (${session.available_spots} spots left)`;
  }

  return label;
}

function SlotSelector({
  slot,
  typeName,
  selectedSessionId,
  onSelect,
}: {
  slot: BookableSlot;
  typeName: string;
  selectedSessionId: string;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {slot.label}
      </label>
      <select
        className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
        value={selectedSessionId}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">-- Choose a {typeName} --</option>
        {slot.sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {formatSessionLabel(s)}
          </option>
        ))}
      </select>
    </div>
  );
}

function SessionSelector({
  registrationId,
  onSessionSelected,
}: {
  registrationId: string;
  onSessionSelected: () => void;
}) {
  const { showToast } = useToast();
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-my-bookable-sessions', registrationId],
    queryFn: async () => {
      const res = await portalApi.get<BookableSessionsResponse>(
        `/portal/my-registrations/${registrationId}/bookable-sessions`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const handleConfirm = useCallback(async () => {
    if (!selectedSessionId) return;
    setIsSubmitting(true);
    try {
      await portalApi.put(`/portal/my-registrations/${registrationId}/select-session`, {
        session_id: selectedSessionId,
      });
      showToast('Session selected successfully!', 'success');
      onSessionSelected();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      showToast(msg || 'Failed to select session', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedSessionId, registrationId, showToast, onSessionSelected]);

  if (isLoading) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 py-2">Loading sessions...</div>;
  }

  if (!data || data.groups.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        No sessions available for selection yet.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Select your session:</p>
      {data.groups.map((group: BookableSessionGroup) => {
        const allTba = group.slots.every((slot) => slot.sessions.every((s) => !s.has_paper));
        if (allTba) {
          return (
            <div key={group.session_type_id || 'untyped'}>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {group.session_type_name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                Sessions will be announced soon. You can choose later.
              </p>
            </div>
          );
        }
        return (
          <div key={group.session_type_id || 'untyped'} className="space-y-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Choose a {group.session_type_name}:
            </p>
            {group.slots.map((slot) => (
              <SlotSelector
                key={slot.slot_id}
                slot={slot}
                typeName={group.session_type_name}
                selectedSessionId={selectedSessionId}
                onSelect={setSelectedSessionId}
              />
            ))}
          </div>
        );
      })}

      <button
        onClick={handleConfirm}
        disabled={!selectedSessionId || isSubmitting}
        className="mt-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Saving...' : 'Confirm Session'}
      </button>
    </div>
  );
}

// ── Item session selector ─────────────────────────────────────────────

function ItemSessionSelector({
  registrationId,
  itemId,
  onSessionSelected,
}: {
  registrationId: string;
  itemId: string;
  onSessionSelected: () => void;
}) {
  const { showToast } = useToast();
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-item-bookable-sessions', registrationId, itemId],
    queryFn: async () => {
      const res = await portalApi.get<BookableSessionsResponse>(
        `/portal/my-registrations/${registrationId}/items/${itemId}/bookable-sessions`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const handleConfirm = useCallback(async () => {
    if (!selectedSessionId) return;
    setIsSubmitting(true);
    try {
      await portalApi.put(
        `/portal/my-registrations/${registrationId}/items/${itemId}/select-session`,
        { session_id: selectedSessionId }
      );
      showToast('Session selected successfully!', 'success');
      onSessionSelected();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      showToast(msg || 'Failed to select session', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedSessionId, registrationId, itemId, showToast, onSessionSelected]);

  if (isLoading) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 py-1">Loading sessions...</div>;
  }

  if (!data || data.groups.length === 0) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400 italic">
        No sessions available yet
      </span>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      {data.groups.map((group: BookableSessionGroup) => {
        const allTba = group.slots.every((slot) => slot.sessions.every((s) => !s.has_paper));
        if (allTba) {
          return (
            <span
              key={group.session_type_id || 'untyped'}
              className="text-xs text-gray-500 dark:text-gray-400 italic"
            >
              Sessions will be announced soon
            </span>
          );
        }
        return (
          <div key={group.session_type_id || 'untyped'} className="space-y-1">
            {group.slots.map((slot) => (
              <SlotSelector
                key={slot.slot_id}
                slot={slot}
                typeName={group.session_type_name}
                selectedSessionId={selectedSessionId}
                onSelect={setSelectedSessionId}
              />
            ))}
          </div>
        );
      })}

      {selectedSessionId && (
        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Saving...' : 'Confirm'}
        </button>
      )}
    </div>
  );
}

// ── Registration card ─────────────────────────────────────────────────

const RegistrationCard = memo(function RegistrationCard({
  reg,
  onRefresh,
}: {
  reg: MyRegistration;
  onRefresh: () => void;
}) {
  const needsSession = reg.has_bookable_sessions && !reg.main_session_id;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {reg.conference_name || 'Conference'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {reg.first_name} {reg.last_name} &middot; {reg.email}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses(reg.status)}`}
        >
          {statusLabel(reg.status)}
        </span>
      </div>

      {/* Main Booking Option */}
      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Main Booking Option
        </p>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-1">
          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
            {reg.booking_option_name || '—'}
          </p>
          {reg.main_session_id && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {reg.main_session_name || '—'}
            </p>
          )}
          {needsSession && (
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-4 h-4 text-amber-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.832c-.77-.833-2.194-.833-2.964 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Please select your session
                </span>
              </div>
              <SessionSelector registrationId={reg.id} onSessionSelected={onRefresh} />
            </div>
          )}
        </div>
      </div>

      {/* Registered date */}
      {reg.created_at && (
        <div className="text-sm">
          <span className="text-gray-500 dark:text-gray-400">Registered:</span>{' '}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {new Date(reg.created_at).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Add-on Items */}
      {reg.items.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Add-on Items
          </p>
          <div className="space-y-3">
            {reg.items.map((item) => (
              <div key={item.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  {item.item_name}
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    {item.item_type === 'tutorial' ? 'Tutorial' : 'Option'}
                  </span>
                </p>
                {item.program_session_id && item.program_session_name && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {item.program_session_name}
                  </p>
                )}
                {item.has_bookable_sessions && !item.program_session_id && (
                  <ItemSessionSelector
                    registrationId={reg.id}
                    itemId={item.id}
                    onSessionSelected={onRefresh}
                  />
                )}
                {item.has_bookable_sessions && item.program_session_id && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
                    Session locked
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked session notice (main) */}
      {reg.has_bookable_sessions && reg.main_session_id && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          Session locked. Contact the conference organizer if you need to change it.
        </p>
      )}
    </div>
  );
});

// ── Main page ─────────────────────────────────────────────────────────

function MyRegistrationsPage() {
  const queryClient = useQueryClient();

  const { data: registrations, isLoading } = useQuery({
    queryKey: ['portal-my-registrations'],
    queryFn: async () => {
      const res = await portalApi.get<MyRegistration[]>('/portal/my-registrations');
      return res.data;
    },
    staleTime: 30_000,
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['portal-my-registrations'] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!registrations || registrations.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
          />
        </svg>
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
          No registrations found
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          You don't have any conference registrations yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Registrations</h2>
      <div className="space-y-4">
        {registrations.map((reg) => (
          <RegistrationCard key={reg.id} reg={reg} onRefresh={handleRefresh} />
        ))}
      </div>
    </div>
  );
}

export default memo(MyRegistrationsPage);
