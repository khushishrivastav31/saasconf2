import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import portalApi from "../../config/portalApi";
import type {
  PortalReviewConfig,
  PortalReviewCriterion,
  PortalReviewQuestion,
  PortalReviewSubmitRequest,
} from "../../types/portal";
import RichTextDisplay from "../../components/common/RichTextDisplay";
import RichTextEditor from "../../components/common/RichTextEditor";
import { parseApiError } from "../../utils/apiError";

interface ReviewFormProps {
  assignmentId: string;
  onReviewSubmitted?: () => void;
}

interface AnswerState {
  selected_option_id: string | null;
  comment: string;
}

export default function ReviewForm({ assignmentId, onReviewSubmitted }: ReviewFormProps) {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    isError,
    error,
  } = useQuery<PortalReviewConfig>({
    queryKey: ["portal-review-config", assignmentId],
    queryFn: async () => {
      const res = await portalApi.get<PortalReviewConfig>(
        `/portal/assignments/${assignmentId}/review-config`
      );
      return res.data;
    },
  });

  const [answers, setAnswers] = useState<Map<string, AnswerState>>(new Map());
  const [speakerFeedback, setSpeakerFeedback] = useState<string>("");
  const [internalComment, setInternalComment] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form state from existing review or empty defaults
  useEffect(() => {
    if (!config) return;

    const initial = new Map<string, AnswerState>();

    // Collect all question IDs from criteria
    for (const criterion of config.criteria) {
      for (const question of criterion.questions) {
        initial.set(question.id, {
          selected_option_id: null,
          comment: "",
        });
      }
    }

    // Overlay existing review answers if present
    if (config.existing_review) {
      for (const ans of config.existing_review.answers) {
        initial.set(ans.question_id, {
          selected_option_id: ans.selected_option_id ?? null,
          comment: ans.comment ?? "",
        });
      }
      setSpeakerFeedback(config.existing_review.speaker_feedback ?? "");
      setInternalComment(config.existing_review.internal_comment ?? "");
    } else {
      setSpeakerFeedback("");
      setInternalComment("");
    }

    setAnswers(initial);
  }, [config]);

  const updateAnswer = useCallback(
    (questionId: string, patch: Partial<AnswerState>) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        const current = next.get(questionId) ?? { selected_option_id: null, comment: "" };
        next.set(questionId, { ...current, ...patch });
        return next;
      });
    },
    []
  );

  const buildRequestBody = useCallback((): PortalReviewSubmitRequest => {
    const answerList: PortalReviewSubmitRequest["answers"] = [];
    for (const [questionId, state] of answers.entries()) {
      answerList.push({
        question_id: questionId,
        selected_option_id: state.selected_option_id || null,
        comment: state.comment || null,
      });
    }
    return {
      answers: answerList,
      speaker_feedback: speakerFeedback || null,
      internal_comment: internalComment || null,
    };
  }, [answers, speakerFeedback, internalComment]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const body = buildRequestBody();
      await portalApi.post(
        `/portal/assignments/${assignmentId}/review?submit=false`,
        body
      );
    },
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["portal-review-config", assignmentId] });
      onReviewSubmitted?.();
    },
    onError: (err: unknown) => {
      setFormError(parseApiError(err, "Failed to save draft. Please try again."));
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body = buildRequestBody();
      await portalApi.post(
        `/portal/assignments/${assignmentId}/review?submit=true`,
        body
      );
    },
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["portal-review-config", assignmentId] });
      onReviewSubmitted?.();
    },
    onError: (err: unknown) => {
      setFormError(parseApiError(err, "Failed to submit review. Please try again."));
    },
  });

  const isSubmitting = saveDraftMutation.isPending || submitMutation.isPending;
  const isReadOnly = config?.existing_review?.status === "submitted";

  // Sort criteria by display_order
  const sortedCriteria = useMemo(() => {
    if (!config) return [];
    return [...config.criteria].sort((a, b) => a.display_order - b.display_order);
  }, [config]);

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  // --- Error state ---
  if (isError) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700">
          {parseApiError(error, "Failed to load review configuration.")}
        </p>
      </div>
    );
  }

  // --- No criteria ---
  if (!config || config.criteria.length === 0) {
    return (
      <div className="rounded-md bg-gray-50 border border-gray-200 p-4 text-center">
        <p className="text-sm text-gray-500">No review criteria configured for this paper.</p>
      </div>
    );
  }

  // --- Read-only (submitted) mode ---
  if (isReadOnly && config.existing_review) {
    const existingReview = config.existing_review;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            Submitted
          </span>
          {existingReview.submitted_at && (
            <span className="text-xs text-gray-500">
              Submitted on {new Date(existingReview.submitted_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {sortedCriteria.map((criterion) => (
          <ReadOnlyCriterionSection
            key={criterion.id}
            criterion={criterion}
            answers={existingReview.answers}
          />
        ))}

        {config.form_settings.enable_speaker_feedback && existingReview.speaker_feedback && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Feedback for the speaker(s)
            </h3>
            <RichTextDisplay
              content={existingReview.speaker_feedback}
              className="text-sm text-gray-700"
            />
          </div>
        )}

        {config.form_settings.enable_internal_comment && existingReview.internal_comment && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Internal Comment
            </h3>
            <RichTextDisplay
              content={existingReview.internal_comment}
              className="text-sm text-gray-700"
            />
          </div>
        )}
      </div>
    );
  }

  // --- Editable form ---
  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-gray-900">Review</h3>

      {sortedCriteria.map((criterion) => (
        <EditableCriterionSection
          key={criterion.id}
          criterion={criterion}
          answers={answers}
          onUpdateAnswer={updateAnswer}
        />
      ))}

      {/* Speaker Feedback */}
      {config.form_settings.enable_speaker_feedback && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Feedback for the speaker(s)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            This feedback will be shared anonymously with the speaker(s) when the CFP is completed.
          </p>
          <RichTextEditor
            value={speakerFeedback}
            onChange={setSpeakerFeedback}
            placeholder="Provide constructive feedback for the speaker(s)..."
            rows={4}
            maxLength={2000}
          />
        </div>
      )}

      {/* Internal Comment */}
      {config.form_settings.enable_internal_comment && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Internal Comment
          </label>
          <p className="text-xs text-gray-500 mb-2">
            This comment is only visible to the conference team and will not be shared with the speaker(s).
          </p>
          <RichTextEditor
            value={internalComment}
            onChange={setInternalComment}
            placeholder="Leave an internal note for the conference team..."
            rows={4}
            maxLength={2000}
          />
        </div>
      )}

      {/* Error message */}
      {formError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{formError}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => saveDraftMutation.mutate()}
          disabled={isSubmitting}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saveDraftMutation.isPending ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2" />
              Saving...
            </>
          ) : (
            "Save Draft"
          )}
        </button>
        <button
          type="button"
          onClick={() => submitMutation.mutate()}
          disabled={isSubmitting}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitMutation.isPending ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Submitting...
            </>
          ) : (
            "Submit Review"
          )}
        </button>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function EditableCriterionSection({
  criterion,
  answers,
  onUpdateAnswer,
}: {
  criterion: PortalReviewCriterion;
  answers: Map<string, AnswerState>;
  onUpdateAnswer: (questionId: string, patch: Partial<AnswerState>) => void;
}) {
  const sortedQuestions = useMemo(
    () => [...criterion.questions].sort((a, b) => a.display_order - b.display_order),
    [criterion.questions]
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{criterion.title}</h3>
        {criterion.description && (
          <RichTextDisplay content={criterion.description} className="text-sm text-gray-600 mt-1" />
        )}
      </div>

      {sortedQuestions.map((question) => (
        <EditableQuestion
          key={question.id}
          question={question}
          answer={answers.get(question.id) ?? { selected_option_id: null, comment: "" }}
          onUpdate={(patch) => onUpdateAnswer(question.id, patch)}
        />
      ))}
    </div>
  );
}

function EditableQuestion({
  question,
  answer,
  onUpdate,
}: {
  question: PortalReviewQuestion;
  answer: AnswerState;
  onUpdate: (patch: Partial<AnswerState>) => void;
}) {
  const sortedOptions = useMemo(() => {
    if (!question.scale?.options) return [];
    return [...question.scale.options].sort((a, b) => a.display_order - b.display_order);
  }, [question.scale]);

  const commentLabel = "Comment (optional)";

  const showComment =
    question.comment_requirement === "required" ||
    question.comment_requirement === "optional" ||
    question.comment_requirement === "required_if_low_score";

  return (
    <div className="pl-3 border-l-2 border-gray-200 space-y-2">
      <label className="block text-sm font-medium text-gray-800">
        {question.text}
      </label>
      {question.help_text && (
        <p className="text-xs text-gray-500">{question.help_text}</p>
      )}

      {/* Scale options (radio buttons) */}
      {question.scale && sortedOptions.length > 0 && (
        <div className="space-y-1.5 mt-1">
          {sortedOptions.map((option) => (
            <label
              key={option.id}
              className={`flex items-center gap-2 text-sm cursor-pointer ${
                option.is_unsure ? "italic text-gray-500" : "text-gray-700"
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.id}
                checked={answer.selected_option_id === option.id}
                onChange={() => onUpdate({ selected_option_id: option.id })}
                className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              <span>
                {option.label}
                {option.numeric_value !== null && (
                  <span className="text-gray-400 ml-1">({option.numeric_value})</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Comment textarea */}
      {showComment && (
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {commentLabel}
          </label>
          <textarea
            value={answer.comment}
            onChange={(e) => onUpdate({ comment: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Add your comment..."
          />
        </div>
      )}
    </div>
  );
}

function ReadOnlyCriterionSection({
  criterion,
  answers,
}: {
  criterion: PortalReviewCriterion;
  answers: { question_id: string; selected_option_id: string | null; comment: string | null }[];
}) {
  const sortedQuestions = useMemo(
    () => [...criterion.questions].sort((a, b) => a.display_order - b.display_order),
    [criterion.questions]
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{criterion.title}</h3>
        {criterion.description && (
          <RichTextDisplay content={criterion.description} className="text-sm text-gray-600 mt-1" />
        )}
      </div>

      {sortedQuestions.map((question) => {
        const answer = answers.find((a) => a.question_id === question.id);
        return (
          <ReadOnlyQuestion key={question.id} question={question} answer={answer ?? null} />
        );
      })}
    </div>
  );
}

function ReadOnlyQuestion({
  question,
  answer,
}: {
  question: PortalReviewQuestion;
  answer: { question_id: string; selected_option_id: string | null; comment: string | null } | null;
}) {
  const sortedOptions = useMemo(() => {
    if (!question.scale?.options) return [];
    return [...question.scale.options].sort((a, b) => a.display_order - b.display_order);
  }, [question.scale]);

  return (
    <div className="pl-3 border-l-2 border-gray-200 space-y-2">
      <p className="text-sm font-medium text-gray-800">{question.text}</p>
      {question.help_text && (
        <p className="text-xs text-gray-500">{question.help_text}</p>
      )}

      {/* Display selected option highlighted */}
      {question.scale && sortedOptions.length > 0 && (
        <div className="space-y-1 mt-1">
          {sortedOptions.map((option) => {
            const isSelected = answer?.selected_option_id === option.id;
            return (
              <div
                key={option.id}
                className={`flex items-center gap-2 text-sm px-2 py-1 rounded ${
                  isSelected
                    ? "bg-primary-50 text-primary-800 font-medium"
                    : option.is_unsure
                      ? "italic text-gray-400"
                      : "text-gray-400"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                    isSelected
                      ? "border-primary-600 bg-primary-600"
                      : "border-gray-300"
                  }`}
                />
                <span>
                  {option.label}
                  {option.numeric_value !== null && (
                    <span className="ml-1">({option.numeric_value})</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Comment as plain text */}
      {answer?.comment && (
        <div className="mt-1">
          <p className="text-xs font-medium text-gray-500 mb-0.5">Comment</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{answer.comment}</p>
        </div>
      )}
    </div>
  );
}
