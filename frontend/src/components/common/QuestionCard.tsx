/**
 * Shared QuestionCard component for conference and training registration questions.
 *
 * Renders an editable question with type selector, options management,
 * help text, required/active toggles, and reorder buttons.
 */
import { useCallback } from 'react';
import MiniRichTextEditor from './MiniRichTextEditor';
import type { RegistrationQuestion } from './registrationQuestionTypes';

interface QuestionCardProps {
  question: RegistrationQuestion;
  onChange: (updated: RegistrationQuestion) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export default function QuestionCard({
  question,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: QuestionCardProps) {
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
          <MiniRichTextEditor
            value={question.text}
            onChange={(html) => onChange({ ...question, text: html })}
            placeholder="Enter your question..."
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
            title="Move up"
            aria-label="Move up"
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
            aria-label="Move down"
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
            aria-label="Remove question"
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
                <span className="w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-500 shrink-0 mt-2" />
                <div className="flex-1">
                  <MiniRichTextEditor
                    value={option}
                    onChange={(html) => handleOptionChange(idx, html)}
                    placeholder={`Option ${idx + 1}`}
                  />
                </div>
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
