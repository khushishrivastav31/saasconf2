import { useState, useEffect } from "react";
import type {
  ReviewQuestion,
  ReviewQuestionCreate,
  ReviewScoreScale,
} from "../../../../../types";
import Modal from "../../../../../components/Modal";
import { ErrorBanner } from "../../../../../components/common/ErrorBanner";
import ModalFooter from "../../../../../components/common/ModalFooter";

export default function QuestionModal({
  open,
  question,
  scales,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean;
  question: ReviewQuestion | null;
  scales: ReviewScoreScale[];
  onClose: () => void;
  onSubmit: (data: ReviewQuestionCreate) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [formData, setFormData] = useState<ReviewQuestionCreate>({
    text: question?.text || "",
    help_text: question?.help_text || "",
    question_type: question?.question_type || "scored",
    score_scale_id: question?.score_scale_id || "",
    weight: question?.weight ?? 1,
    comment_requirement: question?.comment_requirement || "optional",
    low_score_threshold: question?.low_score_threshold ?? undefined,
    show_to_reviewers: question?.show_to_reviewers ?? true,
    count_in_score: question?.count_in_score ?? true,
    display_order: question?.display_order ?? 0,
    is_active: question?.is_active ?? true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        text: question?.text || "",
        help_text: question?.help_text || "",
        question_type: question?.question_type || "scored",
        score_scale_id: question?.score_scale_id || "",
        weight: question?.weight ?? 1,
        comment_requirement: question?.comment_requirement || "optional",
        low_score_threshold: question?.low_score_threshold ?? undefined,
        show_to_reviewers: question?.show_to_reviewers ?? true,
        count_in_score: question?.count_in_score ?? true,
        display_order: question?.display_order ?? 0,
        is_active: question?.is_active ?? true,
      });
    }
  }, [open, question]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: ReviewQuestionCreate = {
      ...formData,
      score_scale_id: formData.score_scale_id || undefined,
      help_text: formData.help_text || undefined,
      low_score_threshold:
        formData.comment_requirement === "required_if_low_score"
          ? formData.low_score_threshold
          : undefined,
    };
    onSubmit(submitData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={question ? "Edit Question" : "Add Question"}
      size="max-w-2xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          <ErrorBanner message={error} />

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Text *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.text}
              onChange={(e) =>
                setFormData({ ...formData, text: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Help Text
            </label>
            <textarea
              rows={2}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.help_text || ""}
              onChange={(e) =>
                setFormData({ ...formData, help_text: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Question Type
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.question_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    question_type: e.target.value as "scored" | "non_scored",
                  })
                }
              >
                <option value="scored">Scored</option>
                <option value="non_scored">Non-Scored</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Score Scale
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.score_scale_id || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    score_scale_id: e.target.value,
                  })
                }
              >
                <option value="">None</option>
                {scales.map((scale) => (
                  <option key={scale.id} value={scale.id}>
                    {scale.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Weight
              </label>
              <input
                type="number"
                min={0}
                step="any"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.weight ?? 1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    weight: Number(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Display Order
              </label>
              <input
                type="number"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.display_order ?? 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    display_order: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Comment Requirement
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.comment_requirement}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  comment_requirement: e.target.value as
                    | "optional"
                    | "required"
                    | "required_if_low_score",
                })
              }
            >
              <option value="optional">Optional</option>
              <option value="required">Required</option>
              <option value="required_if_low_score">
                Required if Low Score
              </option>
            </select>
          </div>

          {formData.comment_requirement === "required_if_low_score" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Low Score Threshold
              </label>
              <input
                type="number"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.low_score_threshold ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    low_score_threshold:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                Scores at or below this value will require a comment
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center">
              <input
                id="question-show-reviewers"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={formData.show_to_reviewers ?? true}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    show_to_reviewers: e.target.checked,
                  })
                }
              />
              <label
                htmlFor="question-show-reviewers"
                className="ml-2 block text-sm text-gray-900"
              >
                Show to Reviewers
              </label>
            </div>

            <div className="flex items-center">
              <input
                id="question-count-score"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={formData.count_in_score ?? true}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    count_in_score: e.target.checked,
                  })
                }
              />
              <label
                htmlFor="question-count-score"
                className="ml-2 block text-sm text-gray-900"
              >
                Count in Score
              </label>
            </div>

            <div className="flex items-center">
              <input
                id="question-active"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={formData.is_active ?? true}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    is_active: e.target.checked,
                  })
                }
              />
              <label
                htmlFor="question-active"
                className="ml-2 block text-sm text-gray-900"
              >
                Active
              </label>
            </div>
          </div>
        </div>

        <ModalFooter onCancel={onClose} isLoading={isLoading} />
      </form>
    </Modal>
  );
}
