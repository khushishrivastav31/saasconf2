import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type {
  Conference,
  ReviewCriterion,
  ReviewCriterionCreate,
  ReviewCriterionUpdate,
  ReviewFormSettings,
  ReviewFormSettingsUpdate,
  ReviewQuestion,
  ReviewQuestionCreate,
  ReviewQuestionUpdate,
  ReviewScoreScale,
} from '../../../../../types';
import { parseApiError } from '../../../../../utils/apiError';
import ConfirmDialog from '../../../../../components/ConfirmDialog';
import { ErrorBanner, SuccessBanner } from '../../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../../components/common/LoadingSpinner';
import CriterionCard from './CriterionCard';
import CriterionModal from './CriterionModal';
import QuestionModal from './QuestionModal';

// --- Review Criteria Tab -----------------------------------------------------

function ConferenceReviewCriteriaTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();

  // Criteria state
  const [isCriterionModalOpen, setIsCriterionModalOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<ReviewCriterion | null>(null);
  const [deleteCriterionTarget, setDeleteCriterionTarget] = useState<ReviewCriterion | null>(null);

  // Question state
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ReviewQuestion | null>(null);
  const [questionCriterionId, setQuestionCriterionId] = useState<string | null>(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<{
    criterionId: string;
    question: ReviewQuestion;
  } | null>(null);

  // Expanded criteria
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // --- Queries ---------------------------------------------------------------

  const {
    data: criteriaData,
    isLoading: isCriteriaLoading,
    isError: isCriteriaError,
    error: criteriaError,
  } = useQuery({
    queryKey: queryKeys.settings.reviewCriteria(conference.id),
    queryFn: async () => {
      const response = await api.get<{ items: ReviewCriterion[]; total: number }>(
        `/conferences/${conference.id}/settings/review-criteria`
      );
      return response.data;
    },
  });

  const { data: scalesData } = useQuery({
    queryKey: queryKeys.settings.scoreScales(conference.id),
    queryFn: async () => {
      const response = await api.get<{ items: ReviewScoreScale[]; total: number }>(
        `/conferences/${conference.id}/settings/score-scales`
      );
      return response.data;
    },
  });

  const { data: formSettings } = useQuery({
    queryKey: queryKeys.settings.reviewFormSettings(conference.id),
    queryFn: async () => {
      const response = await api.get<ReviewFormSettings>(
        `/conferences/${conference.id}/settings/review-form-settings`
      );
      return response.data;
    },
  });

  const updateFormSettingsMutation = useMutation({
    mutationFn: async (data: ReviewFormSettingsUpdate) => {
      const response = await api.put<ReviewFormSettings>(
        `/conferences/${conference.id}/settings/review-form-settings`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.reviewFormSettings(conference.id),
      });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  // --- Criterion Mutations ---------------------------------------------------

  const createCriterionMutation = useMutation({
    mutationFn: async (data: ReviewCriterionCreate) => {
      const response = await api.post<ReviewCriterion>(
        `/conferences/${conference.id}/settings/review-criteria`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.reviewCriteria(conference.id),
      });
      setIsCriterionModalOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const updateCriterionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReviewCriterionUpdate }) => {
      const response = await api.put<ReviewCriterion>(
        `/conferences/${conference.id}/settings/review-criteria/${id}`,
        data
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.reviewCriteria(conference.id),
      });
      setEditingCriterion(null);
      setIsCriterionModalOpen(false);
      setError(null);
      const msg =
        variables.data.is_active !== undefined
          ? `Criterion ${variables.data.is_active ? 'activated' : 'deactivated'} successfully`
          : 'Criterion updated successfully';
      setSuccessMessage(msg);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const deleteCriterionMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/settings/review-criteria/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.reviewCriteria(conference.id),
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  // --- Question Mutations ----------------------------------------------------

  const createQuestionMutation = useMutation({
    mutationFn: async ({
      criterionId,
      data,
    }: {
      criterionId: string;
      data: ReviewQuestionCreate;
    }) => {
      const response = await api.post<ReviewQuestion>(
        `/conferences/${conference.id}/settings/review-criteria/${criterionId}/questions`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.reviewCriteria(conference.id),
      });
      setIsQuestionModalOpen(false);
      setQuestionCriterionId(null);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({
      criterionId,
      questionId,
      data,
    }: {
      criterionId: string;
      questionId: string;
      data: ReviewQuestionUpdate;
    }) => {
      const response = await api.put<ReviewQuestion>(
        `/conferences/${conference.id}/settings/review-criteria/${criterionId}/questions/${questionId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.reviewCriteria(conference.id),
      });
      setEditingQuestion(null);
      setIsQuestionModalOpen(false);
      setQuestionCriterionId(null);
      setError(null);
      const msg =
        variables.data.is_active !== undefined
          ? `Question ${variables.data.is_active ? 'activated' : 'deactivated'} successfully`
          : 'Question updated successfully';
      setSuccessMessage(msg);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async ({
      criterionId,
      questionId,
    }: {
      criterionId: string;
      questionId: string;
    }) => {
      await api.delete(
        `/conferences/${conference.id}/settings/review-criteria/${criterionId}/questions/${questionId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.reviewCriteria(conference.id),
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  // --- Handlers --------------------------------------------------------------

  const toggleExpand = (id: string) => {
    setExpandedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEditCriterion = (criterion: ReviewCriterion) => {
    setEditingCriterion(criterion);
    setIsCriterionModalOpen(true);
    setError(null);
  };

  const handleDeleteCriterion = (criterion: ReviewCriterion) => {
    setDeleteCriterionTarget(criterion);
  };

  const handleCloseCriterionModal = () => {
    setIsCriterionModalOpen(false);
    setEditingCriterion(null);
    setError(null);
  };

  const handleSubmitCriterion = (formData: ReviewCriterionCreate) => {
    if (editingCriterion) {
      updateCriterionMutation.mutate({
        id: editingCriterion.id,
        data: formData,
      });
    } else {
      createCriterionMutation.mutate(formData);
    }
  };

  const handleAddQuestion = (criterionId: string) => {
    setQuestionCriterionId(criterionId);
    setEditingQuestion(null);
    setIsQuestionModalOpen(true);
    setError(null);
  };

  const handleEditQuestion = (criterionId: string, question: ReviewQuestion) => {
    setQuestionCriterionId(criterionId);
    setEditingQuestion(question);
    setIsQuestionModalOpen(true);
    setError(null);
  };

  const handleDeleteQuestion = (criterionId: string, question: ReviewQuestion) => {
    setDeleteQuestionTarget({ criterionId, question });
  };

  const handleToggleCriterionActive = (criterionId: string, active: boolean) => {
    updateCriterionMutation.mutate({
      id: criterionId,
      data: { is_active: active },
    });
  };

  const handleToggleQuestionActive = (criterionId: string, questionId: string, active: boolean) => {
    updateQuestionMutation.mutate({
      criterionId,
      questionId,
      data: { is_active: active },
    });
  };

  const handleCloseQuestionModal = () => {
    setIsQuestionModalOpen(false);
    setEditingQuestion(null);
    setQuestionCriterionId(null);
    setError(null);
  };

  const handleSubmitQuestion = (formData: ReviewQuestionCreate) => {
    if (!questionCriterionId) return;
    if (editingQuestion) {
      updateQuestionMutation.mutate({
        criterionId: questionCriterionId,
        questionId: editingQuestion.id,
        data: formData,
      });
    } else {
      createQuestionMutation.mutate({
        criterionId: questionCriterionId,
        data: formData,
      });
    }
  };

  // --- Render ----------------------------------------------------------------

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Review Criteria</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Define review criteria and their associated questions for the proposal review process
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingCriterion(null);
              setIsCriterionModalOpen(true);
              setError(null);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Add Criterion
          </button>
        )}
      </div>

      {/* Review Form Settings */}
      <div className="mb-6 bg-white dark:bg-gray-800 shadow sm:rounded-lg px-6 py-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          Review Form Comment Fields
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Control which comment fields are shown to reviewers in the review form
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
              checked={formSettings?.enable_speaker_feedback ?? true}
              disabled={!isAdmin}
              onChange={(e) =>
                updateFormSettingsMutation.mutate({
                  enable_speaker_feedback: e.target.checked,
                })
              }
            />
            <div>
              <span className="text-sm text-gray-900 dark:text-gray-100">Speaker Feedback</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Reviewers can provide anonymous feedback that will be shared with the speaker(s)
                when the CFP is completed
              </p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
              checked={formSettings?.enable_internal_comment ?? true}
              disabled={!isAdmin}
              onChange={(e) =>
                updateFormSettingsMutation.mutate({
                  enable_internal_comment: e.target.checked,
                })
              }
            />
            <div>
              <span className="text-sm text-gray-900 dark:text-gray-100">Internal Comment</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Reviewers can leave an internal note visible only to the conference team (not shared
                with speakers)
              </p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
              checked={formSettings?.enable_must_have ?? true}
              disabled={!isAdmin}
              onChange={(e) =>
                updateFormSettingsMutation.mutate({
                  enable_must_have: e.target.checked,
                })
              }
            />
            <div>
              <span className="text-sm text-gray-900 dark:text-gray-100">Must Have in Program</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Reviewers can flag a paper as a must-have for the conference program
              </p>
            </div>
          </label>
        </div>
      </div>

      <SuccessBanner message={successMessage} />

      {error && !isCriterionModalOpen && !isQuestionModalOpen && <ErrorBanner message={error} />}

      {isCriteriaLoading ? (
        <LoadingSpinner />
      ) : isCriteriaError ? (
        <ErrorBanner message={`Failed to load review criteria: ${parseApiError(criteriaError)}`} />
      ) : criteriaData?.items.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow sm:rounded-lg px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          No review criteria defined yet. Click &quot;Add Criterion&quot; to create one.
        </div>
      ) : (
        <div className="space-y-4">
          {criteriaData?.items.map((criterion) => (
            <CriterionCard
              key={criterion.id}
              criterion={criterion}
              isExpanded={expandedCriteria.has(criterion.id)}
              isAdmin={isAdmin}
              onToggle={() => toggleExpand(criterion.id)}
              onEdit={() => handleEditCriterion(criterion)}
              onDelete={() => handleDeleteCriterion(criterion)}
              onAddQuestion={() => handleAddQuestion(criterion.id)}
              onEditQuestion={(q) => handleEditQuestion(criterion.id, q)}
              onDeleteQuestion={(q) => handleDeleteQuestion(criterion.id, q)}
              onToggleActive={(active) => handleToggleCriterionActive(criterion.id, active)}
              onToggleQuestionActive={(questionId, active) =>
                handleToggleQuestionActive(criterion.id, questionId, active)
              }
            />
          ))}
        </div>
      )}

      {/* Criterion Modal */}
      <CriterionModal
        open={isCriterionModalOpen}
        criterion={editingCriterion}
        onClose={handleCloseCriterionModal}
        onSubmit={handleSubmitCriterion}
        isLoading={createCriterionMutation.isPending || updateCriterionMutation.isPending}
        error={error}
      />

      {/* Question Modal */}
      <QuestionModal
        open={isQuestionModalOpen}
        question={editingQuestion}
        scales={scalesData?.items || []}
        onClose={handleCloseQuestionModal}
        onSubmit={handleSubmitQuestion}
        isLoading={createQuestionMutation.isPending || updateQuestionMutation.isPending}
        error={error}
      />

      {/* Delete Criterion Confirm */}
      <ConfirmDialog
        open={!!deleteCriterionTarget}
        title="Delete Criterion"
        message={`Are you sure you want to delete "${deleteCriterionTarget?.title}"? All associated questions will also be deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteCriterionTarget) deleteCriterionMutation.mutate(deleteCriterionTarget.id);
          setDeleteCriterionTarget(null);
        }}
        onCancel={() => setDeleteCriterionTarget(null)}
      />

      {/* Delete Question Confirm */}
      <ConfirmDialog
        open={!!deleteQuestionTarget}
        title="Delete Question"
        message={`Are you sure you want to delete the question "${deleteQuestionTarget?.question.text}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteQuestionTarget)
            deleteQuestionMutation.mutate({
              criterionId: deleteQuestionTarget.criterionId,
              questionId: deleteQuestionTarget.question.id,
            });
          setDeleteQuestionTarget(null);
        }}
        onCancel={() => setDeleteQuestionTarget(null)}
      />
    </div>
  );
}

export default ConferenceReviewCriteriaTab;
