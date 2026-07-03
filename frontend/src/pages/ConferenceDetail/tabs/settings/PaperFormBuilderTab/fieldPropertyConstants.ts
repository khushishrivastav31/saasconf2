import type { PaperFormFieldType } from '../../../../../types';

export const FILE_TYPE_CATEGORIES: Record<string, string[]> = {
  documents: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'],
  images: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
  videos: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
};

export const FILE_TYPE_LABELS: Record<string, string> = {
  documents: 'Documents (pdf, doc, docx, odt, rtf, txt)',
  images: 'Images (png, jpg, jpeg, gif, svg, webp)',
  videos: 'Videos (mp4, avi, mov, mkv, webm)',
};

export function detectFileCategory(types: string[] | undefined): string {
  if (!types || types.length === 0) return '';
  for (const [key, extensions] of Object.entries(FILE_TYPE_CATEGORIES)) {
    if (extensions.length === types.length && extensions.every((ext) => types.includes(ext))) {
      return key;
    }
  }
  return '';
}

export const FIELD_TYPE_OPTIONS: { value: PaperFormFieldType; label: string }[] = [
  { value: 'text', label: 'Text Field' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'richtext', label: 'Rich Text' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox_group', label: 'Checkbox Group' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'file_upload', label: 'File Upload' },
];
