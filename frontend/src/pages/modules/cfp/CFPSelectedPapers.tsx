import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import type { Paper, PaperStatus } from '../../../types';
import PaperStatusLifeline from '../../../components/PaperStatusLifeline';
import RichTextDisplay from '../../../components/common/RichTextDisplay';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { parseApiError } from '../../../utils/apiError';
import { PAPER_STATUS_COLORS, LEVEL_LABELS } from '../../../config/statusColors';
import ReviewsPanel from './ReviewsPanel';

interface PaperListResponse {
  items: Paper[];
  total: number;
}

function SelectedPaperCard({
  paper,
  onToggle,
  toggleLabel,
}: {
  paper: Paper;
  onToggle: (paper: Paper) => void;
  toggleLabel: 'accept' | 'reject';
}) {
  const [expanded, setExpanded] = useState(false);
  const displayStatus = paper.display_status || paper.status;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div
        className="px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {paper.title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  PAPER_STATUS_COLORS[paper.status] ||
                  'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                {paper.status === 'final_consideration' ? 'Final Consideration' : paper.status}
              </span>
              {paper.session_type_name && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                  {paper.session_type_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span>
                Speaker:{' '}
                {paper.main_speaker
                  ? `${paper.main_speaker.first_name} ${paper.main_speaker.last_name}`
                  : 'Unknown'}
              </span>
              {paper.cfp_title && <span>CFP: {paper.cfp_title}</span>}
            </div>
            {paper.topics.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {paper.topics.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-primary-50 text-primary-700"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 w-48">
            <PaperStatusLifeline status={displayStatus} compact />
          </div>
          <div className="flex-shrink-0">
            {toggleLabel === 'accept' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(paper);
                }}
                className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                title="Accept paper"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                  />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(paper);
                }}
                className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                title="Reject paper"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a3.5 3.5 0 003.5 3.5h.792a.91.91 0 00.904-.905c0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-6h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
                  />
                </svg>
              </button>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 space-y-4 bg-gray-50 dark:bg-gray-900">
          {paper.level && (
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                Level
              </h4>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {LEVEL_LABELS[paper.level] || paper.level}
              </p>
            </div>
          )}

          {paper.abstract_short && (
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                Short Abstract
              </h4>
              <RichTextDisplay
                content={paper.abstract_short}
                className="text-sm text-gray-700 dark:text-gray-300"
              />
            </div>
          )}

          {paper.abstract_long && (
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                Detailed Abstract
              </h4>
              <RichTextDisplay
                content={paper.abstract_long}
                className="text-sm text-gray-700 dark:text-gray-300"
              />
            </div>
          )}

          {paper.cospeakers.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                Co-speakers
              </h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                {paper.cospeakers.map((cs) => (
                  <li key={cs.applicant.id}>
                    {`${cs.applicant.first_name} ${cs.applicant.last_name}`} ({cs.applicant.email})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-gray-300 dark:border-gray-600 my-4" />
          <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-2">
            Reviews
          </h4>
          <ReviewsPanel paperId={paper.id} maxReviewScore={paper.max_review_score} />
        </div>
      )}
    </div>
  );
}

interface CFPSelectedPapersProps {
  /** When set, shows only that status without sub-tab switcher. */
  filter?: 'accepted' | 'rejected';
}

export default function CFPSelectedPapers({ filter }: CFPSelectedPapersProps = {}) {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    paper: Paper;
    action: 'accepted' | 'rejected';
  } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const statusToFetch = filter ?? 'accepted';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cfp-selected-papers', statusToFetch, conferenceId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('status', statusToFetch);
      if (conferenceId) params.append('conference_id', conferenceId);
      const response = await api.get<PaperListResponse>(`/cfp/papers?${params.toString()}`);
      return response.data;
    },
    refetchInterval: 15000,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ paperId, status }: { paperId: string; status: PaperStatus }) => {
      const response = await api.put<Paper>(`/cfp/papers/${paperId}`, { status });
      return response.data;
    },
    onSuccess: () => {
      setMutationError(null);
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-selected-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
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

  const handleConfirm = () => {
    if (confirmAction) {
      statusMutation.mutate({
        paperId: confirmAction.paper.id,
        status: confirmAction.action,
      });
    }
  };

  const papers = data?.items ?? [];

  // In accepted view, the toggle action is "reject"; in rejected view, it's "accept"
  const toggleAction: 'accepted' | 'rejected' = filter === 'rejected' ? 'accepted' : 'rejected';
  const toggleLabel: 'accept' | 'reject' = filter === 'rejected' ? 'accept' : 'reject';

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

  const title = filter === 'rejected' ? 'Rejected Papers' : 'Accepted Papers';
  const emptyMessage =
    filter === 'rejected'
      ? 'Papers will appear here once they are rejected from the Evaluated Papers tab.'
      : 'Papers will appear here once they are accepted from the Evaluated Papers tab.';

  const emptyIconPath =
    filter === 'rejected'
      ? 'M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a3.5 3.5 0 003.5 3.5h.792a.91.91 0 00.904-.905c0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-6h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5'
      : 'M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5';

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {filter === 'rejected'
              ? `Papers rejected by the program committee (${papers.length} total)`
              : `Papers accepted by the program committee (${papers.length} total)`}
          </p>
        </div>
      </div>

      {mutationError && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{mutationError}</p>
        </div>
      )}

      {isLoading ? (
        <div className="mt-6">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <div className="mt-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
            Failed to load {statusToFetch} papers
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
              d={emptyIconPath}
            />
          </svg>
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            No {statusToFetch} papers
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <>
          {papers.length > 5 && (
            <div className="mt-4">
              <input
                type="text"
                placeholder="Search papers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          )}
          <div className="mt-4 space-y-3">
            {filteredPapers.map((paper) => (
              <SelectedPaperCard
                key={paper.id}
                paper={paper}
                toggleLabel={toggleLabel}
                onToggle={(p) => setConfirmAction({ paper: p, action: toggleAction })}
              />
            ))}
            {filteredPapers.length === 0 && searchQuery && (
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
