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
}

export default function PaperFieldRenderer({
  fields,
  canEdit,
  topics,
  sessionTypes,
  customFieldAnswers,
  setCustomFieldAnswer,
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
            />
          );
        }

        return null;
      })}
    </>
  );
}
