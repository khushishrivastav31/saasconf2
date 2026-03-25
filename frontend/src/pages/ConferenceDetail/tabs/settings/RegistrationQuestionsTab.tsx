/**
 * Registration Questions Settings Tab (Conference)
 *
 * Manages questions shown to portal users after their first login post-registration.
 * Question types: checkbox, text field, radio buttons, dropdown.
 * Explicit save with unsaved-changes guard. Includes live preview of portal view.
 */
import { useState, useEffect, useCallback, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type { Conference } from '../../../../types';
import QuestionCard from '../../../../components/common/QuestionCard';
import QuestionPreview from '../../../../components/common/QuestionPreview';
import {
  type RegistrationQuestion,
  type RegistrationQuestionsSettings,
  createEmptyQuestion,
  validateSettings,
} from '../../../../components/common/registrationQuestionTypes';
import { DirtyContext } from '../../DirtyContext';

interface PolicyEntry {
  type: 'url' | 'content' | null;
  url?: string | null;
  content?: string | null;
  enabled?: boolean;
}

interface RegistrationQuestionsTabProps {
  conference: Conference;
  isAdmin: boolean;
}

export default function RegistrationQuestionsTab({
  conference,
  isAdmin,
}: RegistrationQuestionsTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const reportDirty = useContext(DirtyContext);
  const [showPreview, setShowPreview] = useState(false);

  const settingsKey = [...queryKeys.conferences.detail(conference.id), 'registration-questions'];

  const { data: settings, isLoading } = useQuery({
    queryKey: settingsKey,
    queryFn: async () => {
      const res = await api.get<RegistrationQuestionsSettings>(
        `/conferences/${conference.id}/settings/registration-questions`
      );
      return res.data;
    },
  });

  const { data: policiesData } = useQuery({
    queryKey: [...queryKeys.conferences.detail(conference.id), 'policies'],
    queryFn: async () => {
      const res = await api.get<Record<string, PolicyEntry>>(
        `/conferences/${conference.id}/settings/policies`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const [localSettings, setLocalSettings] = useState<RegistrationQuestionsSettings>({
    enabled: false,
    questions: [],
  });
  const [isDirty, setIsDirty] = useState(false);

  // Sync server data to local state (only when not dirty)
  useEffect(() => {
    if (settings && !isDirty) {
      setLocalSettings(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Report dirty state to parent for tab-switch guarding
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  const saveMutation = useMutation({
    mutationFn: async (data: RegistrationQuestionsSettings) => {
      const res = await api.put<RegistrationQuestionsSettings>(
        `/conferences/${conference.id}/settings/registration-questions`,
        data
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKey, data);
      setIsDirty(false);
    },
    onError: (err) => {
      showToast(parseApiError(err, 'Failed to save'), 'error');
    },
  });

  const handleSave = useCallback(() => {
    const validationError = validateSettings(localSettings);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }
    saveMutation.mutate(localSettings);
  }, [localSettings, saveMutation, showToast]);

  const handleDiscard = useCallback(() => {
    if (settings) {
      setLocalSettings(settings);
      setIsDirty(false);
    }
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<RegistrationQuestionsSettings>) => {
    setLocalSettings((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  }, []);

  const updateQuestion = useCallback((index: number, updated: RegistrationQuestion) => {
    setLocalSettings((prev) => {
      const questions = [...prev.questions];
      questions[index] = updated;
      return { ...prev, questions };
    });
    setIsDirty(true);
  }, []);

  const removeQuestion = useCallback((index: number) => {
    setLocalSettings((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  }, []);

  const moveQuestion = useCallback((index: number, direction: -1 | 1) => {
    setLocalSettings((prev) => {
      const questions = [...prev.questions];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= questions.length) return prev;
      [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]];
      return {
        ...prev,
        questions: questions.map((q, i) => ({ ...q, sort_order: i })),
      };
    });
    setIsDirty(true);
  }, []);

  const addQuestion = useCallback(() => {
    setLocalSettings((prev) => ({
      ...prev,
      questions: [...prev.questions, createEmptyQuestion(prev.questions.length)],
    }));
    setIsDirty(true);
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Registration Questions
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Define questions shown to portal users after their first login.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings.enabled}
              onChange={(e) => updateSettings({ enabled: e.target.checked })}
              disabled={!isAdmin}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</span>
          </label>
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending || !isAdmin}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {localSettings.enabled && (
        <>
          {/* Questions list */}
          <div className="space-y-3">
            {localSettings.questions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm">No questions defined yet.</p>
                <p className="text-xs mt-1">
                  Click &quot;Add Question&quot; to create your first question.
                </p>
              </div>
            ) : (
              localSettings.questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  onChange={(updated) => updateQuestion(index, updated)}
                  onRemove={() => removeQuestion(index)}
                  onMoveUp={() => moveQuestion(index, -1)}
                  onMoveDown={() => moveQuestion(index, 1)}
                  isFirst={index === 0}
                  isLast={index === localSettings.questions.length - 1}
                />
              ))
            )}
          </div>

          {/* Add question button */}
          {isAdmin && (
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Question
            </button>
          )}

          {/* Preview toggle */}
          {localSettings.questions.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <button
                type="button"
                onClick={() => setShowPreview((prev) => !prev)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showPreview ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                {showPreview ? 'Hide Preview' : 'Show Portal Preview'}
              </button>

              {showPreview && (
                <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <QuestionPreview
                    questions={localSettings.questions}
                    policies={policiesData ?? null}
                    entityName={conference.name}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
