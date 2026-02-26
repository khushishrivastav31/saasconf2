import { describe, it, expect } from 'vitest';
import { isHtml, stripHtml, sanitizeHtml } from '../richText';

describe('isHtml', () => {
  it('returns true for string with HTML tags', () => {
    expect(isHtml('<p>Hello world</p>')).toBe(true);
  });

  it('returns true for string with self-closing tags', () => {
    expect(isHtml('<br/>')).toBe(true);
    expect(isHtml("<img src='test.jpg'/>")).toBe(true);
  });

  it('returns true for string with nested HTML tags', () => {
    expect(isHtml('<div><p>Nested content</p></div>')).toBe(true);
  });

  it('returns true for HTML with attributes', () => {
    expect(isHtml('<a href="https://example.com">Link</a>')).toBe(true);
  });

  it('returns true for multiline HTML', () => {
    expect(isHtml('<p>\nMultiline\ncontent\n</p>')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isHtml('Hello world')).toBe(false);
  });

  it('returns false for text with angle brackets that are not HTML', () => {
    expect(isHtml('5 < 10')).toBe(false);
    expect(isHtml('5 > 3')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isHtml('')).toBe(false);
  });

  it('returns false for text with incomplete tags', () => {
    expect(isHtml('<incomplete')).toBe(false);
  });
});

describe('stripHtml', () => {
  it('strips HTML tags and returns plain text', () => {
    expect(stripHtml('<p>Hello world</p>')).toBe('Hello world');
  });

  it('handles nested HTML tags', () => {
    expect(stripHtml('<div><p>Nested <strong>content</strong></p></div>')).toBe('Nested content');
  });

  it('handles multiple HTML elements', () => {
    expect(stripHtml('<p>First</p><p>Second</p>')).toBe('FirstSecond');
  });

  it('handles HTML with attributes', () => {
    expect(stripHtml('<a href="https://example.com">Click here</a>')).toBe('Click here');
  });

  it('returns empty string for empty HTML', () => {
    expect(stripHtml('')).toBe('');
  });

  it('returns plain text as-is', () => {
    expect(stripHtml('Just plain text')).toBe('Just plain text');
  });

  it('handles whitespace in HTML', () => {
    expect(stripHtml('<p>  Spaced  content  </p>')).toBe('  Spaced  content  ');
  });

  it('handles line breaks in HTML', () => {
    const html = '<p>Line 1</p><p>Line 2</p>';
    expect(stripHtml(html)).toBe('Line 1Line 2');
  });

  it('handles special HTML entities', () => {
    expect(stripHtml('<p>&amp; &lt; &gt;</p>')).toBe('& < >');
  });
});

describe('sanitizeHtml', () => {
  it('preserves safe HTML tags', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong></p>');
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
  });

  it('preserves inline styles (tiptap color support)', () => {
    const html = '<span style="color: red;">Red text</span>';
    const result = sanitizeHtml(html);
    expect(result).toContain('style="color: red;"');
  });

  it('preserves complex inline styles', () => {
    const html = '<span style="color: #DC2626; background-color: yellow;">Styled</span>';
    const result = sanitizeHtml(html);
    expect(result).toContain('style=');
    expect(result).toContain('Styled');
  });

  it('strips script tags', () => {
    const html = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script>');
    expect(result).toContain('Safe');
  });

  it('strips onclick handlers', () => {
    const html = '<button onclick="alert(1)">Click</button>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('onclick');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('handles plain text without tags', () => {
    expect(sanitizeHtml('Hello world')).toBe('Hello world');
  });
});
