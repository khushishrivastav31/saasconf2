import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../config/api';
import { useToast } from './Toast';
import { parseApiError } from '../utils/apiError';
import RichTextEditor from './common/RichTextEditor';

/**
 * Simple HTML pretty-printer: inserts newlines and indentation around block
 * tags so the source is human-readable.  No external dependency needed.
 */
function formatHtml(html: string): string {
  // Block-level tags that should start on their own line
  const blocks =
    /^(div|p|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|blockquote|section|header|footer|nav|article|aside|main|hr|br|pre|figure|figcaption)$/i;

  let out = '';
  let indent = 0;
  // Split on tags while keeping them
  const tokens = html.replace(/>\s+</g, '><').split(/(<\/?[^>]+>)/);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('</')) {
      // Closing tag
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
      // Text content
      out += '  '.repeat(indent) + trimmed + '\n';
    }
  }
  return out.trim() + '\n';
}

interface InvoiceTemplateEditorProps {
  conferenceId: string;
  value: string;
  onChange: (value: string) => void;
  headerValue?: string;
  onHeaderChange?: (value: string) => void;
  footerValue?: string;
  onFooterChange?: (value: string) => void;
  disabled?: boolean;
  onSave?: () => void;
  vatSource?: string;
  pageFormat?: string;
  onPageFormatChange?: (format: string) => void;
  templateType?: string;
}

// Page format options with screen dimensions at 96 DPI
const PAGE_FORMATS = [
  { value: 'A4', label: 'A4 (210 × 297 mm)', region: 'Europe', width: 794, height: 1123 },
  { value: 'A5', label: 'A5 (148 × 210 mm)', region: 'Europe', width: 560, height: 794 },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)', region: 'Americas', width: 816, height: 1056 },
  { value: 'Legal', label: 'Legal (8.5 × 14 in)', region: 'Americas', width: 816, height: 1344 },
  { value: 'B5', label: 'B5 (176 × 250 mm)', region: 'Asia', width: 665, height: 945 },
  {
    value: 'Tabloid',
    label: 'Tabloid (11 × 17 in)',
    region: 'Americas',
    width: 1056,
    height: 1632,
  },
];

// Template placeholder categories
const TEMPLATE_PLACEHOLDERS = [
  {
    category: 'Company',
    items: [
      { name: '[COMPANY_NAME]', description: 'Company name' },
      { name: '[COMPANY_LOGO]', description: 'Company logo image' },
      { name: '[COMPANY_ADDRESS]', description: 'Company address (formatted)' },
      { name: '[COMPANY_CITY]', description: 'Company city' },
      { name: '[COMPANY_POSTAL_CODE]', description: 'Company postal code' },
      { name: '[COMPANY_COUNTRY]', description: 'Company country' },
      { name: '[COMPANY_VAT]', description: 'Company VAT number' },
      { name: '[COMPANY_TAX_ID]', description: 'Tax ID (respects VAT source)' },
    ],
  },
  {
    category: 'Fiscal Rep',
    items: [
      { name: '[FISCAL_REP_NAME]', description: 'Fiscal rep company name' },
      { name: '[FISCAL_REP_ADDRESS]', description: 'Fiscal rep address' },
      { name: '[FISCAL_REP_CITY]', description: 'Fiscal rep city' },
      { name: '[FISCAL_REP_POSTAL_CODE]', description: 'Fiscal rep postal code' },
      { name: '[FISCAL_REP_COUNTRY]', description: 'Fiscal rep country' },
      { name: '[FISCAL_REP_VAT]', description: 'Fiscal rep VAT number' },
      { name: '[FISCAL_REP_TAX_ID]', description: 'Fiscal rep national tax ID' },
    ],
  },
  {
    category: 'Banking',
    items: [
      { name: '[BANK_NAME]', description: 'Default bank name' },
      { name: '[IBAN]', description: 'Default bank IBAN' },
      { name: '[BIC]', description: 'Default bank BIC' },
    ],
  },
  {
    category: 'Contact',
    items: [
      { name: '[CONTACT_EMAIL]', description: 'Conference contact email' },
      { name: '[PHONE]', description: 'Company phone number' },
      { name: '[TELEFON]', description: 'Phone (alias)' },
    ],
  },
  {
    category: 'Invoice',
    items: [
      { name: '[INVOICE_NUMBER]', description: 'Invoice number' },
      { name: '[CREDIT_NOTE_NUMBER]', description: 'Credit note number' },
      { name: '[ISSUE_DATE]', description: 'Invoice issue date' },
      { name: '[DUE_DATE]', description: 'Payment due date' },
      { name: '[NOTES]', description: 'Invoice notes/remarks' },
      { name: '[CURRENCY_1]', description: 'Primary currency code' },
    ],
  },
  {
    category: 'Items & Totals',
    items: [
      { name: '[ITEMS_TABLE]', description: 'Line items table' },
      { name: '[SUBTOTAL]', description: 'Sum before tax' },
      { name: '[TAX_RATE]', description: 'Tax percentage' },
      { name: '[TAX_AMOUNT]', description: 'Calculated tax' },
      { name: '[TOTAL]', description: 'Final total' },
    ],
  },
  {
    category: 'Dual Currency',
    items: [
      { name: '[SECOND_CURRENCY]', description: 'Second currency code' },
      { name: '[SECOND_TOTAL]', description: 'Total in second currency' },
      { name: '[SECOND_SUBTOTAL]', description: 'Subtotal in second currency' },
      { name: '[SECOND_TAX_AMOUNT]', description: 'Tax in second currency' },
    ],
  },
];

// Quick insert templates
const QUICK_TEMPLATES = [
  {
    name: 'Basic Invoice Layout',
    html: `<div style="max-width: 800px; margin: 0 auto; padding: 40px; font-family: Arial, sans-serif;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
    <div>[COMPANY_LOGO]</div>
    <div style="text-align: right;">
      <h1 style="margin: 0; font-size: 32px;">INVOICE</h1>
      <p style="margin: 5px 0; font-size: 14px; color: #666;">[INVOICE_NUMBER]</p>
    </div>
  </div>

  <div style="margin-bottom: 30px;">
    <p style="margin: 0; font-weight: bold;">[COMPANY_NAME]</p>
    <p style="margin: 5px 0; color: #666;">[COMPANY_ADDRESS]</p>
    <p style="margin: 5px 0; color: #666;">VAT: [COMPANY_VAT]</p>
  </div>

  <div style="margin-bottom: 30px;">
    <p style="margin: 5px 0;"><strong>Issue Date:</strong> [ISSUE_DATE]</p>
    <p style="margin: 5px 0;"><strong>Due Date:</strong> [DUE_DATE]</p>
  </div>

  <div style="margin: 30px 0;">
    [ITEMS_TABLE]
  </div>

  <div style="margin-top: 30px; text-align: right;">
    <p style="margin: 8px 0;">Subtotal: <strong>[SUBTOTAL] [CURRENCY_1]</strong></p>
    <p style="margin: 8px 0;">VAT ([TAX_RATE]%): <strong>[TAX_AMOUNT] [CURRENCY_1]</strong></p>
    <p style="margin: 8px 0; font-size: 18px;">Total: <strong>[TOTAL] [CURRENCY_1]</strong></p>
  </div>

  <div style="margin-top: 50px; padding-top: 20px; border-top: 2px solid #eee;">
    <p style="margin: 5px 0; font-size: 14px;"><strong>Payment Details</strong></p>
    <p style="margin: 5px 0; font-size: 14px;">Bank: [BANK_NAME]</p>
    <p style="margin: 5px 0; font-size: 14px;">IBAN: [IBAN]</p>
    <p style="margin: 5px 0; font-size: 14px;">BIC: [BIC]</p>
  </div>
</div>`,
  },
  {
    name: 'Professional Two-Column',
    html: `<div style="max-width: 800px; margin: 0 auto; padding: 40px; font-family: Arial, sans-serif;">
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
    <div>
      [COMPANY_LOGO]
      <p style="margin-top: 20px; margin-bottom: 0; font-weight: bold;">[COMPANY_NAME]</p>
      <p style="margin: 5px 0; font-size: 14px; color: #666;">[COMPANY_ADDRESS]</p>
      <p style="margin: 5px 0; font-size: 14px; color: #666;">VAT: [COMPANY_VAT]</p>
    </div>
    <div style="text-align: right;">
      <h1 style="margin: 0; font-size: 36px; color: #2563eb;">INVOICE</h1>
      <p style="margin: 10px 0; font-size: 16px;">[INVOICE_NUMBER]</p>
      <p style="margin: 5px 0; font-size: 14px;">Issued: [ISSUE_DATE]</p>
      <p style="margin: 5px 0; font-size: 14px;">Due: [DUE_DATE]</p>
    </div>
  </div>

  <div style="margin: 40px 0;">
    [ITEMS_TABLE]
  </div>

  <div style="display: grid; grid-template-columns: 1fr 300px; gap: 30px; margin-top: 40px;">
    <div style="padding: 20px; background: #f9fafb; border-radius: 8px;">
      <p style="margin: 0 0 10px 0; font-weight: bold;">Payment Information</p>
      <p style="margin: 5px 0; font-size: 14px;">Bank: [BANK_NAME]</p>
      <p style="margin: 5px 0; font-size: 14px;">IBAN: [IBAN]</p>
      <p style="margin: 5px 0; font-size: 14px;">BIC: [BIC]</p>
    </div>
    <div style="text-align: right;">
      <p style="margin: 8px 0; font-size: 14px;">Subtotal: [SUBTOTAL] [CURRENCY_1]</p>
      <p style="margin: 8px 0; font-size: 14px;">VAT ([TAX_RATE]%): [TAX_AMOUNT] [CURRENCY_1]</p>
      <p style="margin: 8px 0; padding-top: 8px; border-top: 2px solid #2563eb; font-size: 20px; font-weight: bold;">
        [TOTAL] [CURRENCY_1]
      </p>
    </div>
  </div>
</div>`,
  },
];

export default function InvoiceTemplateEditor({
  conferenceId,
  value,
  onChange,
  headerValue = '',
  onHeaderChange,
  footerValue = '',
  onFooterChange,
  disabled = false,
  onSave,
  vatSource,
  pageFormat = 'A4',
  onPageFormatChange,
  templateType = 'bank_transfer',
}: InvoiceTemplateEditorProps) {
  const { showToast } = useToast();
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [showHeader, setShowHeader] = useState(false);
  const [showHeaderHtml, setShowHeaderHtml] = useState(false);
  const [showFooter, setShowFooter] = useState(false);
  const [showFooterHtml, setShowFooterHtml] = useState(false);
  const [formattedHtml, setFormattedHtml] = useState('');
  const [formattedHeaderHtml, setFormattedHeaderHtml] = useState('');
  const [formattedFooterHtml, setFormattedFooterHtml] = useState('');

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        invoice_company_info: {
          vat_source: vatSource || 'company',
        },
        invoice_template_html: value,
        invoice_header_html: headerValue,
        invoice_footer_html: footerValue,
      };

      const res = await api.post(
        `/conferences/${conferenceId}/settings/invoice-settings/preview`,
        payload,
        { responseType: 'blob', params: { template_type: templateType } }
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

  const insertTemplate = (template: (typeof QUICK_TEMPLATES)[0]) => {
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
        {/* Page Format */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Page Format:
          </label>
          <select
            value={pageFormat}
            onChange={(e) => onPageFormatChange?.(e.target.value)}
            disabled={disabled}
            className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {PAGE_FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label} — {format.region}
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
            {QUICK_TEMPLATES.map((template, idx) => (
              <button
                key={idx}
                onClick={() => insertTemplate(template)}
                disabled={disabled}
                className="block w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg disabled:opacity-50"
              >
                <div className="font-medium">{template.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Professional invoice layout
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
              // Switching TO html view — format the current value
              setFormattedHtml(formatHtml(value));
            } else {
              // Switching BACK to visual — push edited HTML into the editor
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
            /* Raw HTML Code Editor */
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
            /* Visual Rich Text Editor */
            <div className="flex justify-center">
              <div className="relative">
                {/* Page format label */}
                <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {PAGE_FORMATS.find((f) => f.value === pageFormat)?.label ?? pageFormat}
                </div>
                {/* Page sheet */}
                <div
                  className="bg-white dark:bg-gray-800 shadow-lg border border-gray-300 dark:border-gray-600"
                  style={{
                    width: `${PAGE_FORMATS.find((f) => f.value === pageFormat)?.width ?? 794}px`,
                    minHeight: `${PAGE_FORMATS.find((f) => f.value === pageFormat)?.height ?? 1123}px`,
                  }}
                >
                  <RichTextEditor
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    rows={28}
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
            <div className="p-2 space-y-3">
              {TEMPLATE_PLACEHOLDERS.map((category) => (
                <div key={category.category}>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1 mb-1.5 uppercase tracking-wider">
                    {category.category}
                  </h4>
                  <div className="space-y-0.5">
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Page Header Editor */}
      {onHeaderChange && (
        <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHeader(!showHeader)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span>
              Page Header{' '}
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                — fixed at the top of every PDF page (~3 cm)
              </span>
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${showHeader ? 'rotate-180' : ''}`}
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
          {showHeader && (
            <div className="border-t border-gray-200 dark:border-gray-700">
              {/* Header toolbar */}
              <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    if (!showHeaderHtml) {
                      setFormattedHeaderHtml(formatHtml(headerValue));
                    } else {
                      onHeaderChange(formattedHeaderHtml);
                    }
                    setShowHeaderHtml(!showHeaderHtml);
                  }}
                  className={`px-2.5 py-1 text-xs border rounded transition-colors font-mono ${
                    showHeaderHtml
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  &lt;/&gt; HTML
                </button>
              </div>
              {/* Header editor area */}
              <div className="bg-gray-100 dark:bg-gray-900 p-6 flex justify-center overflow-x-auto">
                {showHeaderHtml ? (
                  <textarea
                    value={formattedHeaderHtml}
                    onChange={(e) => setFormattedHeaderHtml(e.target.value)}
                    disabled={disabled}
                    spellCheck={false}
                    className="w-full min-h-40 px-4 py-3 font-mono text-sm leading-relaxed bg-gray-900 text-gray-100 border border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
                    style={{
                      maxWidth: `${PAGE_FORMATS.find((f) => f.value === pageFormat)?.width ?? 794}px`,
                    }}
                  />
                ) : (
                  <div
                    className="bg-white dark:bg-gray-800 shadow-lg border border-gray-300 dark:border-gray-600"
                    style={{
                      width: `${PAGE_FORMATS.find((f) => f.value === pageFormat)?.width ?? 794}px`,
                    }}
                  >
                    <RichTextEditor
                      value={headerValue}
                      onChange={onHeaderChange}
                      disabled={disabled}
                      rows={4}
                      editorClassName="prose-tight"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Page Footer Editor */}
      {onFooterChange && (
        <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFooter(!showFooter)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span>
              Page Footer{' '}
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                — fixed at the bottom of every PDF page (~3 cm)
              </span>
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${showFooter ? 'rotate-180' : ''}`}
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
          {showFooter && (
            <div className="border-t border-gray-200 dark:border-gray-700">
              {/* Footer toolbar */}
              <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    if (!showFooterHtml) {
                      setFormattedFooterHtml(formatHtml(footerValue));
                    } else {
                      onFooterChange(formattedFooterHtml);
                    }
                    setShowFooterHtml(!showFooterHtml);
                  }}
                  className={`px-2.5 py-1 text-xs border rounded transition-colors font-mono ${
                    showFooterHtml
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  &lt;/&gt; HTML
                </button>
              </div>
              {/* Footer editor area */}
              <div className="bg-gray-100 dark:bg-gray-900 p-6 flex justify-center overflow-x-auto">
                {showFooterHtml ? (
                  <textarea
                    value={formattedFooterHtml}
                    onChange={(e) => setFormattedFooterHtml(e.target.value)}
                    disabled={disabled}
                    spellCheck={false}
                    className="w-full min-h-40 px-4 py-3 font-mono text-sm leading-relaxed bg-gray-900 text-gray-100 border border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
                    style={{
                      maxWidth: `${PAGE_FORMATS.find((f) => f.value === pageFormat)?.width ?? 794}px`,
                    }}
                  />
                ) : (
                  <div
                    className="bg-white dark:bg-gray-800 shadow-lg border border-gray-300 dark:border-gray-600"
                    style={{
                      width: `${PAGE_FORMATS.find((f) => f.value === pageFormat)?.width ?? 794}px`,
                    }}
                  >
                    <RichTextEditor
                      value={footerValue}
                      onChange={onFooterChange}
                      disabled={disabled}
                      rows={4}
                      editorClassName="prose-tight"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewBlobUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-11/12 h-5/6 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Invoice Preview (PDF)
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
                aria-label="Invoice PDF Preview"
              >
                <p className="text-gray-600 dark:text-gray-400">
                  Your browser doesn't support inline PDF viewing.{' '}
                  <a
                    href={previewBlobUrl}
                    download="invoice-preview.pdf"
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
