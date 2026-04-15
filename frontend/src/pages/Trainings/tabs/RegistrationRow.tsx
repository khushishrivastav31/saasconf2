import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';

interface Attendee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  include_exam: boolean;
  exam_mode: string | null;
  exam_language: string | null;
  extra_time: boolean;
}

interface Registration {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
  is_guaranteed: boolean;
  status: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  company_name: string | null;
  payment_method: string;
  invoice_status: string | null;
  invoice_number: string | null;
  total: string | null;
  currency: string;
  attendee_count: number;
  created_at: string | null;
  attendees: Attendee[];
}

interface ExamLanguage {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  invoiced: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const formatAmount = (amt: string | null, currency: string) => {
  if (!amt) return '—';
  const sym = currency === 'EUR' ? '€' : currency;
  return `${sym}\u00A0${Number(amt).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
};

function RegistrationRow({
  reg,
  expanded,
  onToggle,
  examLanguages,
}: {
  reg: Registration;
  expanded: boolean;
  onToggle: () => void;
  examLanguages: ExamLanguage[];
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [parkConfirm, setParkConfirm] = useState<{
    attId: string;
    sourceType: string;
    name: string;
  } | null>(null);

  const parkMutation = useMutation({
    mutationFn: ({ sourceId, sourceType }: { sourceId: string; sourceType: string }) =>
      api.post('/trainings/attendees/park-by-source', {
        source_type: sourceType,
        source_id: sourceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['training-attendees'] });
      showToast('Attendee moved to parking lot', 'success');
      setParkConfirm(null);
    },
    onError: () => showToast('Failed to park attendee', 'error'),
  });

  const onParkAttendee = (attId: string, sourceType: string, name: string) => {
    setParkConfirm({ attId, sourceType, name });
  };

  const updateAttendee = useMutation({
    mutationFn: ({
      attId,
      payload,
    }: {
      attId: string;
      payload: Record<string, string | boolean | null>;
    }) => api.patch(`/trainings/registrations/${reg.id}/attendees/${attId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      showToast('Attendee updated', 'success');
    },
    onError: () => showToast('Failed to update attendee', 'error'),
  });

  const handleChange = useCallback(
    (attId: string, field: string, value: string | boolean) => {
      const payload: Record<string, string | boolean | null> = { [field]: value };
      // Sync include_exam flag with exam_mode
      if (field === 'exam_mode') {
        if (value === 'none') {
          payload.exam_mode = null;
          payload.include_exam = false;
        } else {
          payload.include_exam = true;
        }
      }
      updateAttendee.mutate({ attId, payload });
    },
    [updateAttendee]
  );

  const selectCls =
    'px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100';

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 text-gray-400">
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
          {reg.contact_first_name} {reg.contact_last_name}
          {reg.company_name && (
            <span className="ml-1 text-xs text-gray-400">({reg.company_name})</span>
          )}
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{reg.contact_email}</td>
        <td
          className={`px-3 py-2 text-center ${reg.attendee_count === 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}
        >
          {reg.attendee_count}
        </td>
        <td className="px-3 py-2">
          {reg.attendee_count === 0 ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              title="All attendees parked — invoice may need adjustment"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              all parked
            </span>
          ) : (
            <span
              className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[reg.status] || 'bg-gray-100 text-gray-700'}`}
            >
              {reg.status}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="capitalize">{reg.payment_method?.replace('_', ' ')}</div>
          {reg.invoice_status && (
            <span
              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium mt-0.5 ${
                reg.invoice_status === 'paid'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : reg.invoice_status === 'sent'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : reg.invoice_status === 'overdue'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : reg.invoice_status === 'cancelled'
                        ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        : 'bg-gray-100 text-gray-600'
              }`}
            >
              {reg.invoice_status}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
          {formatAmount(reg.total, reg.currency)}
        </td>
      </tr>
      {expanded && reg.attendees.length > 0 && (
        <tr>
          <td colSpan={7} className="px-0 py-0">
            <div className="bg-gray-50 dark:bg-gray-900/50 px-8 py-3 border-t border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400 uppercase text-[10px]">
                    <th className="text-left py-1 pr-4">Name</th>
                    <th className="text-left py-1 pr-4">Email</th>
                    <th className="text-left py-1 pr-4">Exam</th>
                    <th className="text-left py-1 pr-4">Language</th>
                    <th className="text-left py-1 pr-4">Extra Time</th>
                    <th className="text-left py-1 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {reg.attendees.map((att) => (
                    <tr key={att.id} className="text-gray-700 dark:text-gray-300">
                      <td className="py-1 pr-4">
                        {att.first_name} {att.last_name}
                      </td>
                      <td className="py-1 pr-4">{att.email}</td>
                      <td className="py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls}
                          value={att.exam_mode || 'none'}
                          onChange={(e) => handleChange(att.id, 'exam_mode', e.target.value)}
                        >
                          <option value="none">—</option>
                          <option value="online">Online</option>
                          <option value="onsite">Onsite</option>
                        </select>
                      </td>
                      <td className="py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls}
                          value={att.exam_language || ''}
                          onChange={(e) => handleChange(att.id, 'exam_language', e.target.value)}
                        >
                          <option value="">—</option>
                          {examLanguages.map((el) => (
                            <option key={el.id} value={el.name}>
                              {el.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={att.extra_time}
                          onChange={(e) => handleChange(att.id, 'extra_time', e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="py-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() =>
                            onParkAttendee(
                              att.id,
                              'registration',
                              `${att.first_name} ${att.last_name}`
                            )
                          }
                          className="px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                          title="Move to Parking Lot"
                        >
                          Park Attendee
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}

      {/* Park confirmation dialog */}
      {parkConfirm && (
        <tr>
          <td colSpan={7}>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Park Attendee?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <strong>{parkConfirm.name}</strong> will be removed from this training and placed
                  in the Parking Lot.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setParkConfirm(null)}
                    className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      parkMutation.mutate({
                        sourceId: parkConfirm.attId,
                        sourceType: parkConfirm.sourceType,
                      })
                    }
                    disabled={parkMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-40"
                  >
                    {parkMutation.isPending ? 'Parking...' : 'Park'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default RegistrationRow;
export type { Registration, Attendee, ExamLanguage };
