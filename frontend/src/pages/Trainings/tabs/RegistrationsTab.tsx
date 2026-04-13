/**
 * Training Registrations Tab
 *
 * Lists all training registrations with attendee details, expandable rows.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';

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
  status: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  company_name: string | null;
  payment_method: string;
  total: string | null;
  currency: string;
  attendee_count: number;
  created_at: string | null;
  attendees: Attendee[];
}

const STATUS_COLORS: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  invoiced: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function RegistrationsTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), per_page: '50' };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [search, statusFilter, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['training-registrations', params],
    queryFn: async () => {
      const res = await api.get('/trainings/registrations', { params });
      return res.data as { items: Registration[]; total: number; page: number; per_page: number };
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Training Registrations
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({total})
            </span>
          )}
        </h2>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, company..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All statuses</option>
          <option value="registered">Registered</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          No registrations found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 w-8" />
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    Training
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    Contact
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    Email
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-400">
                    Attendees
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    Payment
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((reg) => (
                  <RegistrationRow
                    key={reg.id}
                    reg={reg}
                    expanded={expandedId === reg.id}
                    onToggle={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RegistrationRow({
  reg,
  expanded,
  onToggle,
}: {
  reg: Registration;
  expanded: boolean;
  onToggle: () => void;
}) {
  const date = reg.training_date
    ? new Date(reg.training_date + 'T00:00:00').toLocaleDateString('de-DE')
    : '—';

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 text-gray-400">
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
          {reg.training_name}
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{date}</td>
        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
          {reg.contact_first_name} {reg.contact_last_name}
          {reg.company_name && (
            <span className="ml-1 text-xs text-gray-400">({reg.company_name})</span>
          )}
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{reg.contact_email}</td>
        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
          {reg.attendee_count}
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[reg.status] || 'bg-gray-100 text-gray-700'}`}
          >
            {reg.status}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 capitalize">
          {reg.payment_method?.replace('_', ' ')}
        </td>
        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
          {reg.total
            ? `${reg.currency === 'EUR' ? '€' : reg.currency} ${Number(reg.total).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
            : '—'}
        </td>
      </tr>
      {expanded && reg.attendees.length > 0 && (
        <tr>
          <td colSpan={9} className="px-0 py-0">
            <div className="bg-gray-50 dark:bg-gray-900/50 px-8 py-3 border-t border-gray-200 dark:border-gray-700">
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
                  {reg.attendees.map((att) => (
                    <tr key={att.id} className="text-gray-700 dark:text-gray-300">
                      <td className="py-1 pr-4">
                        {att.first_name} {att.last_name}
                      </td>
                      <td className="py-1 pr-4">{att.email}</td>
                      <td className="py-1 pr-4 capitalize">
                        {att.exam_mode && att.exam_mode !== 'none' ? att.exam_mode : '—'}
                      </td>
                      <td className="py-1 pr-4">{att.exam_language || '—'}</td>
                      <td className="py-1">{att.extra_time ? 'Yes' : '—'}</td>
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
