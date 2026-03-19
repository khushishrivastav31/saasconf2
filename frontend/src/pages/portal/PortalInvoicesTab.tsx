import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { getApplicantAccessToken } from '../../config/portalApi';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

interface PortalInvoice {
  id: string;
  conference_id: string;
  conference_name: string;
  invoice_number: string | null;
  template_type: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  total: number | null;
  currency: string | null;
}

import { INVOICE_STATUS_COLORS as STATUS_COLORS } from '../../config/statusColors';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function PortalInvoicesTab() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-invoices'],
    queryFn: async () => {
      const response = await portalApi.get<{ items: PortalInvoice[]; total: number }>(
        '/portal/invoices'
      );
      return response.data;
    },
  });

  const handleDownloadPdf = async (invoice: PortalInvoice) => {
    setDownloadingId(invoice.id);
    try {
      const token = getApplicantAccessToken();
      const response = await fetch(`${API_URL}/api/v1/portal/invoices/${invoice.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${invoice.invoice_number || 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user can retry
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  if (!data?.items || data.items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
          No invoices yet.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">Your Invoices</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Invoices issued to you by conference organisers.
        </p>
      </div>
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Invoice #
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Conference
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Issue Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Due Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              PDF
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.items.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                {invoice.invoice_number || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {invoice.conference_name}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {invoice.issue_date || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {invoice.due_date || '-'}
              </td>
              <td className="px-4 py-3 text-sm">
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    STATUS_COLORS[invoice.status] ||
                    'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
                {invoice.total != null
                  ? `${Number(invoice.total).toFixed(2)}${invoice.currency ? ` ${invoice.currency}` : ''}`
                  : '-'}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(invoice)}
                  disabled={downloadingId === invoice.id}
                  className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-sm font-medium disabled:opacity-50"
                >
                  {downloadingId === invoice.id ? 'Downloading...' : 'Download'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
