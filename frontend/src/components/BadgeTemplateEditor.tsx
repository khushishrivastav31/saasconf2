import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../config/api';
import { useToast } from './Toast';
import { parseApiError } from '../utils/apiError';
import RichTextEditor from './common/RichTextEditor';

/**
 * Simple HTML pretty-printer: inserts newlines and indentation around block
 * tags so the source is human-readable.
 */
function formatHtml(html: string): string {
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

interface BadgeTemplateEditorProps {
  conferenceId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onSave?: () => void;
  orientation?: string;
  onOrientationChange?: (orientation: string) => void;
  templateType?: string;
  extraPlaceholders?: { category: string; items: { name: string; description: string }[] }[];
}

// A5 dimensions at 96 DPI
const ORIENTATIONS = [
  { value: 'landscape', label: 'Landscape (210 x 148 mm)', width: 794, height: 560 },
  { value: 'portrait', label: 'Portrait (148 x 210 mm)', width: 560, height: 794 },
];

// Badge placeholder categories
const BADGE_PLACEHOLDERS = [
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
const BADGE_TEMPLATES = [
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

export default function BadgeTemplateEditor({
  conferenceId,
  value,
  onChange,
  disabled = false,
  onSave,
  orientation = 'landscape',
  onOrientationChange,
  templateType = 'attendee',
  extraPlaceholders,
}: BadgeTemplateEditorProps) {
  const { showToast } = useToast();
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [formattedHtml, setFormattedHtml] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Attendee', 'Conference'])
  );

  const currentOrientation = ORIENTATIONS.find((o) => o.value === orientation) ?? ORIENTATIONS[0];

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        badge_templates: { [templateType]: value },
        badge_orientation: orientation,
      };

      const res = await api.post(
        `/conferences/${conferenceId}/settings/badge-settings/preview`,
        payload,
        { responseType: 'blob', params: { badge_type: templateType } }
      );

      const blob = new Blob([res.data], { type: 'application/pdf' });
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
    onSuccess: (dataUrl) => {
      setPreviewBlobUrl(dataUrl);
    },
    onError: (err: unknown) => {
      const errorMessage = parseApiError(err, 'Failed to generate preview');
      showToast(errorMessage, 'error');
    },
  });

  const insertTemplate = (template: (typeof BADGE_TEMPLATES)[0]) => {
    onChange(template.html);
    showToast(`Template "${template.name}" inserted`, 'success');
  };

  const insertPlaceholder = (placeholder: string) => {
    onChange(value + placeholder);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Control Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Orientation Toggle */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Orientation:
          </label>
          <select
            value={orientation}
            onChange={(e) => onOrientationChange?.(e.target.value)}
            disabled={disabled}
            className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {ORIENTATIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

        {/* Quick Templates */}
        <div className="relative group">
          <button
            className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            disabled={disabled}
          >
            Insert Template &#9660;
          </button>
          <div className="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            {BADGE_TEMPLATES.map((template, idx) => (
              <button
                key={idx}
                onClick={() => insertTemplate(template)}
                disabled={disabled}
                className="block w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg disabled:opacity-50"
              >
                <div className="font-medium">{template.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  A5 badge layout
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Placeholders Toggle */}
        <button
          onClick={() => setShowPlaceholders(!showPlaceholders)}
          className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
            showPlaceholders
              ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          {showPlaceholders ? 'Hide' : 'Show'} Placeholders
        </button>

        {/* HTML / Visual Toggle */}
        <button
          onClick={() => {
            if (!showHtml) {
              setFormattedHtml(formatHtml(value));
            } else {
              onChange(formattedHtml);
            }
            setShowHtml(!showHtml);
          }}
          className={`px-3 py-1.5 text-sm border rounded-lg transition-colors font-mono ${
            showHtml
              ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          &lt;/&gt; HTML
        </button>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending}
          className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {previewMutation.isPending ? 'Generating...' : 'Preview PDF'}
        </button>

        {onSave && (
          <button
            onClick={onSave}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Save Template
          </button>
        )}
      </div>

      {/* Main Editor Area: Page Canvas + Optional Placeholder Sidebar */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Page Canvas Area */}
        <div className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-900 rounded-lg p-6 overflow-auto">
          {showHtml ? (
            <div className="h-full">
              <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span className="font-mono">&lt;/&gt;</span> HTML Source
              </div>
              <textarea
                value={formattedHtml}
                onChange={(e) => setFormattedHtml(e.target.value)}
                disabled={disabled}
                spellCheck={false}
                className="w-full h-[calc(100%-2rem)] min-h-150 px-4 py-3 font-mono text-sm leading-relaxed bg-gray-900 text-gray-100 border border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
              />
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="relative">
                {/* Orientation label */}
                <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
                  DIN A5 — {currentOrientation.label}
                </div>
                {/* Page sheet */}
                <div
                  className="bg-white dark:bg-gray-800 shadow-lg border border-gray-300 dark:border-gray-600"
                  style={{
                    width: `${currentOrientation.width}px`,
                    minHeight: `${currentOrientation.height}px`,
                  }}
                >
                  <RichTextEditor
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    rows={orientation === 'landscape' ? 16 : 24}
                    editorClassName="prose-tight"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Placeholder Sidebar */}
        {showPlaceholders && (
          <div className="w-64 shrink-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 z-10">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                Placeholders
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Click to insert</p>
            </div>
            <div className="p-2 space-y-1">
              {[...BADGE_PLACEHOLDERS, ...(extraPlaceholders ?? [])].map((category) => {
                const isExpanded = expandedCategories.has(category.category);
                return (
                  <div key={category.category}>
                    <button
                      onClick={() => toggleCategory(category.category)}
                      className="w-full flex items-center justify-between px-1 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                      <span className="uppercase tracking-wider">{category.category}</span>
                      <svg
                        className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="space-y-0.5 mt-1 mb-2">
                        {category.items.map((item) => (
                          <button
                            key={item.name}
                            onClick={() => insertPlaceholder(item.name)}
                            disabled={disabled}
                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700 dark:hover:text-primary-300 transition-colors disabled:opacity-50 group"
                          >
                            <code className="font-mono text-primary-600 dark:text-primary-400 text-[11px]">
                              {item.name}
                            </code>
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-[11px] leading-tight">
                              {item.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {previewBlobUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-11/12 h-5/6 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Badge Preview (PDF)
              </h2>
              <button
                onClick={() => setPreviewBlobUrl(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-4 overflow-hidden">
              <object
                data={previewBlobUrl}
                type="application/pdf"
                className="w-full h-full rounded"
                aria-label="Badge PDF Preview"
              >
                <p className="text-gray-600 dark:text-gray-400">
                  Your browser doesn&apos;t support inline PDF viewing.{' '}
                  <a
                    href={previewBlobUrl}
                    download="badge-preview.pdf"
                    className="text-primary-600 hover:underline"
                  >
                    Download the PDF
                  </a>
                </p>
              </object>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
