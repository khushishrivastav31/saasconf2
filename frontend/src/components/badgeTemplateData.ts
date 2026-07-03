/**
 * Simple HTML pretty-printer: inserts newlines and indentation around block
 * tags so the source is human-readable.
 */
export function formatHtml(html: string): string {
  const blocks =
    /^(div|p|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|blockquote|section|header|footer|nav|article|aside|main|hr|br|pre|figure|figcaption)$/i;

  let out = '';
  let indent = 0;
  const tokens = html.replace(/>\s+</g, '><').split(/(<\/?[^>]+>)/);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('</')) {
      const tag = trimmed.replace(/<\/([a-z0-9]+).*/i, '$1');
      if (blocks.test(tag)) indent = Math.max(0, indent - 1);
      out += '  '.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('<') && !trimmed.startsWith('<!')) {
      const tag = trimmed.replace(/<([a-z0-9]+)[\s>/].*/i, '$1');
      const selfClosing = trimmed.endsWith('/>') || /^(br|hr|img|input|meta|link)$/i.test(tag);
      if (blocks.test(tag)) {
        out += '  '.repeat(indent) + trimmed + '\n';
        if (!selfClosing) indent++;
      } else {
        out += '  '.repeat(indent) + trimmed;
      }
    } else {
      out += '  '.repeat(indent) + trimmed + '\n';
    }
  }
  return out.trim() + '\n';
}

// A5 dimensions at 96 DPI
export const ORIENTATIONS = [
  { value: 'landscape', label: 'Landscape (210 x 148 mm)', width: 794, height: 560 },
  { value: 'portrait', label: 'Portrait (148 x 210 mm)', width: 560, height: 794 },
];

// Badge placeholder categories
export const BADGE_PLACEHOLDERS = [
  {
    category: 'Attendee',
    items: [
      { name: '[FIRST_NAME]', description: 'First name' },
      { name: '[LAST_NAME]', description: 'Last name' },
      { name: '[FULL_NAME]', description: 'Full name' },
      { name: '[EMAIL]', description: 'Email address' },
      { name: '[PHONE]', description: 'Phone number' },
      { name: '[JOB_TITLE]', description: 'Job title' },
      { name: '[COMPANY_NAME]', description: 'Company name' },
      { name: '[DEPARTMENT]', description: 'Department' },
      { name: '[PRONOUNS]', description: 'Pronouns' },
    ],
  },
  {
    category: 'Conference',
    items: [
      { name: '[CONFERENCE_NAME]', description: 'Conference name' },
      { name: '[CONFERENCE_ABBREVIATION]', description: 'Conference abbreviation' },
      { name: '[CONFERENCE_VENUE]', description: 'Venue name' },
      { name: '[CONFERENCE_CITY]', description: 'City' },
      { name: '[CONFERENCE_COUNTRY]', description: 'Country' },
      { name: '[CONFERENCE_DATES]', description: 'Date range' },
      { name: '[CONFERENCE_LOGO]', description: 'Conference logo image' },
    ],
  },
  {
    category: 'Registration',
    items: [
      { name: '[BOOKING_OPTION]', description: 'Selected booking option' },
      { name: '[BADGE_TYPE]', description: 'Badge type (e.g. Attendee)' },
      { name: '[REGISTRATION_DATE]', description: 'Registration date' },
    ],
  },
  {
    category: 'QR Code',
    items: [{ name: '[QR_CODE]', description: 'QR code with vCard data' }],
  },
];

// Quick insert templates for badges
export const BADGE_TEMPLATES = [
  {
    name: 'Simple Name Badge',
    html: `<div style="text-align: center; padding: 2cm 1cm; height: 100%; display: flex; flex-direction: column; justify-content: center;">
  <p style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 2px;">[BADGE_TYPE]</p>
  <p>&nbsp;</p>
  <p style="font-size: 28px; font-weight: bold;">[FULL_NAME]</p>
  <p style="font-size: 16px; color: #444;">[JOB_TITLE]</p>
  <p style="font-size: 14px; color: #666;">[COMPANY_NAME]</p>
  <p>&nbsp;</p>
  <p style="font-size: 18px; font-weight: 600;">[CONFERENCE_NAME]</p>
  <p style="font-size: 12px; color: #666;">[CONFERENCE_DATES]</p>
</div>`,
  },
  {
    name: 'Professional Badge with QR',
    html: `<div style="padding: 1.5cm 1cm; height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
  <div style="text-align: center;">
    <p>[CONFERENCE_LOGO]</p>
    <p style="font-size: 14px; font-weight: 600; margin-top: 8px;">[CONFERENCE_NAME]</p>
    <p style="font-size: 11px; color: #666;">[CONFERENCE_DATES] — [CONFERENCE_CITY]</p>
  </div>
  <div style="text-align: center;">
    <p style="font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 2px;">[BADGE_TYPE]</p>
    <p style="font-size: 26px; font-weight: bold; margin: 4px 0;">[FULL_NAME]</p>
    <p style="font-size: 14px; color: #444;">[JOB_TITLE]</p>
    <p style="font-size: 13px; color: #666;">[COMPANY_NAME]</p>
  </div>
  <div style="text-align: center;">
    [QR_CODE]
  </div>
</div>`,
  },
];
