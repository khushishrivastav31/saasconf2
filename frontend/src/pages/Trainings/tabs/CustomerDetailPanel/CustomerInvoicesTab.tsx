import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import api from '../../../../config/api';

interface CustomerInvoice {
  id: string;
  invoice_number: string | null;
  template_type: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  recipient_name: string;
  total: string | null;
  currency: string | null;
  offer_id: string | null;
  offer_number: string;
  related_invoice_id: string | null;
  created_at: string | null;
}

const INV_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

const INV_TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  credit_note: 'Credit Note',
};

export default function CustomerInvoicesTab({ customerId }: { customerId: string }) {
  const [, setSearchParams] = useSearchParams();

  const { data, isLoading } = useQuery<{ items: CustomerInvoice[] }>({
    queryKey: ['customer-invoices', customerId],
    queryFn: async () => {
      const res = await api.get(`/trainings/invoices/by-customer/${customerId}`);
      return res.data;
    },
  });

  const invoices = data?.items ?? [];

  const navigateToInvoice = (invoiceId: string) => {
    setSearchParams({ section: 'invoices', invoiceId });
  };

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

  const fmtAmount = (amt: string | null, cur: string | null) => {
    if (!amt) return '—';
    const sym = cur === 'EUR' ? '€' : (cur ?? '');
    const num = Number(amt);
    const formatted = Math.abs(num).toLocaleString('de-DE', { minimumFractionDigits: 2 });
    return num < 0 ? `-${sym}\u00A0${formatted}` : `${sym}\u00A0${formatted}`;
  };

  if (isLoading) return <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>;

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
        No invoices for this customer yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
              Invoice #
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
              Type
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
              Offer
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
              Issue Date
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
              Status
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {invoices.map((inv) => {
            const isNeg = inv.total !== null && Number(inv.total) < 0;
            const isCreditNote = inv.template_type === 'credit_note';
            return (
              <tr
                key={inv.id}
                onClick={() => navigateToInvoice(inv.id)}
                className={`cursor-pointer transition-colors ${
                  isCreditNote
                    ? 'bg-orange-50/40 dark:bg-orange-900/5 hover:bg-orange-50 dark:hover:bg-orange-900/10'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-gray-100">
                  {isCreditNote && <span className="mr-1 text-gray-400">↳</span>}
                  {inv.invoice_number ?? 'DRAFT'}
                </td>
                <td className="px-3 py-2 text-xs">
                  {INV_TYPE_LABELS[inv.template_type] ?? inv.template_type}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {inv.offer_number}
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                  {fmtDate(inv.issue_date)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${INV_STATUS_COLORS[inv.status] ?? ''}`}
                  >
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium tabular-nums ${isNeg ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
                >
                  {fmtAmount(inv.total, inv.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
