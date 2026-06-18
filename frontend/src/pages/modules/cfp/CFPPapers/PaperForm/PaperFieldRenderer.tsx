import PaperBuiltinField from './PaperBuiltinFields';
import PaperCustomField from './PaperCustomFields';
import type { CFPTopic, SessionType } from '../../../../../types';
import type { UnifiedFormField } from './schema';

interface Props {
  fields: UnifiedFormField[];
  canEdit: boolean;
  topics: CFPTopic[];
  sessionTypes: SessionType[];
  customFieldAnswers: Record<string, unknown>;
  setCustomFieldAnswer: (key: string, value: unknown) => void;
  onFileSelect?: (fieldKey: string, file: File | null) => void;
  pendingFileNames?: Record<string, string>;
}

export default function PaperFieldRenderer({
  fields,
  canEdit,
  topics,
  sessionTypes,
  customFieldAnswers,
  setCustomFieldAnswer,
  onFileSelect,
  pendingFileNames,
}: Props) {
  return (
    <>
      {fields.map((field) => {
        if (field.type === 'builtin') {
          return (
            <PaperBuiltinField
              key={field.key}
              field={field}
              canEdit={canEdit}
              topics={topics}
              sessionTypes={sessionTypes}
            />
          );
        }

        if (field.type === 'custom' && field.customField) {
          return (
            <PaperCustomField
              key={field.customField.id}
              field={field}
              canEdit={canEdit}
              value={customFieldAnswers[field.key]}
              onChange={(v) => setCustomFieldAnswer(field.key, v)}
              onFileSelect={(file) => onFileSelect?.(field.key, file)}
              pendingFileName={pendingFileNames?.[field.key] ?? null}
            />
          );
        }

        return null;
      })}
    </>
  );
}
