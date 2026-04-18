export interface HistoryEvent {
  event_type: string;
  training_name: string;
  notes: string | null;
  created_at: string | null;
}

export interface ParkedAttendee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  notes: string | null;
  history: HistoryEvent[];
}

export interface AvailablePlacement {
  id: string;
  training_name: string;
  start_date: string | null;
  placement_type: string;
  is_guaranteed: boolean;
  language: string | null;
}

export const formatDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

export const formatPlacementDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';
