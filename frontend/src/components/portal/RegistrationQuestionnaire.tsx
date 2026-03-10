/**
 * Registration Questionnaire — shown as a gate in the portal.
 *
 * Blocks portal access until all mandatory questions are answered.
 * Renders one conference's questions at a time.
 */
import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { useToast } from '../Toast';
import { parseApiError } from '../../utils/apiError';
import ConferenceLogo from '../ConferenceLogo';

interface PendingQuestion {
  id: string;
  text: string;
  type: 'checkbox' | 'text' | 'radio';
  required: boolean;
  options: string[];
}

interface ConferencePending {
  conference_id: string;
  conference_name: string;
  questions: PendingQuestion[];
  has_mandatory_pending: boolean;
}

interface RegistrationQuestionnaireProps {
  conference: ConferencePending;
  tenantLogoUrl?: string | null;
  onComplete: () => void;
}

export default function RegistrationQuestionnaire({
  conference,
  tenantLogoUrl,
  onComplete,
}: RegistrationQuestionnaireProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Answers state: question_id -> answer_value
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of conference.questions) {
      if (q.type === 'checkbox') {
        initial[q.id] = 'false';
      } else {
        initial[q.id] = '';
      }
    }
    return initial;
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const updateAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const submitMutation = useMutation({
    mutationFn: async (submittedAnswers: { question_id: string; answer_value: string }[]) => {
      const res = await portalApi.post(
        `/portal/conferences/${conference.conference_id}/registration-questions/answers`,
        { answers: submittedAnswers }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-pending-questions'] });
      showToast('Answers submitted successfully', 'success');
      onComplete();
    },
    onError: (err) => {
      showToast(parseApiError(err, 'Failed to submit answers'), 'error');
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Validate mandatory questions
      const errors: Record<string, string> = {};
      for (const q of conference.questions) {
        if (q.required) {
          const val = answers[q.id];
          if (q.type === 'checkbox' && val !== 'true') {
            errors[q.id] = 'This field is required';
          } else if (q.type === 'text' && !val.trim()) {
            errors[q.id] = 'This field is required';
          } else if (q.type === 'radio' && !val) {
            errors[q.id] = 'Please select an option';
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }

      // Build answer list (include all answered questions, skip empty optional ones)
      const answerList = conference.questions
        .filter((q) => {
          const val = answers[q.id];
          if (q.required) return true;
          if (q.type === 'checkbox') return val === 'true';
          return val.trim() !== '';
        })
        .map((q) => ({
          question_id: q.id,
          answer_value: answers[q.id],
        }));

      // Must have at least the mandatory ones
      if (answerList.length === 0) {
        // If there are no mandatory questions and user didn't answer any optional ones, just complete
        onComplete();
        return;
      }

      submitMutation.mutate(answerList);
    },
    [answers, conference, onComplete, submitMutation]
  );

  const canSkip = !conference.has_mandatory_pending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-6">
          {tenantLogoUrl && (
            <div className="h-12 mx-auto mb-3 flex items-center justify-center">
              <ConferenceLogo
                logoUrl={tenantLogoUrl}
                alt={conference.conference_name}
                className="max-h-12 object-contain"
                apiInstance={portalApi}
                showPlaceholder={false}
              />
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Registration Questions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {conference.conference_name}
          </p>
          {conference.has_mandatory_pending && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Questions marked with * are mandatory and must be answered to access the portal.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5"
        >
          {conference.questions.map((q) => (
            <div key={q.id}>
              {q.type === 'checkbox' ? (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={answers[q.id] === 'true'}
                    onChange={(e) => updateAnswer(q.id, e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {q.text}
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                </label>
              ) : q.type === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {q.text}
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="text"
                    value={answers[q.id]}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              ) : q.type === 'radio' ? (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {q.text}
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </p>
                  <div className="space-y-2 pl-1">
                    {q.options.map((option) => (
                      <label key={option} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={q.id}
                          value={option}
                          checked={answers[q.id] === option}
                          onChange={() => updateAnswer(q.id, option)}
                          className="border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              {validationErrors[q.id] && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {validationErrors[q.id]}
                </p>
              )}
            </div>
          ))}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit Answers'}
            </button>
            {canSkip && (
              <button
                type="button"
                onClick={onComplete}
                className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 py-1"
              >
                Skip for now
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
