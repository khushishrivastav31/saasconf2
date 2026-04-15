import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { useToast } from '../../../../../components/Toast';
import { parseApiError } from '../../../../../utils/apiError';
import { queryKeys } from '../../../../../config/queryKeys';
import type { OfferAttendee } from '../../../../../types/training';

// ---------------------------------------------------------------------------
// Attendee types & helpers
// ---------------------------------------------------------------------------

export interface AttendeeFormData {
  first_name: string;
  last_name: string;
  email: string;
  certification: boolean;
  exam_mode: string;
  extra_time: boolean;
  exam_language: string;
  comments: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export function emptyAttendeeForm(): AttendeeFormData {
  return {
    first_name: '',
    last_name: '',
    email: '',
    certification: false,
    exam_mode: '',
    extra_time: false,
    exam_language: '',
    comments: '',
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function attendeeToForm(a: OfferAttendee): AttendeeFormData {
  return {
    first_name: a.first_name,
    last_name: a.last_name,
    email: a.email ?? '',
    certification: a.certification,
    exam_mode: a.exam_mode ?? '',
    extra_time: a.extra_time,
    exam_language: a.exam_language ?? '',
    comments: a.comments ?? '',
  };
}

// ---------------------------------------------------------------------------
// AttendeeRow — inline-editable row within an expanded placement
// ---------------------------------------------------------------------------

const AttendeeRow = React.memo(function AttendeeRow({
  attendee,
  offerId,
  placementId,
  languages,
  isNew,
  onCancelNew,
}: {
  attendee: OfferAttendee | null;
  offerId: string;
  placementId: string;
  languages: Array<{ id: string; name: string }>;
  isNew?: boolean;
  onCancelNew?: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState<AttendeeFormData>(
    attendee ? attendeeToForm(attendee) : emptyAttendeeForm()
  );
  const [isDirty, setIsDirty] = useState(false);

  const inputClass =
    'block w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100';
  const checkboxClass =
    'rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500';

  const invalidateAttendees = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.offerAttendees(offerId, placementId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.customerOffers('') });
    // Update trainer schedule to reflect new attendee counts
    queryClient.invalidateQueries({ queryKey: ['trainer-schedule'] });
    queryClient.invalidateQueries({ queryKey: ['all-offers'] });
  }, [queryClient, offerId, placementId]);

  const updateField = useCallback((key: keyof AttendeeFormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        certification: form.certification,
        exam_mode: form.exam_mode || null,
        extra_time: form.extra_time,
        exam_language: form.exam_language || null,
        comments: form.comments || null,
      };
      if (isNew) {
        await api.post(`/trainings/offers/${offerId}/attendees`, {
          ...payload,
          placement_id: placementId,
        });
      } else if (attendee) {
        await api.put(`/trainings/offers/${offerId}/attendees/${attendee.id}`, payload);
      }
    },
    onSuccess: () => {
      invalidateAttendees();
      setIsDirty(false);
      if (isNew && onCancelNew) onCancelNew();
      showToast(isNew ? 'Attendee added' : 'Attendee updated', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!attendee) return;
      await api.delete(`/trainings/offers/${offerId}/attendees/${attendee.id}`);
    },
    onSuccess: () => {
      invalidateAttendees();
      showToast('Attendee deleted', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const canSave = form.first_name.trim() && form.last_name.trim() && (isDirty || isNew);

  return (
    <tr className="bg-gray-200 dark:bg-gray-900/70">
      <td colSpan={4} className="px-2 py-2">
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 space-y-2 bg-white dark:bg-gray-800">
          {/* Row 1: Name, Email, Comments, Actions */}
          <div className="flex gap-2 items-start">
            <input
              type="text"
              className={inputClass + ' flex-1'}
              placeholder="First name"
              value={form.first_name}
              onChange={(e) => updateField('first_name', e.target.value)}
            />
            <input
              type="text"
              className={inputClass + ' flex-1'}
              placeholder="Last name"
              value={form.last_name}
              onChange={(e) => updateField('last_name', e.target.value)}
            />
            <input
              type="email"
              className={inputClass + ' flex-1'}
              placeholder="Email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
            />
            <input
              type="text"
              className={inputClass + ' flex-1'}
              placeholder="Comments"
              value={form.comments}
              onChange={(e) => updateField('comments', e.target.value)}
            />
            <div className="flex items-center gap-1 shrink-0">
              {canSave && (
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? '...' : 'Save'}
                </button>
              )}
              {isNew ? (
                <button
                  type="button"
                  onClick={onCancelNew}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                  title="Cancel"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 transition-colors"
                  title="Delete attendee"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {/* Row 2: Certification exam options */}
          <div className="flex items-center gap-2">
            <select
              className={`${inputClass} w-auto ${
                form.certification
                  ? 'border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                  : ''
              }`}
              value={form.certification ? form.exam_mode || 'onsite' : 'none'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'none') {
                  updateField('certification', false);
                  updateField('exam_mode', '');
                } else {
                  updateField('certification', true);
                  updateField('exam_mode', val);
                }
              }}
            >
              <option value="none">No exam</option>
              <option value="onsite">Exam: On-site</option>
              <option value="online">Exam: Online</option>
            </select>
            {form.certification && (
              <>
                <select
                  className={inputClass + ' w-auto max-w-28'}
                  value={form.exam_language}
                  onChange={(e) => updateField('exam_language', e.target.value)}
                >
                  <option value="">Exam language</option>
                  {languages.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={form.extra_time}
                    onChange={(e) => updateField('extra_time', e.target.checked)}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Extra time (foreign language)
                  </span>
                </label>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
});

export default AttendeeRow;
