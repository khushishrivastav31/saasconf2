/**
 * Registration Questions Settings Tab
 *
 * Manages questions shown to portal users after their first login post-registration.
 * Question types: checkbox, text field, radio buttons, dropdown.
 * Auto-saves changes with debounce. Includes live preview of portal view.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import type { Conference } from '../../../../types';
import MiniRichTextEditor from '../../../../components/common/MiniRichTextEditor';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';

interface RegistrationQuestion {
  id: string;
  text: string;
  type: 'checkbox' | 'text' | 'radio' | 'dropdown';
  required: boolean;
  help_text: string;
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
    help_text: '',
    options: [],
    sort_order: sortOrder,
    is_active: true,
  };
}

/** Validates settings and returns error message or null if valid */
function validateSettings(settings: RegistrationQuestionsSettings): string | null {
  for (const q of settings.questions) {
    if (!q.text.trim()) return 'All questions must have text';
    if (q.type === 'radio' || q.type === 'dropdown') {
      if (q.options.length < 2)
        return `${q.type === 'radio' ? 'Radio' : 'Dropdown'} question "${q.text}" needs at least 2 options`;
      if (q.options.some((o) => !o.trim())) return `All options must have text for "${q.text}"`;
    }
  }
  return null;
}

// --- Policy Links for Preview ---

const POLICY_LABELS: Record<string, string> = {
  privacy_policy: 'Privacy Policy',
  cookies_policy: 'Cookies Policy',
  imprint: 'Imprint',
  terms_and_conditions: 'Terms & Conditions',
  code_of_conduct: 'Code of Conduct',
};

const POLICY_ORDER = [
  'privacy_policy',
  'cookies_policy',
  'imprint',
  'terms_and_conditions',
  'code_of_conduct',
];

interface PolicyEntry {
  type: 'url' | 'content' | null;
  url?: string | null;
  content?: string | null;
  enabled?: boolean;
}

function PreviewPolicyLinks({ policies }: { policies: Record<string, PolicyEntry> | null }) {
  if (!policies) return null;

  const enabled = POLICY_ORDER.filter(
    (key) => policies[key] && (policies[key].type === 'url' || policies[key].type === 'content')
  );

  if (enabled.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-4">
      {enabled.map((key) => (
        <span key={key} className="hover:text-gray-700 dark:hover:text-gray-300 cursor-default">
          {POLICY_LABELS[key] || key}
        </span>
      ))}
    </div>
  );
}

// --- Preview Component ---

function QuestionPreview({
  questions,
  policies,
  conferenceName,
}: {
  questions: RegistrationQuestion[];
  policies: Record<string, PolicyEntry> | null;
  conferenceName: string;
}) {
  const [demoAnswers, setDemoAnswers] = useState<Record<string, string>>({});

  // Only show active questions in preview
  const activeQuestions = useMemo(() => questions.filter((q) => q.is_active), [questions]);

  const hasMandatory = activeQuestions.some((q) => q.required);
  const canSkip = !hasMandatory;

  const updateDemo = useCallback((id: string, value: string) => {
    setDemoAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  if (activeQuestions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No active questions to preview.</p>
        <p className="text-xs mt-1">Add questions above and mark them as active.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Registration Questions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{conferenceName}</p>
          {hasMandatory && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Questions marked with * are mandatory and must be answered to access the portal.
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
          {activeQuestions.map((q) => (
            <div key={q.id}>
              {q.type === 'checkbox' ? (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={demoAnswers[q.id] === 'true'}
                    onChange={(e) => updateDemo(q.id, e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {q.text || 'Untitled question'}
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                </label>
              ) : q.type === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {q.text || 'Untitled question'}
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="text"
                    value={demoAnswers[q.id] || ''}
                    onChange={(e) => updateDemo(q.id, e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              ) : q.type === 'radio' ? (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {q.text || 'Untitled question'}
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </p>
                  <div className="space-y-2 pl-1">
                    {q.options
                      .filter((o) => o.trim())
                      .map((option) => (
                        <label key={option} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`preview-${q.id}`}
                            value={option}
                            checked={demoAnswers[q.id] === option}
                            onChange={() => updateDemo(q.id, option)}
                            className="border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{option}</span>
                        </label>
                      ))}
                  </div>
                </div>
              ) : q.type === 'dropdown' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {q.text || 'Untitled question'}
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <select
                    value={demoAnswers[q.id] || ''}
                    onChange={(e) => updateDemo(q.id, e.target.value)}
                    className="w-full min-h-11 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="" disabled>
                      Select an option...
                    </option>
                    {q.options
                      .filter((o) => o.trim())
                      .map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
              {q.help_text && (
                <RichTextDisplay
                  content={q.help_text}
                  className="text-xs text-gray-400 dark:text-gray-500 mt-1 [&_a]:text-primary-600 [&_a]:underline"
                  fallback=""
                />
              )}
            </div>
          ))}

          <div className="flex flex-col gap-2 pt-2">
            <div className="w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 text-sm font-medium text-center cursor-default">
              Submit Answers
            </div>
            {canSkip && (
              <div className="w-full text-sm text-gray-500 dark:text-gray-400 py-1 text-center cursor-default">
                Skip for now
              </div>
            )}
          </div>
        </div>

        <PreviewPolicyLinks policies={policies} />
      </div>
    </div>
  );
}

// --- Question Card Component ---

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
              if ((newType === 'radio' || newType === 'dropdown') && question.options.length < 2) {
                updates.options = ['Option 1', 'Option 2'];
              }
              if (newType !== 'radio' && newType !== 'dropdown') {
                updates.options = [];
              }
              onChange({ ...question, ...updates });
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="text">Text Field</option>
            <option value="checkbox">Checkbox</option>
            <option value="radio">Radio Buttons</option>
            <option value="dropdown">Dropdown</option>
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

      <div className="mt-3">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Help Text
        </label>
        <MiniRichTextEditor
          value={question.help_text || ''}
          onChange={(html) => onChange({ ...question, help_text: html })}
          placeholder="Optional help text shown below the question..."
        />
      </div>

      {(question.type === 'radio' || question.type === 'dropdown') && (
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

// --- Save Status Indicator ---

function SaveStatusIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  return (
    <span
      className={`text-xs font-medium ${
        status === 'saving'
          ? 'text-gray-400 dark:text-gray-500'
          : status === 'saved'
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-600 dark:text-red-400'
      }`}
    >
      {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Save failed'}
    </span>
  );
}

// --- Main Tab Component ---

export default function RegistrationQuestionsTab({
  conference,
  isAdmin,
}: RegistrationQuestionsTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSettingsRef = useRef(localSettings);
  localSettingsRef.current = localSettings;

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      setIsDirty(false);
    }
  }, [settings]);

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
      setSaved();
    },
    onError: (err) => {
      setError();
      showToast(parseApiError(err, 'Failed to save'), 'error');
    },
  });

  // Debounced auto-save
  const triggerAutoSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const current = localSettingsRef.current;
      const validationError = validateSettings(current);
      if (validationError) return; // Don't save invalid state
      setSaving();
      saveMutation.mutate(current);
    }, 800);
  }, [saveMutation, setSaving]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updateSettings = useCallback(
    (updates: Partial<RegistrationQuestionsSettings>) => {
      setLocalSettings((prev) => ({ ...prev, ...updates }));
      setIsDirty(true);
      triggerAutoSave();
    },
    [triggerAutoSave]
  );

  const updateQuestion = useCallback(
    (index: number, updated: RegistrationQuestion) => {
      setLocalSettings((prev) => {
        const questions = [...prev.questions];
        questions[index] = updated;
        return { ...prev, questions };
      });
      setIsDirty(true);
      triggerAutoSave();
    },
    [triggerAutoSave]
  );

  const removeQuestion = useCallback(
    (index: number) => {
      setLocalSettings((prev) => ({
        ...prev,
        questions: prev.questions.filter((_, i) => i !== index),
      }));
      setIsDirty(true);
      triggerAutoSave();
    },
    [triggerAutoSave]
  );

  const moveQuestion = useCallback(
    (index: number, direction: -1 | 1) => {
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
      triggerAutoSave();
    },
    [triggerAutoSave]
  );

  const addQuestion = useCallback(() => {
    setLocalSettings((prev) => ({
      ...prev,
      questions: [...prev.questions, createEmptyQuestion(prev.questions.length)],
    }));
    setIsDirty(true);
    // Don't auto-save new empty question — it would fail validation
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
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Registration Questions
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Define questions shown to portal users after their first login. Changes are saved
              automatically.
            </p>
          </div>
          {(isDirty || saveStatus !== 'idle') && <SaveStatusIndicator status={saveStatus} />}
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
                    conferenceName={conference.name}
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
