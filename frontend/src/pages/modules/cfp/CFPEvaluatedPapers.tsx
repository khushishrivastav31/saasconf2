import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import type { Paper, PaperFormSchema, PaperStatus } from '../../../types';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { parseApiError } from '../../../utils/apiError';
import { getAverageScore } from '../../../utils/paperScore';
import EvaluatedPaperCard from './EvaluatedPaperCard';

interface PaperListResponse {
  items: Paper[];
  total: number;
}

type SortOption =
  | 'none'
  | 'session_type_asc'
  | 'session_type_desc'
  | 'avg_score_desc'
  | 'avg_score_asc';

function compareAvgScore(a: Paper, b: Paper, ascending: boolean): number {
  const scoreA = getAverageScore(a);
  const scoreB = getAverageScore(b);
  if (scoreA == null && scoreB == null) return 0;
  if (scoreA == null) return 1;
  if (scoreB == null) return -1;
  return ascending ? scoreA - scoreB : scoreB - scoreA;
}

export default function CFPEvaluatedPapers() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('none');
  const [confirmAction, setConfirmAction] = useState<{
    paper: Paper;
    action: 'accepted' | 'rejected';
  } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cfp-evaluated-papers', conferenceId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('status', 'final_consideration');
      if (conferenceId) params.append('conference_id', conferenceId);
      const response = await api.get<PaperListResponse>(`/cfp/papers?${params.toString()}`);
      return response.data;
    },
    refetchInterval: 15000,
  });

  const { data: formSchema } = useQuery({
    queryKey: ['paper-form-schema', conferenceId],
    queryFn: async () => {
      const response = await api.get<PaperFormSchema>(
        `/conferences/${conferenceId}/paper-form-schema`
      );
      return response.data;
    },
    enabled: !!conferenceId,
    staleTime: 60_000,
  });

  const customFields = useMemo(
    () =>
      (formSchema?.fields ?? [])
        .filter((f) => f.is_visible)
        .sort((a, b) => a.display_order - b.display_order),
    [formSchema]
  );

  const statusMutation = useMutation({
    mutationFn: async ({ paperId, status }: { paperId: string; status: PaperStatus }) => {
      const response = await api.put<Paper>(`/cfp/papers/${paperId}`, { status });
      return response.data;
    },
    onSuccess: () => {
      setMutationError(null);
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-selected-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-papers'] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['paper-reviews'] });
    },
    onError: (err: unknown) => {
      setMutationError(parseApiError(err, 'Failed to update paper status'));
      setConfirmAction(null);
    },
  });

  const papers = data?.items ?? [];

  const filteredPapers = papers.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.main_speaker?.first_name || '').toLowerCase().includes(q) ||
      (p.main_speaker?.last_name || '').toLowerCase().includes(q) ||
      (p.session_type_name || '').toLowerCase().includes(q) ||
      p.cospeakers.some(
        (c) =>
          c.applicant.first_name.toLowerCase().includes(q) ||
          c.applicant.last_name.toLowerCase().includes(q)
      )
    );
  });

  const sortedPapers = useMemo(() => {
    if (sortOption === 'none') return filteredPapers;
    const sorted = [...filteredPapers];
    if (sortOption === 'session_type_asc' || sortOption === 'session_type_desc') {
      const dir = sortOption === 'session_type_asc' ? 1 : -1;
      sorted.sort(
        (a, b) => dir * (a.session_type_name || '').localeCompare(b.session_type_name || '')
      );
    } else {
      const ascending = sortOption === 'avg_score_asc';
      sorted.sort((a, b) => compareAvgScore(a, b, ascending));
    }
    return sorted;
  }, [filteredPapers, sortOption]);

  const handleConfirm = () => {
    if (confirmAction) {
      statusMutation.mutate({
        paperId: confirmAction.paper.id,
        status: confirmAction.action,
      });
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Evaluated Papers</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Papers that have been evaluated by the program committee ({papers.length} total)
          </p>
        </div>
      </div>

      {mutationError && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{mutationError}</p>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <div className="mt-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
            Failed to load evaluated papers
          </h3>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'An unknown error occurred'}
          </p>
        </div>
      ) : papers.length === 0 ? (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            No evaluated papers
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Papers will appear here once all assigned reviewers have submitted their evaluations.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {papers.length > 5 && (
              <input
                type="text"
                placeholder="Search papers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
            {papers.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                Sort by
                <select
                  aria-label="Sort by"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="none">Default order</option>
                  <option value="session_type_asc">Session Type (A–Z)</option>
                  <option value="session_type_desc">Session Type (Z–A)</option>
                  <option value="avg_score_desc">Avg. Score (High–Low)</option>
                  <option value="avg_score_asc">Avg. Score (Low–High)</option>
                </select>
              </label>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {sortedPapers.map((paper) => (
              <EvaluatedPaperCard
                key={paper.id}
                paper={paper}
                customFields={customFields}
                onAccept={(p) => setConfirmAction({ paper: p, action: 'accepted' })}
                onReject={(p) => setConfirmAction({ paper: p, action: 'rejected' })}
              />
            ))}
            {sortedPapers.length === 0 && searchQuery && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No papers match your search.
              </p>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.action === 'accepted' ? 'Accept Paper' : 'Reject Paper'}
        message={`Are you sure you want to ${confirmAction?.action === 'accepted' ? 'accept' : 'reject'} "${confirmAction?.paper.title ?? ''}"?`}
        confirmLabel={confirmAction?.action === 'accepted' ? 'Accept' : 'Reject'}
        variant={confirmAction?.action === 'accepted' ? 'warning' : 'danger'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
