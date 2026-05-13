/**
 * Shared QuestionPreview component for conference and training registration questions.
 *
 * Renders a live portal preview of active questions with sample answers,
 * including policy footer links.
 */
import { useState, useCallback, useMemo } from 'react';
import RichTextDisplay from './RichTextDisplay';
import { stripHtml } from '../../utils/richText';
import { POLICY_LABELS, POLICY_ORDER } from './policyConstants';
import type { RegistrationQuestion } from './registrationQuestionTypes';

interface PolicyEntry {
  type: 'url' | 'content' | null;
  url?: string | null;
  content?: string | null;
  enabled?: boolean;
}

interface QuestionPreviewProps {
  questions: RegistrationQuestion[];
  policies: Record<string, PolicyEntry> | null;
  entityName: string;
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
          {POLICY_LABELS[key]?.label || key}
        </span>
      ))}
    </div>
  );
}

export default function QuestionPreview({ questions, policies, entityName }: QuestionPreviewProps) {
  const [demoAnswers, setDemoAnswers] = useState<Record<string, string>>({});

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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{entityName}</p>
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
                    <RichTextDisplay
                      content={q.text || 'Untitled question'}
                      className="inline [&_p]:inline"
                      fallback="Untitled question"
                    />
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                </label>
              ) : q.type === 'text' ? (
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <RichTextDisplay
                      content={q.text || 'Untitled question'}
                      className="inline [&_p]:inline"
                      fallback="Untitled question"
                    />
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </div>
                  <input
                    type="text"
                    value={demoAnswers[q.id] || ''}
                    onChange={(e) => updateDemo(q.id, e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              ) : q.type === 'textarea' ? (
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <RichTextDisplay
                      content={q.text || 'Untitled question'}
                      className="inline [&_p]:inline"
                      fallback="Untitled question"
                    />
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </div>
                  <textarea
                    rows={4}
                    value={demoAnswers[q.id] || ''}
                    onChange={(e) => updateDemo(q.id, e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              ) : q.type === 'radio' ? (
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <RichTextDisplay
                      content={q.text || 'Untitled question'}
                      className="inline [&_p]:inline"
                      fallback="Untitled question"
                    />
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </div>
                  <div className="space-y-2 pl-1">
                    {q.options
                      .filter((o) => stripHtml(o).trim())
                      .map((option, idx) => (
                        <label key={idx} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`preview-${q.id}`}
                            value={option}
                            checked={demoAnswers[q.id] === option}
                            onChange={() => updateDemo(q.id, option)}
                            className="border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                          />
                          <RichTextDisplay
                            content={option}
                            className="text-sm text-gray-700 dark:text-gray-300 [&_p]:inline"
                            fallback=""
                          />
                        </label>
                      ))}
                  </div>
                </div>
              ) : q.type === 'dropdown' ? (
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <RichTextDisplay
                      content={q.text || 'Untitled question'}
                      className="inline [&_p]:inline"
                      fallback="Untitled question"
                    />
                    {q.required && <span className="text-red-500 ml-0.5">*</span>}
                  </div>
                  <select
                    value={demoAnswers[q.id] || ''}
                    onChange={(e) => updateDemo(q.id, e.target.value)}
                    className="w-full min-h-11 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="" disabled>
                      Select an option...
                    </option>
                    {q.options
                      .filter((o) => stripHtml(o).trim())
                      .map((option, idx) => (
                        <option key={idx} value={option}>
                          {stripHtml(option)}
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
