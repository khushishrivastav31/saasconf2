import { useState } from 'react';
import { useAuthMedia } from '../../../../hooks/useAuthMedia';
import type { Paper, PaperAssignment } from '../../../../types';
import { PAPER_STATUS_COLORS, LEVEL_LABELS } from '../../../../config/statusColors';
import Modal from '../../../../components/Modal';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';
import MediaPreviewModal from '../../../../components/MediaPreviewModal';

// ─── Paper Detail Modal ──────────────────────────────────────────────────────

export function PaperDetailModal({
  paper,
  assignments,
  isAnonymous,
  reviewersPerPaper,
  onClose,
}: {
  paper: Paper | null;
  assignments: PaperAssignment[];
  isAnonymous: boolean;
  reviewersPerPaper: number;
  onClose: () => void;
}) {
  const videoSrc = useAuthMedia(paper?.video_url ?? null);
  const [mediaPreview, setMediaPreview] = useState<{ open: boolean; src: string | null }>({
    open: false,
    src: null,
  });

  if (!paper) return null;

  return (
    <>
      <Modal open onClose={onClose} title="Paper Details" size="max-w-3xl">
        <div className="px-6 py-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Title & Status */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {paper.title}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${PAPER_STATUS_COLORS[paper.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
              >
                {paper.status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Speaker (hidden if anonymous review) */}
          {!isAnonymous && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Speaker
              </h4>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {`${paper.main_speaker?.first_name ?? ''} ${paper.main_speaker?.last_name ?? ''}`.trim() ||
                  'Unknown'}
                {paper.main_speaker?.email && (
                  <span className="text-gray-500 dark:text-gray-400 font-normal ml-2">
                    {paper.main_speaker.email}
                  </span>
                )}
              </p>
              {paper.cospeakers && paper.cospeakers.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Co-speakers</p>
                  <div className="flex flex-wrap gap-2">
                    {paper.cospeakers.map((cs, idx) => (
                      <span
                        key={cs.applicant?.id || idx}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        {`${cs.applicant?.first_name ?? ''} ${cs.applicant?.last_name ?? ''}`.trim() ||
                          cs.applicant?.email ||
                          'Unknown'}
                        {cs.invitation_status === 'pending' && (
                          <span className="ml-1.5 text-yellow-600 text-[10px]">(pending)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meta row: Session type, Level, Topics */}
          <div className="flex flex-wrap gap-4 text-sm">
            {paper.session_type_name && (
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Session Type
                </span>
                <p className="text-gray-900 dark:text-gray-100 mt-0.5">
                  {paper.session_type_name}
                  {paper.session_type_duration && (
                    <span className="text-gray-400 dark:text-gray-500 ml-1">
                      ({paper.session_type_duration} min)
                    </span>
                  )}
                </p>
              </div>
            )}
            {paper.level && (
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Level
                </span>
                <p className="text-gray-900 dark:text-gray-100 mt-0.5">
                  {LEVEL_LABELS[paper.level] || paper.level}
                </p>
              </div>
            )}
          </div>

          {/* Topics */}
          {paper.topics && paper.topics.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Topics
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {paper.topics.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Short Abstract */}
          {paper.abstract_short && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Short Abstract
              </h4>
              <RichTextDisplay
                content={paper.abstract_short}
                className="text-sm text-gray-700 dark:text-gray-300"
              />
            </div>
          )}

          {/* Long Abstract */}
          {paper.abstract_long && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Long Abstract
              </h4>
              <RichTextDisplay
                content={paper.abstract_long}
                className="text-sm text-gray-700 dark:text-gray-300"
              />
            </div>
          )}

          {/* Learning Objectives */}
          {paper.learning_objectives && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Learning Objectives
              </h4>
              <RichTextDisplay
                content={paper.learning_objectives}
                className="text-sm text-gray-700 dark:text-gray-300"
              />
            </div>
          )}

          {/* Video */}
          {paper.video_url && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Video
              </h4>
              <button
                type="button"
                onClick={() => {
                  if (videoSrc) setMediaPreview({ open: true, src: videoSrc });
                }}
                disabled={!videoSrc}
                className={`w-32 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-900 relative ${
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
                          className="w-4 h-4 text-gray-700 dark:text-gray-300 ml-0.5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400 dark:border-gray-500" />
                  </div>
                )}
              </button>
            </div>
          )}

          {/* Assigned Reviewers */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Assigned Reviewers
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                ({assignments.length}/{reviewersPerPaper})
              </span>
            </h4>
            {assignments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {assignments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200"
                  >
                    {`${a.committee_member_first_name} ${a.committee_member_last_name}`.trim()}
                    {a.is_anonymous && (
                      <span className="px-1 rounded text-[9px] bg-yellow-100 text-yellow-700">
                        anon
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                No reviewers assigned yet.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </Modal>

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
