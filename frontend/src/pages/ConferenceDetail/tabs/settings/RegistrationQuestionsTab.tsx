/**
 * Registration Questions Settings Tab
 *
 * Manages questions shown to portal users after their first login post-registration.
 * Question types: checkbox, text field, radio buttons.
 * Questions can be mandatory or optional.
 */
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import RegistrationAnswersPanel from './RegistrationAnswersPanel';
import type { Conference } from '../../../../types';

interface RegistrationQuestion {
  id: string;
  text: string;
  type: 'checkbox' | 'text' | 'radio';
  required: boolean;
  options: string[];
  sort_order: number;
  is_active: boolean;
}

interface RegistrationQuestionsSettings {
  enabled: boolean;
  questions: RegistrationQuestion[];
}

interface RegistrationQuestionsTabProps {
  conference: Conference;
  isAdmin: boolean;
}

function generateId(): string {
  return crypto.randomUUID();
}

function createEmptyQuestion(sortOrder: number): RegistrationQuestion {
  return {
    id: generateId(),
    text: '',
    type: 'text',
    required: false,
    options: [],
    sort_order: sortOrder,
    is_active: true,
  };
}

function QuestionCard({
  question,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  question: RegistrationQuestion;
  onChange: (updated: RegistrationQuestion) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const handleOptionChange = useCallback(
    (index: number, value: string) => {
      const newOptions = [...question.options];
      newOptions[index] = value;
      onChange({ ...question, options: newOptions });
    },
    [question, onChange]
  );

  const addOption = useCallback(() => {
    onChange({ ...question, options: [...question.options, ''] });
  }, [question, onChange]);

  const removeOption = useCallback(
    (index: number) => {
      const newOptions = question.options.filter((_, i) => i !== index);
      onChange({ ...question, options: newOptions });
    },
    [question, onChange]
  );

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <input
            type="text"
            value={question.text}
            onChange={(e) => onChange({ ...question, text: e.target.value })}
            placeholder="Enter your question..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
            title="Move up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
            title="Move down"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-red-400 hover:text-red-600 dark:hover:text-red-300"
            title="Remove question"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Type
          </label>
          <select
            value={question.type}
            onChange={(e) => {
              const newType = e.target.value as RegistrationQuestion['type'];
              const updates: Partial<RegistrationQuestion> = { type: newType };
              if (newType === 'radio' && question.options.length < 2) {
                updates.options = ['Option 1', 'Option 2'];
              }
              if (newType !== 'radio') {
                updates.options = [];
              }
              onChange({ ...question, ...updates });
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="text">Text Field</option>
            <option value="checkbox">Checkbox</option>
            <option value="radio">Radio Buttons</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onChange({ ...question, required: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Mandatory</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={question.is_active}
            onChange={(e) => onChange({ ...question, is_active: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
        </label>
      </div>

      {question.type === 'radio' && (
        <div className="mt-3 pl-2 border-l-2 border-gray-200 dark:border-gray-600">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Options</p>
          <div className="space-y-2">
            {question.options.map((option, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  value={option}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm dark:bg-gray-800 dark:text-gray-100"
                />
                {question.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="p-1 text-gray-400 hover:text-red-500"
                    title="Remove option"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              + Add Option
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegistrationQuestionsTab({
  conference,
  isAdmin,
}: RegistrationQuestionsTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

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

  const [localSettings, setLocalSettings] = useState<RegistrationQuestionsSettings>({
    enabled: false,
    questions: [],
  });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
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
      showToast('Registration questions saved', 'success');
    },
    onError: (err) => {
      showToast(parseApiError(err, 'Failed to save'), 'error');
    },
  });

  const handleSave = useCallback(() => {
    // Validate before saving
    for (const q of localSettings.questions) {
      if (!q.text.trim()) {
        showToast('All questions must have text', 'error');
        return;
      }
      if (q.type === 'radio') {
        if (q.options.length < 2) {
          showToast(`Radio question "${q.text}" needs at least 2 options`, 'error');
          return;
        }
        if (q.options.some((o) => !o.trim())) {
          showToast(`All options must have text for "${q.text}"`, 'error');
          return;
        }
      }
    }
    saveMutation.mutate(localSettings);
  }, [localSettings, saveMutation, showToast]);

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
            Define questions shown to portal users after their first login. Mandatory questions must
            be answered before accessing the portal.
          </p>
        </div>
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
        </>
      )}

      {/* Save button */}
      {isAdmin && isDirty && (
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Answers panel — show when questions exist */}
      {localSettings.enabled && localSettings.questions.length > 0 && (
        <RegistrationAnswersPanel conference={conference} />
      )}
    </div>
  );
}
