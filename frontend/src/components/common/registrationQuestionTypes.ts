/**
 * Shared types, helpers, and validation for registration questions settings.
 * Used by both conference and training registration questions tabs.
 */
import { stripHtml } from '../../utils/richText';

export interface RegistrationQuestion {
  id: string;
  text: string;
  type: 'checkbox' | 'text' | 'textarea' | 'radio' | 'dropdown';
  required: boolean;
  help_text: string;
  options: string[];
  sort_order: number;
  is_active: boolean;
}

export interface RegistrationQuestionsSettings {
  enabled: boolean;
  questions: RegistrationQuestion[];
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function createEmptyQuestion(sortOrder: number): RegistrationQuestion {
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
export function validateSettings(settings: RegistrationQuestionsSettings): string | null {
  for (const q of settings.questions) {
    if (!stripHtml(q.text).trim()) return 'All questions must have text';
    const label = stripHtml(q.text).trim() || 'Untitled';
    if (q.type === 'radio' || q.type === 'dropdown') {
      if (q.options.length < 2)
        return `${q.type === 'radio' ? 'Radio' : 'Dropdown'} question "${label}" needs at least 2 options`;
      if (q.options.some((o) => !stripHtml(o).trim()))
        return `All options must have text for "${label}"`;
    }
  }
  return null;
}
