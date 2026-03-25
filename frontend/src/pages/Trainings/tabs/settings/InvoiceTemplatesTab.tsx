/**
 * Invoice Templates Settings Tab (Training)
 *
 * Manages invoice body templates (bank transfer, credit card, credit note),
 * header/footer HTML, and page format. Uses the shared InvoiceTemplateEditor
 * with full placeholder sidebar, quick templates, and PDF preview.
 * Tenant-scoped — shared across all trainings.
 */
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import InvoiceTemplateEditor from '../../../../components/InvoiceTemplateEditor';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';

const TEMPLATE_TYPES = [
  { key: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { key: 'credit_card', label: 'Invoice (Credit Card)' },
  { key: 'credit_note', label: 'Credit Note' },
] as const;

type TemplateTypeKey = (typeof TEMPLATE_TYPES)[number]['key'];

interface TemplateSettings {
  invoice_templates: Record<string, string>;
  invoice_header_html: string;
  invoice_footer_html: string;
  invoice_page_format: string;
}

export default function InvoiceTemplatesTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Active template tab
  const [activeType, setActiveType] = useState<TemplateTypeKey>('bank_transfer');

  // Template state — one HTML body per type
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [headerHtml, setHeaderHtml] = useState('');
  const [footerHtml, setFooterHtml] = useState('');
  const [pageFormat, setPageFormat] = useState<string>('A4');

  // UI state
  const [error, setError] = useState<string | null>(null);

  // Fetch invoice template settings
  const { data: settings, isLoading } = useQuery<TemplateSettings>({
    queryKey: [...queryKeys.trainingFinance, 'invoice-templates'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/invoice-templates');
      return res.data;
    },
  });

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      setHeaderHtml(settings.invoice_header_html || '');
      setFooterHtml(settings.invoice_footer_html || '');
      setPageFormat(settings.invoice_page_format || 'A4');

      const loaded: Record<string, string> = { ...(settings.invoice_templates || {}) };
      // Copy bank_transfer content to empty templates so all three start with the same base
      const base = loaded.bank_transfer || '';
      if (base) {
        if (!loaded.credit_card) loaded.credit_card = base;
        if (!loaded.credit_note) loaded.credit_note = base;
      }
      setTemplates(loaded);
    }
  }, [settings]);

  // Track dirty state
  const isDirty = useMemo(() => {
    if (!settings) return false;
    const serverHeader = settings.invoice_header_html || '';
    const serverFooter = settings.invoice_footer_html || '';
    const serverFormat = settings.invoice_page_format || 'A4';
    if (headerHtml !== serverHeader || footerHtml !== serverFooter || pageFormat !== serverFormat)
      return true;
    const serverTemplates: Record<string, string> = { ...(settings.invoice_templates || {}) };
    const base = serverTemplates.bank_transfer || '';
    if (base) {
      if (!serverTemplates.credit_card) serverTemplates.credit_card = base;
      if (!serverTemplates.credit_note) serverTemplates.credit_note = base;
    }
    return JSON.stringify(templates) !== JSON.stringify(serverTemplates);
  }, [settings, templates, headerHtml, footerHtml, pageFormat]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        invoice_templates: templates,
        invoice_header_html: headerHtml,
        invoice_footer_html: footerHtml,
        invoice_page_format: pageFormat,
      };
      const res = await api.put('/trainings/finance/invoice-templates', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.trainingFinance, 'invoice-templates'],
      });
      showToast('Invoice templates saved successfully', 'success');
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const handleSave = () => {
    setError(null);
    saveMutation.mutate();
  };

  const handleTemplateChange = (html: string) => {
    setTemplates((prev) => ({ ...prev, [activeType]: html }));
  };

  const handleDuplicateFrom = (sourceType: TemplateTypeKey) => {
    const sourceHtml = templates[sourceType] || '';
    setTemplates((prev) => ({ ...prev, [activeType]: sourceHtml }));
    showToast(
      `Copied template from "${TEMPLATE_TYPES.find((t) => t.key === sourceType)?.label}"`,
      'success'
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const currentHtml = templates[activeType] || '';

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {/* Unsaved changes indicator */}
      {isDirty && (
        <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <span className="text-sm text-amber-700 dark:text-amber-300">
            You have unsaved changes
          </span>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Template Type Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1">
          {TEMPLATE_TYPES.map((tt) => (
            <button
              key={tt.key}
              onClick={() => setActiveType(tt.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeType === tt.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tt.label}
              {templates[tt.key] ? '' : ' (empty)'}
            </button>
          ))}

          {/* Duplicate from dropdown */}
          <div className="relative ml-auto group">
            <button className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
              Copy from...
            </button>
            <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {TEMPLATE_TYPES.filter((tt) => tt.key !== activeType).map((tt) => (
                <button
                  key={tt.key}
                  onClick={() => handleDuplicateFrom(tt.key)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {tt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Template Editor — full InvoiceTemplateEditor with placeholders, preview, quick templates */}
      <InvoiceTemplateEditor
        previewUrl="/trainings/finance/invoice-templates/preview"
        value={currentHtml}
        onChange={handleTemplateChange}
        headerValue={headerHtml}
        onHeaderChange={setHeaderHtml}
        footerValue={footerHtml}
        onFooterChange={setFooterHtml}
        onSave={handleSave}
        pageFormat={pageFormat}
        onPageFormatChange={setPageFormat}
        templateType={activeType}
      />
    </div>
  );
}
