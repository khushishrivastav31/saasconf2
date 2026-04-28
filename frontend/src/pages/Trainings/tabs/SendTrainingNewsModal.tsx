import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import Modal from '../../../components/Modal';
import { parseApiError } from '../../../utils/apiError';

interface PlacementOption {
  id: string;
  training_name: string;
  start_date: string | null;
  program_year_id: string;
}

interface ProgramYearOption {
  id: string;
  year: number;
}

interface RegistrationsResponseItem {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
}

interface RegistrationsResponse {
  items: RegistrationsResponseItem[];
}

interface ProgramYearsResponseItem {
  id: string;
  year: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

interface SendTrainingNewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  articleId: string;
  articleTitle: string;
  onSent?: (emailsSent: number) => void;
}

/**
 * Recipient targeting modal for the training news <em>Send</em> action.
 *
 * Defaults to "all training attendees in the tenant" (the existing
 * behavior). Optional filters narrow the pool: a specific placement,
 * a specific program year, or a specific registration status. Filters
 * are AND'd server-side.
 */
export default function SendTrainingNewsModal({
  isOpen,
  onClose,
  articleId,
  articleTitle,
  onSent,
}: SendTrainingNewsModalProps) {
  const [target, setTarget] = useState<'all' | 'placement' | 'year' | 'status'>('all');
  const [placementId, setPlacementId] = useState('');
  const [programYearId, setProgramYearId] = useState('');
  const [status, setStatus] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: regs } = useQuery({
    queryKey: ['training-registrations-for-news-send'],
    queryFn: async () => {
      const resp = await api.get<RegistrationsResponse>('/trainings/registrations', {
        params: { per_page: 200 },
      });
      return resp.data;
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  const { data: years } = useQuery({
    queryKey: ['training-program-years-for-news-send'],
    queryFn: async () => {
      const resp = await api.get<ProgramYearsResponseItem[]>('/trainings/programs/years');
      return resp.data;
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  // Group registrations by placement_id so the dropdown shows each placement once.
  const placements: PlacementOption[] = (() => {
    const seen = new Map<string, PlacementOption>();
    for (const r of regs?.items ?? []) {
      if (seen.has(r.placement_id)) continue;
      seen.set(r.placement_id, {
        id: r.placement_id,
        training_name: r.training_name,
        start_date: r.training_date,
        // Program year id isn't on the registrations endpoint, only used
        // for the year filter — leave empty here.
        program_year_id: '',
      });
    }
    return Array.from(seen.values()).sort((a, b) => {
      const da = a.start_date || '';
      const db = b.start_date || '';
      return da.localeCompare(db);
    });
  })();

  const programYears: ProgramYearOption[] = (years ?? []).slice().sort((a, b) => b.year - a.year);

  // Reset form whenever the modal re-opens for a different article.
  useEffect(() => {
    if (isOpen) {
      setTarget('all');
      setPlacementId('');
      setProgramYearId('');
      setStatus('');
      setShowConfirm(false);
      setError(null);
    }
  }, [isOpen]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: {
        placement_ids?: string[];
        program_year_id?: string;
        registration_status?: string;
      } = {};
      if (target === 'placement' && placementId) payload.placement_ids = [placementId];
      if (target === 'year' && programYearId) payload.program_year_id = programYearId;
      if (target === 'status' && status) payload.registration_status = status;
      const resp = await api.post<{ emails_sent: number }>(
        `/trainings/news/${articleId}/send`,
        payload
      );
      return resp.data;
    },
    onSuccess: (data) => {
      setShowConfirm(false);
      onSent?.(data.emails_sent);
      onClose();
    },
    onError: (err) => {
      setError(parseApiError(err));
      setShowConfirm(false);
    },
  });

  const recipientDescription =
    target === 'all'
      ? 'every training attendee in this tenant'
      : target === 'placement'
        ? placementId
          ? `attendees on ${placements.find((p) => p.id === placementId)?.training_name ?? 'the selected placement'}`
          : 'a specific placement (pick one)'
        : target === 'year'
          ? programYearId
            ? `attendees on placements in ${programYears.find((y) => y.id === programYearId)?.year ?? 'the selected year'}`
            : 'a specific program year (pick one)'
          : status
            ? `attendees with registration status "${status}"`
            : 'a specific registration status (pick one)';

  const canSend =
    target === 'all' ||
    (target === 'placement' && !!placementId) ||
    (target === 'year' && !!programYearId) ||
    (target === 'status' && !!status);

  return (
    <Modal open={isOpen} onClose={onClose} title={`Send "${articleTitle}"`}>
      <div className="px-6 py-4 space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pick who receives this article. Filters are applied to the tenant&apos;s training
          attendees.
        </p>

        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="radio"
              name="news-target"
              value="all"
              checked={target === 'all'}
              onChange={() => setTarget('all')}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">
              <span className="font-medium">All training attendees</span>{' '}
              <span className="text-gray-500 dark:text-gray-400">(default)</span>
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="radio"
              name="news-target"
              value="placement"
              checked={target === 'placement'}
              onChange={() => setTarget('placement')}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">
              <span className="font-medium">By training session</span>
              {target === 'placement' && (
                <select
                  value={placementId}
                  onChange={(e) => setPlacementId(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="">— Pick a session —</option>
                  {placements.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.training_name}
                      {p.start_date ? ` — ${p.start_date}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="radio"
              name="news-target"
              value="year"
              checked={target === 'year'}
              onChange={() => setTarget('year')}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">
              <span className="font-medium">By program year</span>
              {target === 'year' && (
                <select
                  value={programYearId}
                  onChange={(e) => setProgramYearId(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="">— Pick a year —</option>
                  {programYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.year}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="radio"
              name="news-target"
              value="status"
              checked={target === 'status'}
              onChange={() => setTarget('status')}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">
              <span className="font-medium">By registration status</span>
              {target === 'status' && (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
        </div>

        {showConfirm && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            Send <span className="font-semibold">{articleTitle}</span> to {recipientDescription}?
          </div>
        )}
      </div>

      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={sendMutation.isPending}
          className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Cancel
        </button>
        {showConfirm ? (
          <button
            type="button"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
          >
            {sendMutation.isPending ? 'Sending…' : 'Confirm send'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={!canSend}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
          >
            Send to {recipientDescription}
          </button>
        )}
      </div>
    </Modal>
  );
}
