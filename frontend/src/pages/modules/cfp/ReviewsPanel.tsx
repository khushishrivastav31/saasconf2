import { useQuery } from "@tanstack/react-query";
import api from "../../../config/api";
import { formatDateTime } from "../../../utils/formatDate";

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
  answers: ReviewAnswer[];
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewListResponse {
  items: AdminReview[];
  total: number;
}

export default function ReviewsPanel({ paperId }: { paperId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["paper-reviews", paperId],
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

  const reviews = data?.items ?? [];

  if (reviews.length === 0) {
    return <p className="text-sm text-gray-500 py-2">No reviews submitted yet.</p>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <div key={review.id} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {review.reviewer_first_name ? `${review.reviewer_first_name} ${review.reviewer_last_name || ""}`.trim() : "Anonymous Reviewer"}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  review.status === "submitted"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {review.status}
              </span>
            </div>
            {review.total_score != null && (
              <span className="text-sm font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                Score: {review.total_score.toFixed(1)}
              </span>
            )}
          </div>

          {review.answers.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {review.answers.map((answer) => (
                <div key={answer.id} className="text-xs text-gray-600">
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-gray-700 min-w-0 flex-1">
                      {answer.snapshot_question_text || "Question"}
                    </span>
                    <span className="flex-shrink-0 text-gray-900 font-medium">
                      {answer.is_unsure
                        ? "Unsure"
                        : answer.snapshot_option_label || (answer.numeric_score != null ? `${answer.numeric_score}` : "—")}
                    </span>
                  </div>
                  {answer.comment && (
                    <p className="text-gray-500 mt-0.5 ml-2 italic">{answer.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {review.speaker_feedback && (
            <div className="mt-3 pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-700">Speaker Feedback</p>
              <p className="text-xs text-gray-600 mt-0.5">{review.speaker_feedback}</p>
            </div>
          )}

          {review.internal_comment && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-700">Internal Comment</p>
              <p className="text-xs text-gray-600 mt-0.5">{review.internal_comment}</p>
            </div>
          )}

          {review.submitted_at && (
            <p className="text-[10px] text-gray-400 mt-2">
              Submitted {formatDateTime(review.submitted_at)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
