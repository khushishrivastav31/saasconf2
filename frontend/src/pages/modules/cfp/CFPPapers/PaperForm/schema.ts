import { z } from 'zod';
import type { PaperFormField, Paper, PaperLevel } from '../../../../../types';

export const BUILTIN_FIELD_DEFS: {
  key: string;
  label: string;
  alwaysRequired?: boolean;
}[] = [
  { key: 'title', label: 'Title', alwaysRequired: true },
  { key: 'abstract_short', label: 'Short Abstract' },
  { key: 'abstract_long', label: 'Long Abstract' },
  { key: 'level', label: 'Level' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'session_type', label: 'Session Type' },
  { key: 'topics', label: 'Topics' },
];

export const LEVEL_OPTIONS: { value: PaperLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all_levels', label: 'All Levels' },
];

export const paperFormSchema = z.object({
  cfp_id: z.string(),
  main_speaker_id: z.string(),
  co_speaker_ids: z.array(z.string()),
  session_type_id: z.string(),
  topic_ids: z.array(z.string()),
  title: z.string(),
  abstract_short: z.string(),
  abstract_long: z.string(),
  level: z.union([z.enum(['beginner', 'intermediate', 'advanced', 'all_levels']), z.literal('')]),
  learning_objectives: z.string(),
});

export type PaperFormData = z.infer<typeof paperFormSchema>;

export type UnifiedFormField = {
  type: 'builtin' | 'custom';
  key: string;
  label: string;
  display_order: number;
  is_visible: boolean;
  is_required: boolean;
  help_text?: string | null;
  min_chars?: number | null;
  max_chars?: number | null;
  options?: { value: string; label: string }[] | null;
  customField?: PaperFormField;
};

export const emptyForm: PaperFormData = {
  cfp_id: '',
  main_speaker_id: '',
  co_speaker_ids: [],
  session_type_id: '',
  topic_ids: [],
  title: '',
  abstract_short: '',
  abstract_long: '',
  level: '',
  learning_objectives: '',
};

export function paperToFormData(paper: Paper): PaperFormData {
  return {
    cfp_id: paper.cfp_id,
    main_speaker_id: paper.main_speaker_id,
    co_speaker_ids: paper.cospeakers.map((c) => c.applicant.id),
    session_type_id: paper.session_type_id || '',
    topic_ids: paper.topics.map((t) => t.id),
    title: paper.title,
    abstract_short: paper.abstract_short || '',
    abstract_long: paper.abstract_long || '',
    level: paper.level || '',
    learning_objectives: paper.learning_objectives || '',
  };
}
