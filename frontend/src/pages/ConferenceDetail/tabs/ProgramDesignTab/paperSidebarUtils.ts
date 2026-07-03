import type { ProgramSession, ProgramTimeSlot } from '../../../../types';

/** Total scheduled minutes a session occupies across its spanned time slots. */
export function computeSessionDurationMinutes(
  session: ProgramSession,
  slots: ProgramTimeSlot[]
): number {
  const sortedSlots = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const startIdx = sortedSlots.findIndex((s) => s.id === session.start_slot_id);
  if (startIdx === -1) return 0;

  let totalMinutes = 0;
  for (let i = startIdx; i < startIdx + session.slot_span && i < sortedSlots.length; i++) {
    const slot = sortedSlots[i];
    const [sh, sm] = slot.start_time.split(':').map(Number);
    const [eh, em] = slot.end_time.split(':').map(Number);
    totalMinutes += eh * 60 + em - (sh * 60 + sm);
  }
  return totalMinutes;
}
