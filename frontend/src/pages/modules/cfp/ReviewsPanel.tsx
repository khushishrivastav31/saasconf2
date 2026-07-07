import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../config/api';
import RichTextDisplay from '../../../components/common/RichTextDisplay';
import { formatDateTime } from '../../../utils/formatDate';

interface ReviewAnswer {
  id: string;
  question_id: string;
  selected_option_id: string | null;
  numeric_score: number | null;
  is_unsure: boolean;
  comment: string | null;
  snapshot_weight: number | null;
  snapshot_question_text: string | null;
  snapshot_option_label: string | null;
}

interface AdminReview {
  id: string;
  assignment_id: string;
  paper_id: string;
  committee_member_id: string;
  reviewer_first_name: string | null;
  reviewer_last_name: string | null;
  status: string;
  total_score: number | null;
  speaker_feedback: string | null;
  internal_comment: string | null;
  must_have: boolean;
  answers: ReviewAnswer[];
  submitted_at: string | null;
  last_edited_at: string | null;
  edit_count: number;
  created_at: string;
  updated_at: string;
}

interface ReviewListResponse {
  items: AdminReview[];
  total: number;
}

function CollapsibleReview({
  review,
  maxReviewScore,
}: {
  review: AdminReview;
  maxReviewScore?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const reviewerName = review.reviewer_first_name
    ? `${review.reviewer_first_name} ${review.reviewer_last_name || ''}`.trim()
    : 'Anonymous Reviewer';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {reviewerName}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              review.status === 'submitted'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
            }`}
          >
            {review.status}
          </span>
          {review.must_have && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Must have
            </span>
          )}
          {review.edit_count > 0 && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              title={
                review.last_edited_at
                  ? `Last edited ${formatDateTime(review.last_edited_at)}`
                  : undefined
              }
            >
              Edited{review.edit_count > 1 ? ` (${review.edit_count}×)` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {review.total_score != null && (
            <span className="text-sm font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
              {review.total_score.toFixed(1)}
              {maxReviewScore != null ? ` / ${maxReviewScore.toFixed(1)}` : ''}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
          {review.answers.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {review.answers.map((answer) => (
                <div key={answer.id} className="text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300 min-w-0 flex-1">
                      {answer.snapshot_question_text || 'Question'}
                    </span>
                    <span className="flex-shrink-0 text-gray-900 dark:text-gray-100 font-medium">
                      {answer.is_unsure
                        ? 'Unsure'
                        : answer.snapshot_option_label ||
                          (answer.numeric_score != null ? `${answer.numeric_score}` : '\u2014')}
                    </span>
                  </div>
                  {answer.comment && (
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5 ml-2 italic">
                      {answer.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {review.speaker_feedback && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Speaker Feedback
              </p>
              <RichTextDisplay
                content={review.speaker_feedback}
                className="text-xs text-gray-600 dark:text-gray-300 mt-0.5"
              />
            </div>
          )}

          {review.internal_comment && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Internal Comment
              </p>
              <RichTextDisplay
                content={review.internal_comment}
                className="text-xs text-gray-600 dark:text-gray-300 mt-0.5"
              />
            </div>
          )}

          {review.submitted_at && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
              Submitted {formatDateTime(review.submitted_at)}
              {review.last_edited_at && <> · Last edited {formatDateTime(review.last_edited_at)}</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReviewsPanel({
  paperId,
  maxReviewScore,
}: {
  paperId: string;
  maxReviewScore?: number | null;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['paper-reviews', paperId],
    queryFn: async () => {
      const res = await api.get<ReviewListResponse>(`/cfp/papers/${paperId}/reviews`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-red-600 py-2">
        Failed to load reviews: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  const reviews = data?.items ?? [];

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No reviews submitted yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {reviews.map((review) => (
        <CollapsibleReview key={review.id} review={review} maxReviewScore={maxReviewScore} />
      ))}
    </div>
  );
}
