import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import type { PortalAssignedPaperListResponse, PortalAssignedPaper } from '../../types/portal';
import RichTextDisplay from '../../components/common/RichTextDisplay';
import MediaPreviewModal from '../../components/MediaPreviewModal';
import ReviewForm from '../../components/portal/ReviewForm';
import { PAPER_STATUS_COLORS, LEVEL_LABELS } from '../../config/statusColors';
import { usePortalAuthMedia } from '../../hooks/usePortalAuthMedia';

function PaperCard({
  paper,
  onReviewSubmitted,
}: {
  paper: PortalAssignedPaper;
  onReviewSubmitted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const videoSrc = usePortalAuthMedia(paper.video_url ?? null);
  const [mediaPreview, setMediaPreview] = useState<{ open: boolean; src: string | null }>({
    open: false,
    src: null,
  });

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div
          className="px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
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
                  {paper.status}
                </span>
                {paper.review_status && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      paper.review_status === 'submitted'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : paper.review_status === 'draft'
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                          : ''
                    }`}
                  >
                    {paper.review_status === 'submitted'
                      ? 'Review: Submitted'
                      : paper.review_status === 'draft'
                        ? 'Review: Draft'
                        : ''}
                  </span>
                )}
                {paper.is_anonymous && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                    Anonymous
                  </span>
                )}
                {paper.session_type_name && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {paper.session_type_name}
                  </span>
                )}
              </div>
              {!paper.is_anonymous && (
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    Speaker:{' '}
                    {`${paper.main_speaker_first_name || ''} ${paper.main_speaker_last_name || ''}`.trim() ||
                      'Unknown'}
                  </span>
                  {paper.cfp_title && <span>CFP: {paper.cfp_title}</span>}
                </div>
              )}
              {paper.is_anonymous && paper.cfp_title && (
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>CFP: {paper.cfp_title}</span>
                </div>
              )}
              {paper.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {paper.topics.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary-50 text-primary-700"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
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

            {paper.learning_objectives && (
              <div>
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                  Learning Objectives
                </h4>
                <RichTextDisplay
                  content={paper.learning_objectives}
                  className="text-sm text-gray-700 dark:text-gray-300"
                />
              </div>
            )}

            {paper.video_url && (
              <div>
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                  Video
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    if (videoSrc) setMediaPreview({ open: true, src: videoSrc });
                  }}
                  disabled={!videoSrc}
                  className={`w-32 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-100 dark:bg-gray-800 relative ${
                    videoSrc
                      ? 'cursor-pointer hover:border-primary-400 hover:shadow-md transition-all'
                      : ''
                  }`}
                  title={videoSrc ? 'Click to play video' : 'Loading video...'}
                >
                  {videoSrc ? (
                    <>
                      <video
                        src={videoSrc}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-gray-700 ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400" />
                    </div>
                  )}
                </button>
              </div>
            )}

            {!paper.is_anonymous && paper.cospeakers.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                  Co-speakers
                </h4>
                <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  {paper.cospeakers.map((cs) => (
                    <li key={cs.applicant_id}>
                      {`${cs.first_name || ''} ${cs.last_name || ''}`.trim()} ({cs.email})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-gray-300 dark:border-gray-600 my-4" />
            <ReviewForm assignmentId={paper.assignment_id} onReviewSubmitted={onReviewSubmitted} />
          </div>
        )}
      </div>

      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ open: false, src: null })}
        src={mediaPreview.src}
        type="video"
        alt="Paper video"
      />
    </>
  );
}

export default function AssignedPapersTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['portal-assigned-papers'],
    queryFn: async () => {
      const res = await portalApi.get<PortalAssignedPaperListResponse>('/portal/assigned-papers');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const papers = (data?.items ?? []).filter((p) => p.review_status !== 'submitted');

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
        <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
          No assigned papers
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You don&apos;t have any papers assigned for review yet.
        </p>
      </div>
    );
  }

  // Group by conference
  const grouped = new Map<string, { name: string; papers: PortalAssignedPaper[] }>();
  for (const paper of papers) {
    const key = paper.conference_id || '__none__';
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: paper.conference_name || 'Other',
        papers: [],
      });
    }
    grouped.get(key)!.papers.push(paper);
  }

  const groups = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Assigned Papers</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Papers assigned to you for review ({papers.length} total)
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.name}>
          {groups.length > 1 && (
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {group.name}
            </h3>
          )}
          <div className="space-y-3">
            {group.papers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                onReviewSubmitted={() => {
                  queryClient.invalidateQueries({ queryKey: ['portal-assigned-papers'] });
                  queryClient.invalidateQueries({ queryKey: ['portal-pending-assignments'] });
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
