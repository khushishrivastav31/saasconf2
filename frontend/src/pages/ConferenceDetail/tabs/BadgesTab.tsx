import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import { useDebouncedValue } from '../../../hooks/useDebounce';
import type { Conference } from '../../../types';

const BADGE_TYPES = [
  { key: 'attendee', label: 'Attendee' },
  { key: 'speaker', label: 'Speaker' },
  { key: 'sponsor', label: 'Sponsor' },
  { key: 'volunteer', label: 'Volunteer' },
  { key: 'committee', label: 'Program Committee' },
  { key: 'organizer', label: 'Organizer' },
] as const;

interface BadgeRegistration {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string | null;
  booking_option: string | null;
  status: string;
}

export default function BadgesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { showToast } = useToast();
  const [badgeType, setBadgeType] = useState('attendee');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const pageSize = 50;

  // Fetch registrations
  const { data, isLoading } = useQuery({
    queryKey: ['badge-registrations', conference.id, page, pageSize, debouncedSearch],
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/badges`, {
        params: { page, page_size: pageSize, search: debouncedSearch },
      });
      return res.data as { items: BadgeRegistration[]; total: number };
    },
  });

  const registrations = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === registrations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(registrations.map((r) => r.id)));
    }
  }, [selectedIds.size, registrations]);

  // Preview badge
  const handlePreview = useCallback(
    async (registrationId: string) => {
      setGeneratingId(registrationId);
      try {
        const res = await api.post(
          `/conferences/${conference.id}/badges/preview/${registrationId}`,
          null,
          { responseType: 'blob', params: { badge_type: badgeType } }
        );
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const reader = new FileReader();
        reader.onloadend = () => setPreviewBlobUrl(reader.result as string);
        reader.readAsDataURL(blob);
      } catch (err: unknown) {
        showToast(parseApiError(err, 'Failed to generate preview'), 'error');
      } finally {
        setGeneratingId(null);
      }
    },
    [conference.id, badgeType, showToast]
  );

  // Download single badge
  const handleDownload = useCallback(
    async (registrationId: string, name: string) => {
      setGeneratingId(registrationId);
      try {
        const res = await api.post(
          `/conferences/${conference.id}/badges/generate/${registrationId}`,
          null,
          { responseType: 'blob', params: { badge_type: badgeType } }
        );
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `badge_${name.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: unknown) {
        showToast(parseApiError(err, 'Failed to download badge'), 'error');
      } finally {
        setGeneratingId(null);
      }
    },
    [conference.id, badgeType, showToast]
  );

  // Bulk download
  const handleBulkDownload = useCallback(
    async (ids?: string[]) => {
      const regIds = ids ?? Array.from(selectedIds);
      if (regIds.length === 0) {
        showToast('No registrations selected', 'warning');
        return;
      }
      setBulkGenerating(true);
      try {
        const res = await api.post(
          `/conferences/${conference.id}/badges/generate-bulk`,
          { registration_ids: regIds, badge_type: badgeType },
          { responseType: 'blob' }
        );
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `badges_bulk_${badgeType}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`${regIds.length} badges generated`, 'success');
      } catch (err: unknown) {
        showToast(parseApiError(err, 'Failed to generate bulk badges'), 'error');
      } finally {
        setBulkGenerating(false);
      }
    },
    [conference.id, badgeType, selectedIds, showToast]
  );

  const statusColor = useMemo(
    () => (status: string) => {
      switch (status) {
        case 'paid':
          return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
        case 'invoiced':
          return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
        case 'cancelled':
          return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
        default:
          return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Badges</h2>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Badge Type Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Badge Type:
          </label>
          <select
            value={badgeType}
            onChange={(e) => setBadgeType(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {BADGE_TYPES.map((bt) => (
              <option key={bt.key} value={bt.key}>
                {bt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div className="flex-1" />

        {/* Bulk Actions */}
        {selectedIds.size > 0 && isAdmin && (
          <button
            onClick={() => handleBulkDownload()}
            disabled={bulkGenerating}
            className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {bulkGenerating
              ? 'Generating...'
              : `Download ${selectedIds.size} Badge${selectedIds.size > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {isAdmin && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={registrations.length > 0 && selectedIds.size === registrations.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Company
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Booking Option
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              {isAdmin && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 5} className="px-4 py-8 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                  </div>
                </td>
              </tr>
            ) : registrations.length === 0 ? (
              <tr>
                <td
                  colSpan={isAdmin ? 7 : 5}
                  className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {debouncedSearch
                    ? 'No registrations match your search.'
                    : 'No registrations found.'}
                </td>
              </tr>
            ) : (
              registrations.map((reg) => (
                <tr
                  key={reg.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(reg.id)}
                        onChange={() => toggleSelect(reg.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {reg.first_name} {reg.last_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {reg.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {reg.company_name || '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {reg.booking_option || '\u2014'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusColor(reg.status)}`}
                    >
                      {reg.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handlePreview(reg.id)}
                          disabled={generatingId === reg.id}
                          title="Preview badge"
                          className="p-1.5 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() =>
                            handleDownload(reg.id, `${reg.first_name}_${reg.last_name}`)
                          }
                          disabled={generatingId === reg.id}
                          title="Download badge PDF"
                          className="p-1.5 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewBlobUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-11/12 h-5/6 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Badge Preview
              </h2>
              <button
                onClick={() => setPreviewBlobUrl(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-4 overflow-hidden">
              <object
                data={previewBlobUrl}
                type="application/pdf"
                className="w-full h-full rounded"
                aria-label="Badge PDF Preview"
              >
                <p className="text-gray-600 dark:text-gray-300">
                  Your browser doesn&apos;t support inline PDF viewing.{' '}
                  <a
                    href={previewBlobUrl}
                    download="badge-preview.pdf"
                    className="text-primary-600 hover:underline"
                  >
                    Download the PDF
                  </a>
                </p>
              </object>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
