import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';

interface PortalRegistration {
  id: string;
  conference_id: string;
  conference_name: string;
  booking_option_name: string | null;
  status: string;
  invoice_id: string | null;
  invoice_number: string | null;
  created_at: string | null;
}

function statusClasses(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'invoiced':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'registered_pending_invoice':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'invoiced':
      return 'Invoiced';
    case 'registered_pending_invoice':
      return 'Pending Invoice';
    default:
      return status.replace(/_/g, ' ');
  }
}

function RegistrationsPage() {
  const { data: registrations, isLoading } = useQuery({
    queryKey: ['portal-unified-registrations'],
    queryFn: async () => {
      const res = await portalApi.get<PortalRegistration[]>('/portal/unified/me/registrations');
      return res.data;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!registrations || registrations.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
          />
        </svg>
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
          No registrations found
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          You don't have any conference registrations yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Registrations</h2>
      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Conference
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Booking Option
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Invoice
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Registered
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {registrations.map((reg) => (
              <tr key={reg.id}>
                <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {reg.conference_name}
                </td>
                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {reg.booking_option_name ?? '—'}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses(reg.status)}`}
                  >
                    {statusLabel(reg.status)}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {reg.invoice_number ?? '—'}
                </td>
                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {reg.created_at ? new Date(reg.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(RegistrationsPage);
