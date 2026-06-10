import { Controller, useFormContext } from 'react-hook-form';
import RichTextEditor from '../../../../../components/common/RichTextEditor';
import type { CFPTopic, SessionType } from '../../../../../types';
import { LEVEL_OPTIONS, type PaperFormData, type UnifiedFormField } from './schema';

interface BuiltinFieldProps {
  field: UnifiedFormField;
  canEdit: boolean;
  topics: CFPTopic[];
  sessionTypes: SessionType[];
}

export default function PaperBuiltinField({
  field,
  canEdit,
  topics,
  sessionTypes,
}: BuiltinFieldProps) {
  const { control, register, watch, setValue } = useFormContext<PaperFormData>();

  switch (field.key) {
    case 'title': {
      const titleValue = watch('title');
      const overMax = field.max_chars != null && titleValue.length > field.max_chars;
      const underMin =
        field.min_chars != null && titleValue.length > 0 && titleValue.length < field.min_chars;
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            {...register('title')}
            disabled={!canEdit}
            maxLength={field.max_chars ?? undefined}
            minLength={field.min_chars ?? undefined}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
            required
          />
          {(field.min_chars != null || field.max_chars != null) && (
            <div className="flex justify-end mt-1">
              <span
                className={`text-xs ${
                  overMax || underMin
                    ? 'text-red-600 font-medium'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {titleValue.length}
                {field.min_chars != null && <span> (min {field.min_chars})</span>}
                {field.max_chars != null && <span> / {field.max_chars}</span>}
              </span>
            </div>
          )}
          {field.help_text && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.help_text}</p>
          )}
        </div>
      );
    }

    case 'session_type':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Session Type
            {field.is_required && <span className="text-red-500"> *</span>}
          </label>
          <select
            {...register('session_type_id')}
            disabled={!canEdit}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          >
            <option value="">Select session type...</option>
            {sessionTypes.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name} ({st.duration_minutes} min)
              </option>
            ))}
          </select>
          {field.help_text && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.help_text}</p>
          )}
        </div>
      );

    case 'topics': {
      const selected = watch('topic_ids');
      const toggleTopic = (topicId: string) => {
        const current = selected;
        const next = current.includes(topicId)
          ? current.filter((id) => id !== topicId)
          : [...current, topicId];
        setValue('topic_ids', next, { shouldDirty: true });
      };
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Topics
            {field.is_required && <span className="text-red-500"> *</span>}
          </label>
          {topics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topics.map((topic) => {
                const isSelected = selected.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => toggleTopic(topic.id)}
                    disabled={!canEdit}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-primary-100 text-primary-700 border-2 border-primary-500'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {topic.name}
                    {isSelected && (
                      <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No topics available.</p>
          )}
          {field.help_text && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.help_text}</p>
          )}
        </div>
      );
    }

    case 'level': {
      const levelOptions =
        field.options && field.options.length > 0 ? field.options : LEVEL_OPTIONS;
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Level
            {field.is_required && <span className="text-red-500"> *</span>}
          </label>
          <select
            {...register('level')}
            disabled={!canEdit}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          >
            <option value="">Select level...</option>
            {levelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {field.help_text && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.help_text}</p>
          )}
        </div>
      );
    }

    case 'abstract_short':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Short Abstract
            {field.is_required && <span className="text-red-500"> *</span>}
          </label>
          <Controller
            control={control}
            name="abstract_short"
            render={({ field: f }) => (
              <RichTextEditor
                value={f.value}
                onChange={f.onChange}
                placeholder="Brief summary of your talk..."
                rows={3}
                disabled={!canEdit}
                minLength={field.min_chars ?? undefined}
                maxLength={field.max_chars ?? undefined}
              />
            )}
          />
          {field.help_text && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.help_text}</p>
          )}
        </div>
      );

    case 'abstract_long':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Long Abstract
            {field.is_required && <span className="text-red-500"> *</span>}
          </label>
          <Controller
            control={control}
            name="abstract_long"
            render={({ field: f }) => (
              <RichTextEditor
                value={f.value}
                onChange={f.onChange}
                placeholder="Detailed description of your talk..."
                rows={6}
                disabled={!canEdit}
                minLength={field.min_chars ?? undefined}
                maxLength={field.max_chars ?? undefined}
              />
            )}
          />
          {field.help_text && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.help_text}</p>
          )}
        </div>
      );

    case 'learning_objectives':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Learning Objectives
            {field.is_required && <span className="text-red-500"> *</span>}
          </label>
          <Controller
            control={control}
            name="learning_objectives"
            render={({ field: f }) => (
              <RichTextEditor
                value={f.value}
                onChange={f.onChange}
                placeholder="What will attendees learn from this talk?"
                rows={4}
                disabled={!canEdit}
                minLength={field.min_chars ?? undefined}
                maxLength={field.max_chars ?? undefined}
              />
            )}
          />
          {field.help_text && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.help_text}</p>
          )}
        </div>
      );

    case 'video':
      // Rendered separately by the parent via PaperVideoInput
      return null;

    default:
      return null;
  }
}
