import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';

interface HistoryItem {
  registration_id: string;
  conference_id: string;
  conference_name: string;
  booking_option_name: string | null;
  status: string;
  discount_code: string | null;
  payment_method: string | null;
  invoice_total: string | null;
  invoice_currency: string | null;
  invoice_status: string | null;
  registered_at: string | null;
}

export default function BookingHistory({
  email,
  conferenceId,
}: {
  email: string;
  conferenceId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['booking-history', email, conferenceId],
    queryFn: async () => {
      const res = await api.get(
        `/conferences/${conferenceId}/registrations/history/by-email/${encodeURIComponent(email)}`
      );
      return res.data as { email: string; items: HistoryItem[] };
    },
    enabled: expanded,
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  // Exclude the current conference's registration (already visible above)
  const otherItems = items.filter((i) => i.conference_id !== conferenceId);

  if (!expanded) {
    return (
      <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          Show booking history across conferences
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
        Booking History
        <span className="ml-1 text-xs font-normal text-gray-400">({email})</span>
      </h4>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : otherItems.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No other conference registrations found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Conference
                </th>
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Ticket
                </th>
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="text-left py-1.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Discount
                </th>
                <th className="text-right py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {otherItems.map((item) => (
                <tr key={item.registration_id}>
                  <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">
                    {item.conference_name}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">
                    {item.booking_option_name ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        item.status === 'paid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : item.status === 'cancelled'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}
                    >
                      {(item.invoice_status ?? item.status).replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 text-xs">
                    {item.discount_code ?? '—'}
                  </td>
                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                    {item.invoice_total
                      ? `${item.invoice_currency ?? ''} ${Number(item.invoice_total).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
