import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import Modal from '../../../components/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { parseApiError } from '../../../utils/apiError';
import { formatDateTime } from '../../../utils/formatDate';
import { queryKeys } from '../../../config/queryKeys';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Deadline {
  id: string;
  tenant_id: string;
  conference_id: string;
  title: string;
  description: string | null;
  due_date: string;
  is_active: boolean;
  reminder_7d_sent: boolean;
  reminder_1d_sent: boolean;
  reminder_due_sent: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DeadlineListResponse {
  items: Deadline[];
  total: number;
}

interface DeadlineFormState {
  title: string;
  description: string;
  due_date: string;
}

type DeadlineStatus = 'overdue' | 'due-soon' | 'active' | 'resolved';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeadlinesTabProps {
  conference: { id: string; name: string };
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyForm: DeadlineFormState = {
  title: '',
  description: '',
  due_date: '',
};

function getDeadlineStatus(deadline: Deadline): DeadlineStatus {
  if (!deadline.is_active) return 'resolved';
  const now = new Date();
  const due = new Date(deadline.due_date);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'due-soon';
  return 'active';
}

function statusBadge(status: DeadlineStatus) {
  switch (status) {
    case 'overdue':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          Overdue
        </span>
      );
    case 'due-soon':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Due soon
        </span>
      );
    case 'active':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Active
        </span>
      );
    case 'resolved':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          Resolved
        </span>
      );
  }
}

function cardBorderClass(status: DeadlineStatus) {
  switch (status) {
    case 'overdue':
      return 'border-l-4 border-l-red-500 dark:border-l-red-400';
    case 'due-soon':
      return 'border-l-4 border-l-amber-500 dark:border-l-amber-400';
    case 'active':
      return 'border-l-4 border-l-blue-500 dark:border-l-blue-400';
    case 'resolved':
      return 'border-l-4 border-l-gray-300 dark:border-l-gray-600';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeadlinesTab({ conference, isAdmin }: DeadlinesTabProps) {
  const queryClient = useQueryClient();
  const conferenceId = conference.id;

  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [form, setForm] = useState<DeadlineFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Deadline | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.deadlines.byConference(conferenceId),
    queryFn: async () => {
      const response = await api.get<DeadlineListResponse>(
        `/conferences/${conferenceId}/deadlines`
      );
      return response.data;
    },
  });

  const deadlines = data?.items ?? [];

  // Sort: active first (overdue > due-soon > active), then resolved
  const sortedDeadlines = [...deadlines].sort((a, b) => {
    const statusOrder: Record<DeadlineStatus, number> = {
      overdue: 0,
      'due-soon': 1,
      active: 2,
      resolved: 3,
    };
    const sa = statusOrder[getDeadlineStatus(a)];
    const sb = statusOrder[getDeadlineStatus(b)];
    if (sa !== sb) return sa - sb;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  // ── Mutations ────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (payload: DeadlineFormState) => {
      await api.post(`/conferences/${conferenceId}/deadlines`, {
        title: payload.title,
        description: payload.description || null,
        due_date: new Date(payload.due_date).toISOString(),
      });
    },
    onSuccess: () => {
      setError(null);
      closeModal();
      queryClient.invalidateQueries({
        queryKey: queryKeys.deadlines.byConference(conferenceId),
      });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create deadline'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: DeadlineFormState }) => {
      await api.put(`/conferences/${conferenceId}/deadlines/${id}`, {
        title: payload.title,
        description: payload.description || null,
        due_date: new Date(payload.due_date).toISOString(),
      });
    },
    onSuccess: () => {
      setError(null);
      closeModal();
      queryClient.invalidateQueries({
        queryKey: queryKeys.deadlines.byConference(conferenceId),
      });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update deadline'));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/conferences/${conferenceId}/deadlines/${id}/toggle`);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.deadlines.byConference(conferenceId),
      });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to toggle deadline'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/deadlines/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.deadlines.byConference(conferenceId),
      });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete deadline'));
    },
  });

  // ── Modal helpers ────────────────────────────────────────────────────

  function openCreate() {
    setEditingDeadline(null);
    setForm(emptyForm);
    setError(null);
    setIsModalOpen(true);
  }

  function openEdit(deadline: Deadline) {
    setEditingDeadline(deadline);
    // Convert ISO date to datetime-local format
    const localDate = new Date(deadline.due_date);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dtLocal = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}T${pad(localDate.getHours())}:${pad(localDate.getMinutes())}`;

    setForm({
      title: deadline.title,
      description: deadline.description || '',
      due_date: dtLocal,
    });
    setError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingDeadline(null);
    setForm(emptyForm);
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.due_date) return;
    if (editingDeadline) {
      updateMutation.mutate({ id: editingDeadline.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Deadlines</h3>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Deadline
          </button>
        )}
      </div>

      {/* Empty state */}
      {sortedDeadlines.length === 0 && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={1.5} />
            <line x1="16" y1="2" x2="16" y2="6" strokeWidth={1.5} />
            <line x1="8" y1="2" x2="8" y2="6" strokeWidth={1.5} />
            <line x1="3" y1="10" x2="21" y2="10" strokeWidth={1.5} />
          </svg>
          <h4 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            No deadlines yet
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isAdmin
              ? 'Create your first deadline to track important dates.'
              : 'No deadlines have been set for this conference.'}
          </p>
        </div>
      )}

      {/* Deadline cards */}
      <div className="space-y-3">
        {sortedDeadlines.map((deadline) => {
          const status = getDeadlineStatus(deadline);
          return (
            <div
              key={deadline.id}
              className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${cardBorderClass(status)} ${status === 'resolved' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4
                      className={`font-medium text-gray-900 dark:text-gray-100 ${status === 'resolved' ? 'line-through' : ''}`}
                    >
                      {deadline.title}
                    </h4>
                    {statusBadge(status)}
                  </div>
                  {deadline.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                      {deadline.description}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    <svg
                      className="inline-block w-4 h-4 mr-1 -mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Due: {formatDateTime(deadline.due_date)}
                  </p>
                </div>

                {/* Action buttons */}
                {isAdmin && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Toggle active/resolved */}
                    <button
                      onClick={() => toggleMutation.mutate(deadline.id)}
                      disabled={toggleMutation.isPending}
                      title={deadline.is_active ? 'Mark as resolved' : 'Reactivate'}
                      className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {deadline.is_active ? (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => openEdit(deadline)}
                      title="Edit"
                      className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(deadline)}
                      title="Delete"
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingDeadline ? 'Edit Deadline' : 'New Deadline'}
      >
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Sponsor contract deadline"
              maxLength={500}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional details about this deadline..."
              rows={3}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Due Date <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={closeModal}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !form.title.trim() ||
              !form.due_date ||
              createMutation.isPending ||
              updateMutation.isPending
            }
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving...'
              : editingDeadline
                ? 'Update'
                : 'Create'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Deadline"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
