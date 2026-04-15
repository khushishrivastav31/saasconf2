import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';

interface OfferAttendeeItem {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
  is_guaranteed: boolean;
  first_name: string;
  last_name: string;
  email: string | null;
  offer_id: string;
  offer_number: string;
  customer_id: string;
  customer_name: string;
  certification: boolean;
  exam_mode: string | null;
  exam_language: string | null;
  extra_time: boolean;
}

interface ExamLanguage {
  id: string;
  name: string;
}

// ── Offer attendee grouping + row ─────────────────────────────────────────────
interface OfferAttendeeGroup {
  offerId: string;
  offerNumber: string;
  customerId: string;
  customerName: string;
  attendees: OfferAttendeeItem[];
}

function groupOfferAttendeesByOffer(items: OfferAttendeeItem[]): OfferAttendeeGroup[] {
  const map = new Map<string, OfferAttendeeGroup>();
  for (const oa of items) {
    const existing = map.get(oa.offer_id);
    if (existing) {
      existing.attendees.push(oa);
    } else {
      map.set(oa.offer_id, {
        offerId: oa.offer_id,
        offerNumber: oa.offer_number,
        customerId: oa.customer_id,
        customerName: oa.customer_name,
        attendees: [oa],
      });
    }
  }
  return Array.from(map.values());
}

function OfferAttendeeRow({
  group,
  expanded,
  onToggle,
  onNavigate,
  examLanguages,
}: {
  group: OfferAttendeeGroup;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  examLanguages: ExamLanguage[];
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const updateMutation = useMutation({
    mutationFn: ({
      attId,
      payload,
    }: {
      attId: string;
      payload: Record<string, string | boolean | null>;
    }) => api.patch(`/trainings/offers/${group.offerId}/attendees/${attId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['offer-attendees'] });
      showToast('Attendee updated', 'success');
    },
    onError: () => showToast('Failed to update attendee', 'error'),
  });

  const handleChange = useCallback(
    (attId: string, field: string, value: string | boolean) => {
      const payload: Record<string, string | boolean | null> = { [field]: value };
      // Sync certification flag with exam_mode
      if (field === 'exam_mode') {
        if (value === 'none') {
          payload.exam_mode = null;
          payload.certification = false;
        } else {
          payload.certification = true;
        }
      }
      updateMutation.mutate({ attId, payload });
    },
    [updateMutation]
  );

  const selectCls =
    'px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100';

  return (
    <>
      <tr
        className="bg-purple-50/40 dark:bg-purple-900/5 hover:bg-purple-50 dark:hover:bg-purple-900/10 cursor-pointer"
        onClick={onToggle}
      >
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
        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{group.customerName}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
          {group.attendees[0]?.email || '—'}
        </td>
        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
          {group.attendees.length}
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate();
            }}
            className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
          >
            {group.offerNumber}
          </button>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">—</td>
        <td className="px-3 py-2 text-right text-xs text-gray-400">—</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="px-0 py-0">
            <div className="bg-purple-50/30 dark:bg-purple-900/5 px-8 py-3 border-t border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400 uppercase text-[10px]">
                    <th className="text-left py-1 pr-4">Name</th>
                    <th className="text-left py-1 pr-4">Email</th>
                    <th className="text-left py-1 pr-4">Exam</th>
                    <th className="text-left py-1 pr-4">Language</th>
                    <th className="text-left py-1">Extra Time</th>
                  </tr>
                </thead>
                <tbody>
                  {group.attendees.map((att) => (
                    <tr key={att.id} className="text-gray-700 dark:text-gray-300">
                      <td className="py-1 pr-4">
                        {att.first_name} {att.last_name}
                      </td>
                      <td className="py-1 pr-4">{att.email || '—'}</td>
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
                      <td className="py-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={att.extra_time}
                          onChange={(e) => handleChange(att.id, 'extra_time', e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default OfferAttendeeRow;
// eslint-disable-next-line react-refresh/only-export-components
export { groupOfferAttendeesByOffer };
export type { OfferAttendeeItem };
