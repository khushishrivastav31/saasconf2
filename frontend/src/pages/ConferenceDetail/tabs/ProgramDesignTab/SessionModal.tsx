import { useState, useEffect, useMemo } from 'react';
import type {
  ProgramSession,
  ProgramSessionUpdate,
  ProgramTimeSlot,
  SessionType,
} from '../../../../types';
import Modal from '../../../../components/Modal';
import ConfirmDialog from '../../../../components/ConfirmDialog';

interface SessionModalProps {
  open: boolean;
  onClose: () => void;
  session: ProgramSession | null;
  sessionTypes: SessionType[];
  slots: ProgramTimeSlot[];
  maxSlotSpan: number;
  maxTrackSpan: number;
  onUpdate: (sessionId: string, data: ProgramSessionUpdate) => void;
  onDelete: (sessionId: string) => void;
  isAdmin: boolean;
}

const PRESET_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#6366F1',
];

export default function SessionModal({
  open,
  onClose,
  session,
  sessionTypes,
  slots,
  maxSlotSpan,
  maxTrackSpan,
  onUpdate,
  onDelete,
  isAdmin,
}: SessionModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sessionTypeId, setSessionTypeId] = useState<string>('');
  const [slotSpan, setSlotSpan] = useState(1);
  const [trackSpan, setTrackSpan] = useState(1);
  const [isGeneralEvent, setIsGeneralEvent] = useState(false);
  const [allowInSessionFree, setAllowInSessionFree] = useState(false);
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [notes, setNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnmergeConfirm, setShowUnmergeConfirm] = useState(false);

  useEffect(() => {
    if (session) {
      setTitle(session.title);
      setDescription(session.description || '');
      setSessionTypeId(session.session_type_id || '');
      setSlotSpan(session.slot_span);
      setTrackSpan(session.track_span);
      setIsGeneralEvent(session.is_general_event);
      setAllowInSessionFree(session.allow_in_session_free);
      setColor(session.color || PRESET_COLORS[0]);
      setNotes(session.notes || '');
    }
  }, [session]);

  // Compute total duration (in minutes) of the slots this session spans
  const slotDurationMinutes = useMemo(() => {
    if (!session) return 0;
    const sortedSlots = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const startIdx = sortedSlots.findIndex((s) => s.id === session.start_slot_id);
    if (startIdx === -1) return 0;

    let totalMinutes = 0;
    for (let i = startIdx; i < startIdx + slotSpan && i < sortedSlots.length; i++) {
      const slot = sortedSlots[i];
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      totalMinutes += eh * 60 + em - (sh * 60 + sm);
    }
    return totalMinutes;
  }, [session, slots, slotSpan]);

  // Check if selected session type duration exceeds the slot duration
  const safeSessionTypes = Array.isArray(sessionTypes) ? sessionTypes : [];
  const selectedSessionType = safeSessionTypes.find((st) => st.id === sessionTypeId);
  const durationExceedsSlots = selectedSessionType
    ? selectedSessionType.duration_minutes > slotDurationMinutes
    : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !title.trim()) return;

    onUpdate(session.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      session_type_id: isGeneralEvent ? undefined : sessionTypeId || undefined,
      slot_span: slotSpan,
      track_span: isGeneralEvent ? 0 : trackSpan,
      is_general_event: isGeneralEvent,
      allow_in_session_free: allowInSessionFree,
      color: color || undefined,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!session) return;
    setShowDeleteConfirm(true);
  };

  if (!session) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Session" size="max-w-lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
            required
            disabled={!isAdmin}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
            disabled={!isAdmin}
          />
        </div>

        {/* General Event Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isGeneralEvent"
            checked={isGeneralEvent}
            onChange={(e) => setIsGeneralEvent(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            disabled={!isAdmin}
          />
          <label htmlFor="isGeneralEvent" className="text-sm text-gray-700 dark:text-gray-300">
            This is a general event (spans all tracks)
          </label>
        </div>

        {/* Allow in Session-Free Slots */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="allowInSessionFree"
            checked={allowInSessionFree}
            onChange={(e) => setAllowInSessionFree(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
            disabled={!isAdmin}
          />
          <label htmlFor="allowInSessionFree" className="text-sm text-gray-700 dark:text-gray-300">
            Allow in break/lunch slots
          </label>
          <span
            className="text-xs text-gray-400 dark:text-gray-500"
            title="Enable this to place the session in time slots marked as breaks or lunch"
          >
            (?)
          </span>
        </div>

        {/* Conditional fields based on whether it's a general event */}
        {!isGeneralEvent && (
          <>
            {/* Session Type */}
            {safeSessionTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Session Type
                </label>
                <select
                  value={sessionTypeId}
                  onChange={(e) => setSessionTypeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
                  disabled={!isAdmin}
                >
                  <option value="">No type</option>
                  {safeSessionTypes
                    .filter((st) => st.is_active)
                    .map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.duration_minutes} min)
                      </option>
                    ))}
                </select>
                {durationExceedsSlots && selectedSessionType && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Session type duration ({selectedSessionType.duration_minutes} min) exceeds the
                      allocated slot time ({slotDurationMinutes} min).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Track Span */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Track Span (columns)
              </label>
              <select
                value={trackSpan}
                onChange={(e) => setTrackSpan(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
                disabled={!isAdmin}
              >
                {Array.from({ length: maxTrackSpan }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} track{n !== 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Slot Span */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Time Slot Span (rows)
          </label>
          <select
            value={slotSpan}
            onChange={(e) => setSlotSpan(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
            disabled={!isAdmin}
          >
            {Array.from({ length: maxSlotSpan }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} slot{n !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Color
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                disabled={!isAdmin}
                className={`w-8 h-8 rounded-full border-2 ${
                  color === c ? 'border-gray-800 dark:border-gray-200' : 'border-transparent'
                } ${!isAdmin ? 'opacity-50' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Internal Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes visible only to organizers..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
            disabled={!isAdmin}
          />
        </div>

        {/* Paper link info */}
        {session.paper_id && session.paper_title && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md flex items-center justify-between gap-2">
            <p className="text-sm text-blue-700 dark:text-blue-300 min-w-0">
              <span className="font-medium">Linked Paper:</span> {session.paper_title}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  onUpdate(session.id, { paper_id: null });
                  onClose();
                }}
                className="flex-shrink-0 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
              >
                Unassign
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <div className="flex gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50"
              >
                Delete Session
              </button>
            )}
            {isAdmin && (session.slot_span > 1 || session.track_span > 1) && (
              <button
                type="button"
                onClick={() => setShowUnmergeConfirm(true)}
                className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/50"
              >
                Unmerge
              </button>
            )}
          </div>
          <div className="flex gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {isAdmin ? 'Cancel' : 'Close'}
            </button>
            {isAdmin && (
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
              >
                Save Changes
              </button>
            )}
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Session"
        message={`Delete "${session.title}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete(session.id);
          onClose();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showUnmergeConfirm}
        title="Unmerge Session"
        message="Unmerge this session back into individual cells?"
        confirmLabel="Unmerge"
        variant="warning"
        onConfirm={() => {
          setShowUnmergeConfirm(false);
          onDelete(session.id);
          onClose();
        }}
        onCancel={() => setShowUnmergeConfirm(false)}
      />
    </Modal>
  );
}
