import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useIsAdmin } from '../../../../hooks/useIsAdmin';
import type { Paper, PaperCreate, PaperUpdate, PaperLevel, PaperStatus } from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import { CloseIcon } from '../../../ConferenceDetail/icons';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import PaperStatusLifeline from '../../../../components/PaperStatusLifeline';
import { PaperForm } from './PaperForm';
import type { PaperFormData } from './PaperForm';

interface PaperListResponse {
  items: Paper[];
  total: number;
  page: number;
  page_size: number;
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Row in the papers list view
// ---------------------------------------------------------------------------

function PaperListRow({ paper, onClick }: { paper: Paper; onClick: () => void }) {
  const displayStatus = paper.display_status || paper.status;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left border-b border-gray-100 dark:border-gray-700 last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {paper.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {paper.main_speaker
            ? `${paper.main_speaker.first_name} ${paper.main_speaker.last_name}`
            : 'No speaker assigned'}
          {paper.cospeakers.length > 0 && (
            <span className="text-gray-400 dark:text-gray-500">
              {' '}
              + {paper.cospeakers.length} co-speaker{paper.cospeakers.length > 1 ? 's' : ''}
              {paper.cospeakers.some((c) => c.invitation_status === 'pending') && (
                <span className="text-amber-500"> (pending)</span>
              )}
            </span>
          )}
        </p>
        {paper.session_type_name && (
          <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
            {paper.session_type_name}
          </span>
        )}
      </div>
      <div className="flex-shrink-0 w-48">
        <PaperStatusLifeline status={displayStatus} compact />
      </div>
      <svg
        className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CFPPapersProps {
  isAdmin?: boolean;
}

export default function CFPPapers({ isAdmin: isAdminProp }: CFPPapersProps = {}) {
  const isAdminFallback = useIsAdmin();
  const isAdmin = isAdminProp ?? isAdminFallback;
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const queryClient = useQueryClient();
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Paper | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{
    paper: Paper;
    action: 'accepted' | 'rejected' | 'draft';
  } | null>(null);

  // Debounce search input (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  // Reset page when status filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cfp-papers', conferenceId, page, PAGE_SIZE, debouncedSearch, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (conferenceId) params.append('conference_id', conferenceId);
      params.append('page', String(page));
      params.append('page_size', String(PAGE_SIZE));
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
      if (statusFilter) params.append('status', statusFilter);
      const response = await api.get<PaperListResponse>(`/cfp/papers?${params.toString()}`);
      return response.data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });

  const uploadVideo = useCallback(
    async (paperId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('entity_type', 'paper_video');
      form.append('entity_id', paperId);
      form.append('description', 'Paper video');
      await api.post('/attachments', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
    },
    [queryClient]
  );

  const createMutation = useMutation({
    mutationFn: async (data: PaperFormData) => {
      const payload: PaperCreate = {
        cfp_id: data.cfp_id,
        main_speaker_id: data.main_speaker_id,
        title: data.title,
      };
      if (data.co_speaker_ids.length > 0) payload.co_speaker_ids = data.co_speaker_ids;
      if (data.session_type_id) payload.session_type_id = data.session_type_id;
      if (data.topic_ids.length > 0) payload.topic_ids = data.topic_ids;
      if (data.abstract_short.trim()) payload.abstract_short = data.abstract_short;
      if (data.abstract_long.trim()) payload.abstract_long = data.abstract_long;
      if (data.level) payload.level = data.level as PaperLevel;
      if (data.learning_objectives.trim()) payload.learning_objectives = data.learning_objectives;

      const response = await api.post<Paper>('/cfp/papers', payload);
      return response.data;
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create paper'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PaperFormData }) => {
      const payload: PaperUpdate = {
        main_speaker_id: data.main_speaker_id,
        co_speaker_ids: data.co_speaker_ids,
        session_type_id: data.session_type_id || null,
        topic_ids: data.topic_ids,
        title: data.title,
        abstract_short: data.abstract_short,
        abstract_long: data.abstract_long,
        level: data.level ? (data.level as PaperLevel) : undefined,
        learning_objectives: data.learning_objectives,
      };

      const response = await api.put<Paper>(`/cfp/papers/${id}`, payload);
      return response.data;
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update paper'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cfp/papers/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      setSelectedPaperId(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-selected-papers'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['paper-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete paper'));
      setDeleteTarget(null);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<Paper>(`/cfp/papers/${id}/submit`);
      return response.data;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-selected-papers'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to submit paper'));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ paperId, status }: { paperId: string; status: PaperStatus }) => {
      const response = await api.put<Paper>(`/cfp/papers/${paperId}`, { status });
      return response.data;
    },
    onSuccess: () => {
      setError(null);
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-selected-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['paper-reviews'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update paper status'));
      setConfirmAction(null);
    },
  });

  const handleStatusConfirm = () => {
    if (confirmAction) {
      statusMutation.mutate({
        paperId: confirmAction.paper.id,
        status: confirmAction.action,
      });
    }
  };

  const handleCreate = async (formData: PaperFormData, videoFile: File | null) => {
    try {
      const paper = await createMutation.mutateAsync(formData);
      if (videoFile) {
        try {
          await uploadVideo(paper.id, videoFile);
        } catch {
          // non-fatal
        }
      }
      setError(null);
      setIsAdding(false);
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-selected-papers'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
      setSelectedPaperId(paper.id);
    } catch {
      // error is handled by onError
    }
  };

  const handleUpdate = async (formData: PaperFormData, videoFile: File | null) => {
    if (!selectedPaperId) return;
    try {
      const paper = await updateMutation.mutateAsync({ id: selectedPaperId, data: formData });
      if (videoFile) {
        try {
          await uploadVideo(paper.id, videoFile);
        } catch {
          // non-fatal
        }
      }
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-selected-papers'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
    } catch {
      // error is handled by onError
    }
  };

  const handleSubmitPaper = async () => {
    if (!selectedPaperId) return;
    try {
      await submitMutation.mutateAsync(selectedPaperId);
    } catch {
      // error is handled by onError
    }
  };

  const papers = useMemo(() => data?.items || [], [data?.items]);
  const totalPapers = data?.total ?? 0;
  const totalPages = Math.ceil(totalPapers / PAGE_SIZE);
  const selectedPaper = papers.find((p) => p.id === selectedPaperId);

  // Fallback: extract cfp_id from existing papers (in case the CFP list query fails)
  const fallbackCfpId = useMemo(() => papers[0]?.cfp_id || '', [papers]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isAdding ? 'New Paper' : selectedPaper ? selectedPaper.title : 'Papers'}
            {!isAdding && !selectedPaper && totalPapers > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {totalPapers}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isAdding
              ? 'Fill in the details to create a new paper submission.'
              : selectedPaper
                ? 'View and edit the paper details below.'
                : 'Manage paper submissions for your CFPs.'}
          </p>
        </div>
        {isAdmin && !isAdding && !selectedPaper && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setSelectedPaperId(null);
              setError(null);
            }}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Paper
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isAdding && isAdmin ? (
        <PaperForm
          paper={null}
          conferenceId={conferenceId || ''}
          fallbackCfpId={fallbackCfpId}
          onSave={handleCreate}
          onCancel={() => {
            setIsAdding(false);
            setError(null);
          }}
          isSaving={createMutation.isPending}
          error={error}
        />
      ) : selectedPaper ? (
        <PaperForm
          paper={selectedPaper}
          conferenceId={conferenceId || ''}
          onSave={isAdmin ? handleUpdate : () => {}}
          onCancel={() => {
            setSelectedPaperId(null);
            setError(null);
          }}
          onDelete={isAdmin ? () => setDeleteTarget(selectedPaper) : undefined}
          onSubmit={isAdmin && selectedPaper.status === 'draft' ? handleSubmitPaper : undefined}
          onUnsubmit={
            isAdmin && selectedPaper.status !== 'draft'
              ? () => setConfirmAction({ paper: selectedPaper, action: 'draft' })
              : undefined
          }
          onAccept={
            isAdmin && selectedPaper.status !== 'accepted'
              ? () => setConfirmAction({ paper: selectedPaper, action: 'accepted' })
              : undefined
          }
          onReject={
            isAdmin && selectedPaper.status !== 'rejected'
              ? () => setConfirmAction({ paper: selectedPaper, action: 'rejected' })
              : undefined
          }
          isSaving={updateMutation.isPending}
          isDeleting={deleteMutation.isPending}
          isSubmitting={submitMutation.isPending}
          isUnsubmitting={statusMutation.isPending && confirmAction?.action === 'draft'}
          isAccepting={statusMutation.isPending && confirmAction?.action === 'accepted'}
          isRejecting={statusMutation.isPending && confirmAction?.action === 'rejected'}
          error={error}
        />
      ) : (
        <div className="space-y-3">
          {/* Search + Status Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or speaker name..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="in_evaluation">In Evaluation</option>
              <option value="evaluated">Evaluated</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Loading indicator for background refetch */}
          {isFetching && !isLoading && (
            <div className="text-xs text-gray-400 dark:text-gray-500 text-right">Loading...</div>
          )}

          {/* List */}
          {papers.length > 0 ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {papers.map((p) => (
                <PaperListRow key={p.id} paper={p} onClick={() => setSelectedPaperId(p.id)} />
              ))}
            </div>
          ) : debouncedSearch || statusFilter ? (
            <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              No papers match your filters
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              No papers yet. Click "+ Add Paper" to get started.
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, totalPapers)}{' '}
                of {totalPapers}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Paper"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Status Change Confirmation */}
      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.action === 'accepted'
            ? 'Accept Paper'
            : confirmAction?.action === 'rejected'
              ? 'Reject Paper'
              : 'Revert to Draft'
        }
        message={
          confirmAction?.action === 'draft'
            ? `Are you sure you want to revert "${confirmAction?.paper.title ?? ''}" to draft? All reviewer assignments and reviews for this paper will be permanently deleted.`
            : `Are you sure you want to ${confirmAction?.action === 'accepted' ? 'accept' : 'reject'} "${confirmAction?.paper.title ?? ''}"?`
        }
        confirmLabel={
          confirmAction?.action === 'accepted'
            ? 'Accept'
            : confirmAction?.action === 'rejected'
              ? 'Reject'
              : 'Revert'
        }
        variant={confirmAction?.action === 'rejected' ? 'danger' : 'warning'}
        onConfirm={handleStatusConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
