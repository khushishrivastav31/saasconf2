import DOMPurify from 'dompurify';

/**
 * Checks if a string contains HTML tags.
 * Used to distinguish between legacy plain text data and new rich text data.
 */
export function isHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Strips HTML tags and returns plain text.
 * Useful for table cell previews or truncated display.
 */
export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

/**
 * Sanitizes HTML for safe rendering via dangerouslySetInnerHTML.
 * Preserves inline styles (needed for rich text color/highlight from tiptap).
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['style'] });
}
