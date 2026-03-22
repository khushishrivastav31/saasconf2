import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';
import { parseApiError } from '../../../utils/apiError';
import { useUrlFilters } from '../../../hooks/useUrlFilters';
import type { Conference } from '../../../types';
import Modal from '../../../components/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner, ButtonSpinner } from '../../../components/common/LoadingSpinner';
import { useToast } from '../../../components/Toast';
import { DeleteIcon, SearchIcon } from '../icons';
import { validateEmail } from '../../../utils/validators';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Alumni {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  notes: string | null;
  source: 'manual' | 'import' | 'registration';
  created_at: string;
}

interface AlumniFormData {
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  notes: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface AlumniTabProps {
  conference: Conference;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const SOURCE_BADGES: Record<Alumni['source'], { bg: string; text: string; label: string }> = {
  manual: {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-800 dark:text-gray-200',
    label: 'Manual',
  },
  import: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-800 dark:text-blue-200',
    label: 'Import',
  },
  registration: {
    bg: 'bg-green-100 dark:bg-green-900/40',
    text: 'text-green-800 dark:text-green-200',
    label: 'Registration',
  },
};

const EMPTY_FORM: AlumniFormData = {
  first_name: '',
  last_name: '',
  email: '',
  company: '',
  notes: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AlumniTab({ conference, isAdmin }: AlumniTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // State
  const { search, setSearch, debouncedSearch, page, setPage } = useUrlFilters({
    search: '',
    page: 1,
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Alumni | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Alumni | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [addForm, setAddForm] = useState<AlumniFormData>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<AlumniFormData>(EMPTY_FORM);
  const [showCsvHelp, setShowCsvHelp] = useState(false);
  const [addEmailError, setAddEmailError] = useState<string | null>(null);
  const [editEmailError, setEditEmailError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Queries & Mutations
  // ---------------------------------------------------------------------------

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.alumni.byConference(conference.id), page, debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      const response = await api.get<{ items: Alumni[]; total: number }>(
        `/conferences/${conference.id}/alumni`,
        { params }
      );
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: AlumniFormData) => {
      const response = await api.post<Alumni>(`/conferences/${conference.id}/alumni`, formData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.alumni.byConference(conference.id),
      });
      setIsAddOpen(false);
      setAddForm(EMPTY_FORM);
      setAddEmailError(null);
      setError(null);
      showToast('Alumni added successfully.', 'success');
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to add alumni'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: AlumniFormData }) => {
      const response = await api.put<Alumni>(
        `/conferences/${conference.id}/alumni/${id}`,
        formData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.alumni.byConference(conference.id),
      });
      setEditTarget(null);
      setEditForm(EMPTY_FORM);
      setEditEmailError(null);
      setError(null);
      showToast('Alumni updated successfully.', 'success');
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update alumni'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/alumni/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.alumni.byConference(conference.id),
      });
      setDeleteTarget(null);
      showToast('Alumni deleted.', 'success');
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to delete alumni'), 'error');
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<ImportResult>(
        `/conferences/${conference.id}/alumni/import`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.alumni.byConference(conference.id),
      });
      setImportResult(result);
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to import CSV'), 'error');
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(addForm);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    updateMutation.mutate({ id: editTarget.id, formData: editForm });
  };

  const openEdit = (alumni: Alumni) => {
    setEditTarget(alumni);
    setEditForm({
      first_name: alumni.first_name,
      last_name: alumni.last_name,
      email: alumni.email,
      company: alumni.company || '',
      notes: alumni.notes || '',
    });
    setEditEmailError(null);
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importMutation.mutate(file);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleExport = async () => {
    try {
      const response = await api.get(`/conferences/${conference.id}/alumni/export`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `alumni-${conference.id}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast(parseApiError(err, 'Failed to export CSV'), 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // Pagination helpers
  // ---------------------------------------------------------------------------

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const alumni = data?.items ?? [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading && page === 1 && !debouncedSearch) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Alumni
          {total > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {total}
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Manage alumni for this conference.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or company..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Action buttons */}
        {isAdmin && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => {
                setIsAddOpen(true);
                setAddForm(EMPTY_FORM);
                setAddEmailError(null);
                setError(null);
              }}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 dark:text-primary-300 dark:bg-primary-900/30 dark:border-primary-700 dark:hover:bg-primary-900/50 transition-colors"
            >
              + Add Alumni
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {importMutation.isPending ? 'Importing...' : 'Import CSV'}
            </button>
            <button
              type="button"
              onClick={() => setShowCsvHelp((v) => !v)}
              title="CSV format help"
              className={`inline-flex items-center justify-center w-8 h-8 text-sm font-medium border rounded-md transition-colors ${
                showCsvHelp
                  ? 'text-primary-700 bg-primary-50 border-primary-200 dark:text-primary-300 dark:bg-primary-900/30 dark:border-primary-700'
                  : 'text-gray-500 bg-white border-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700'
              }`}
            >
              ?
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
            >
              Export CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* CSV Format Help */}
      {showCsvHelp && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">CSV Import Format</h3>
          <p className="text-blue-800 dark:text-blue-300 mb-3">
            The CSV file must include a header row. Only the <strong>email</strong> column is
            required. If first/last name is missing, the email prefix is used as first name and
            &ldquo;-&rdquo; as last name.
          </p>

          <div className="overflow-x-auto mb-3">
            <table className="text-xs border-collapse w-full max-w-xl">
              <thead>
                <tr className="border-b border-blue-200 dark:border-blue-700">
                  <th className="text-left py-1 pr-4 font-semibold text-blue-900 dark:text-blue-200">
                    Column
                  </th>
                  <th className="text-left py-1 pr-4 font-semibold text-blue-900 dark:text-blue-200">
                    Required
                  </th>
                  <th className="text-left py-1 font-semibold text-blue-900 dark:text-blue-200">
                    Accepted Headers
                  </th>
                </tr>
              </thead>
              <tbody className="text-blue-800 dark:text-blue-300">
                <tr className="border-b border-blue-100 dark:border-blue-800">
                  <td className="py-1.5 pr-4 font-medium">Email</td>
                  <td className="py-1.5 pr-4">Yes</td>
                  <td className="py-1.5">
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">email</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">e-mail</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">
                      email_address
                    </code>
                  </td>
                </tr>
                <tr className="border-b border-blue-100 dark:border-blue-800">
                  <td className="py-1.5 pr-4 font-medium">First Name</td>
                  <td className="py-1.5 pr-4">No</td>
                  <td className="py-1.5">
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">first_name</code>
                    ,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">firstname</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">first name</code>
                    , <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">vorname</code>
                  </td>
                </tr>
                <tr className="border-b border-blue-100 dark:border-blue-800">
                  <td className="py-1.5 pr-4 font-medium">Last Name</td>
                  <td className="py-1.5 pr-4">No</td>
                  <td className="py-1.5">
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">last_name</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">lastname</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">last name</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">nachname</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">surname</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4 font-medium">Company</td>
                  <td className="py-1.5 pr-4">No</td>
                  <td className="py-1.5">
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">company</code>,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">
                      organization
                    </code>
                    ,{' '}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">
                      organisation
                    </code>
                    , <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">firma</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-blue-100 dark:bg-blue-800/30 rounded p-2.5 font-mono text-xs text-blue-900 dark:text-blue-200">
            <p className="font-semibold mb-1 font-sans">Example CSV:</p>
            email,first_name,last_name,company
            <br />
            john@example.com,John,Doe,Acme Corp
            <br />
            jane@example.com,Jane,Smith,
          </div>

          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
            Duplicate emails (already in this conference) are automatically skipped. Encoding: UTF-8
            recommended.
          </p>
        </div>
      )}

      <ErrorBanner message={error} />

      {/* Table */}
      {alumni.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <svg
            className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            {debouncedSearch ? 'No Results' : 'No Alumni Yet'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            {debouncedSearch
              ? 'No alumni matched your search. Try a different term.'
              : 'Add alumni manually, import from a CSV file, or they will be created automatically from registrations.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
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
                  Source
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date Added
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {alumni.map((a) => {
                const badge = SOURCE_BADGES[a.source] ?? SOURCE_BADGES.manual;
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => openEdit(a)}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {a.first_name} {a.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {a.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {a.company || '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td
                        className="px-4 py-3 text-sm text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(a)}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1 transition-colors"
                          title="Delete"
                          aria-label="Delete"
                        >
                          <DeleteIcon />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Showing {(page - 1) * PAGE_SIZE + 1}&ndash;
            {Math.min(page * PAGE_SIZE, total)} of {total} alumni
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Add Alumni Modal                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setAddEmailError(null);
          setError(null);
        }}
        title="Add Alumni"
        size="max-w-lg"
      >
        <form onSubmit={handleAddSubmit} className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={addForm.first_name}
                onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={addForm.last_name}
                onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={addForm.email}
              onChange={(e) => {
                const value = e.target.value;
                setAddForm({ ...addForm, email: value });
                setAddEmailError(validateEmail(value));
              }}
              onBlur={() => {
                setAddEmailError(validateEmail(addForm.email));
              }}
              className={`w-full px-3 py-2 text-sm border ${addEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500`}
            />
            {addEmailError && <p className="mt-1 text-sm text-red-600">{addEmailError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Company
            </label>
            <input
              type="text"
              value={addForm.company}
              onChange={(e) => setAddForm({ ...addForm, company: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setIsAddOpen(false);
                setAddEmailError(null);
                setError(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !!addEmailError}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? <ButtonSpinner label="Adding..." /> : 'Add Alumni'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Edit Alumni Modal                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={editTarget !== null}
        onClose={() => {
          setEditTarget(null);
          setEditEmailError(null);
          setError(null);
        }}
        title="Edit Alumni"
        size="max-w-lg"
      >
        <form onSubmit={handleEditSubmit} className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={editForm.email}
              onChange={(e) => {
                const value = e.target.value;
                setEditForm({ ...editForm, email: value });
                setEditEmailError(validateEmail(value));
              }}
              onBlur={() => {
                setEditEmailError(validateEmail(editForm.email));
              }}
              className={`w-full px-3 py-2 text-sm border ${editEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500`}
            />
            {editEmailError && <p className="mt-1 text-sm text-red-600">{editEmailError}</p>}
            {editTarget && editForm.email !== editTarget.email && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Changing the email will also update linked registration and portal records.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Company
            </label>
            <input
              type="text"
              value={editForm.company}
              onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setEditTarget(null);
                setEditEmailError(null);
                setError(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending || !!editEmailError}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {updateMutation.isPending ? <ButtonSpinner label="Saving..." /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Import Result Modal                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={importResult !== null}
        onClose={() => setImportResult(null)}
        title="Import Results"
        size="max-w-md"
      >
        {importResult && (
          <div className="px-6 py-4 space-y-3">
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <p>
                <span className="font-medium text-green-700 dark:text-green-400">Imported:</span>{' '}
                {importResult.imported} alumni
              </p>
              <p>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Skipped (duplicates):
                </span>{' '}
                {importResult.skipped}
              </p>
              {importResult.errors.length > 0 && (
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">
                    Errors: {importResult.errors.length}
                  </p>
                  <ul className="mt-1 list-disc list-inside text-xs text-red-600 dark:text-red-400 space-y-0.5">
                    {importResult.errors.slice(0, 10).map((msg, idx) => (
                      <li key={idx}>{msg}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li className="text-gray-500 dark:text-gray-400">
                        ...and {importResult.errors.length - 10} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Delete Confirm Dialog                                               */}
      {/* ------------------------------------------------------------------ */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Alumni"
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.first_name} ${deleteTarget.last_name}? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
