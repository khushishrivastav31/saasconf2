import { useState } from 'react';
import { useNavigate } from 'react-router';
import api from '../../../config/api';
import type { Paper, PaperFormField } from '../../../types';
import PaperStatusLifeline from '../../../components/PaperStatusLifeline';
import RichTextDisplay from '../../../components/common/RichTextDisplay';
import VideoAttachmentLink from '../../../components/VideoAttachmentLink';
import MediaPreviewModal from '../../../components/MediaPreviewModal';
import { PAPER_STATUS_COLORS, LEVEL_LABELS } from '../../../config/statusColors';
import { useAuthMedia } from '../../../hooks/useAuthMedia';
import { downloadViaApi } from '../../../utils/downloadFile';
import { getAverageScore } from '../../../utils/paperScore';
import EditTemplateButton from './EditTemplateButton';
import ReviewsPanel from './ReviewsPanel';

function CustomFieldAnswer({ field, value }: { field: PaperFormField; value: unknown }) {
  if (field.field_type === 'file_upload') {
    const file = value as { attachment_id?: string; filename?: string };
    if (!file.filename) return null;
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{file.filename}</span>
        {file.attachment_id && (
          <button
            type="button"
            onClick={() =>
              downloadViaApi(api, `/attachments/${file.attachment_id}/download`, file.filename!)
            }
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            Download
          </button>
        )}
      </div>
    );
  }

  if (field.field_type === 'richtext') {
    return (
      <RichTextDisplay
        content={String(value)}
        className="text-sm text-gray-700 dark:text-gray-300"
      />
    );
  }

  if (field.field_type === 'checkbox') {
    return <p className="text-sm text-gray-900 dark:text-gray-100">{value ? 'Yes' : 'No'}</p>;
  }

  if (field.field_type === 'dropdown') {
    const label = field.options?.find((o) => o.value === value)?.label ?? String(value);
    return <p className="text-sm text-gray-900 dark:text-gray-100">{label}</p>;
  }

  if (field.field_type === 'checkbox_group') {
    const values = Array.isArray(value) ? value : [];
    const labels = values.map((v) => field.options?.find((o) => o.value === v)?.label ?? String(v));
    return <p className="text-sm text-gray-900 dark:text-gray-100">{labels.join(', ')}</p>;
  }

  return (
    <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{String(value)}</p>
  );
}

export default function EvaluatedPaperCard({
  paper,
  customFields,
  conferenceId,
  onAccept,
  onReject,
}: {
  paper: Paper;
  customFields: PaperFormField[];
  conferenceId?: string;
  onAccept: (paper: Paper) => void;
  onReject: (paper: Paper) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const displayStatus = paper.display_status || paper.status;
  const videoSrc = useAuthMedia(paper.video_url ?? null);
  const [mediaPreview, setMediaPreview] = useState<{ open: boolean; src: string | null }>({
    open: false,
    src: null,
  });

  const goToTemplate = (templateType: 'paper_acceptance' | 'paper_rejection') => {
    if (!conferenceId) return;
    navigate(
      `/modules/conferences/${conferenceId}?tab=settings&subtab=email-templates&templateType=${templateType}`
    );
  };

  return (
    <>
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
                {paper.must_have_count > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {paper.must_have_count} must-have
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
              {paper.review_summaries &&
                paper.review_summaries.length > 0 &&
                (() => {
                  const avgScore = getAverageScore(paper);
                  const maxScore = paper.max_review_score;
                  const maxSuffix = maxScore != null ? ` / ${maxScore.toFixed(1)}` : '';
                  return (
                    <div className="mt-2 space-y-1">
                      {paper.review_summaries.map((rev, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
                            {rev.reviewer_first_name
                              ? `${rev.reviewer_first_name} ${rev.reviewer_last_name || ''}`.trim()
                              : 'Anonymous'}
                          </span>
                          {rev.total_score != null && (
                            <span className="font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                              {rev.total_score.toFixed(1)}
                              {maxSuffix}
                            </span>
                          )}
                        </div>
                      ))}
                      {avgScore != null && (
                        <div className="flex items-center gap-2 text-xs pt-1 border-t border-gray-100 dark:border-gray-700">
                          <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
                            Avg. Score
                          </span>
                          <span className="font-bold text-primary-800 bg-primary-100 px-1.5 py-0.5 rounded">
                            {avgScore.toFixed(1)}
                            {maxSuffix}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
            <div className="flex-shrink-0 w-48">
              <PaperStatusLifeline status={displayStatus} compact />
            </div>
            <div className="flex-shrink-0 flex items-center gap-1">
              {/* Accept (thumbs up) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept(paper);
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
              {/* Edit the acceptance email template */}
              {conferenceId && (
                <EditTemplateButton
                  hoverColorClass="hover:text-green-600 hover:bg-green-50"
                  title="Edit acceptance email template"
                  onClick={() => goToTemplate('paper_acceptance')}
                />
              )}
              {/* Reject (thumbs down) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(paper);
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
              {/* Edit the rejection email template */}
              {conferenceId && (
                <EditTemplateButton
                  hoverColorClass="hover:text-red-600 hover:bg-red-50"
                  title="Edit rejection email template"
                  onClick={() => goToTemplate('paper_rejection')}
                />
              )}
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
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
                <VideoAttachmentLink
                  videoSrc={videoSrc}
                  onPreview={() => {
                    if (videoSrc) setMediaPreview({ open: true, src: videoSrc });
                  }}
                />
              </div>
            )}

            {customFields.map((field) => {
              const value = paper.custom_field_answers?.[field.field_key];
              if (value == null || value === '') return null;
              return (
                <div key={field.id}>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-1">
                    {field.label}
                  </h4>
                  <CustomFieldAnswer field={field} value={value} />
                </div>
              );
            })}

            {/* Internal comments from reviewers */}
            {paper.review_summaries.some((r) => r.internal_comment) && (
              <div>
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-2">
                  Internal Comments
                </h4>
                <div className="space-y-2">
                  {paper.review_summaries
                    .filter((r) => r.internal_comment)
                    .map((rev, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 px-3 py-2"
                      >
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {rev.reviewer_first_name
                            ? `${rev.reviewer_first_name} ${rev.reviewer_last_name || ''}`.trim()
                            : 'Anonymous'}
                        </span>
                        <RichTextDisplay
                          content={rev.internal_comment}
                          className="text-sm text-gray-600 dark:text-gray-300 mt-0.5"
                        />
                      </div>
                    ))}
                </div>
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
                      {`${cs.applicant.first_name} ${cs.applicant.last_name}`} ({cs.applicant.email}
                      )
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
