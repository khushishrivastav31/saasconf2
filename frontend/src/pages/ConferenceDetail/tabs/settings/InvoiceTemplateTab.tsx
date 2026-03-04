import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import InvoiceTemplateEditor from '../../../../components/InvoiceTemplateEditor';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../types';

interface FiscalRepresentative {
  id: string;
  name: string;
  conference_vat_number: string | null;
}

const TEMPLATE_TYPES = [
  { key: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { key: 'credit_card', label: 'Invoice (Credit Card)' },
  { key: 'credit_note', label: 'Credit Note' },
] as const;

type TemplateTypeKey = (typeof TEMPLATE_TYPES)[number]['key'];

export default function InvoiceTemplateTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Active template tab
  const [activeType, setActiveType] = useState<TemplateTypeKey>('bank_transfer');

  // Template state — one HTML body per type
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [vatSource, setVatSource] = useState<string>('company');
  const [footerHtml, setFooterHtml] = useState('');
  const [pageFormat, setPageFormat] = useState<string>('A4');

  // UI state
  const [error, setError] = useState<string | null>(null);

  // Fetch invoice settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/invoice-settings`);
      return res.data;
    },
  });

  // Fetch fiscal representative
  const { data: fiscalRep } = useQuery<FiscalRepresentative | null>({
    queryKey: queryKeys.fiscal.representative(conference.id),
    queryFn: async () => {
      try {
        const res = await api.get(`/conferences/${conference.id}/fiscal-representative`);
        return res.data;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'response' in err &&
          (err as { response?: { status?: number } }).response?.status === 404
        ) {
          return null;
        }
        throw err;
      }
    },
  });

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      const info = settings.invoice_company_info || {};
      setVatSource(info.vat_source || 'company');
      setFooterHtml(settings.invoice_footer_html || '');
      setPageFormat(settings.invoice_page_format || 'A4');

      // Load templates dict, falling back to legacy single-template
      const loaded: Record<string, string> = { ...(settings.invoice_templates || {}) };
      if (!loaded.bank_transfer && settings.invoice_template_html) {
        loaded.bank_transfer = settings.invoice_template_html;
      }
      // Copy bank_transfer content to empty templates so all three start with the same base
      const base = loaded.bank_transfer || '';
      if (base) {
        if (!loaded.credit_card) loaded.credit_card = base;
        if (!loaded.credit_note) loaded.credit_note = base;
      }
      setTemplates(loaded);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        invoice_company_info: {
          vat_source: vatSource,
        },
        invoice_templates: templates,
        invoice_template_html: templates.bank_transfer || '',
        invoice_footer_html: footerHtml,
        invoice_page_format: pageFormat,
      };

      const res = await api.put(`/conferences/${conference.id}/settings/invoice-settings`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conference.id) });
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

  if (settingsLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  const hasFiscalRep = fiscalRep !== null;
  const currentHtml = templates[activeType] || '';

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {/* VAT Source Selector (only if fiscal rep exists) */}
      {hasFiscalRep && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            VAT Number Source
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Choose which VAT number to use in the [COMPANY_TAX_ID] placeholder. Both VAT numbers are
            available as separate placeholders: [COMPANY_VAT] and [FISCAL_REP_VAT].
          </p>
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="vat-source"
                value="company"
                checked={vatSource === 'company'}
                onChange={(e) => setVatSource(e.target.value)}
                disabled={!isAdmin}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Use Company VAT (default)
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="vat-source"
                value="fiscal_rep"
                checked={vatSource === 'fiscal_rep'}
                onChange={(e) => setVatSource(e.target.value)}
                disabled={!isAdmin}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Use Fiscal Representative VAT ({fiscalRep?.name})
              </span>
            </label>
          </div>
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
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tt.label}
              {templates[tt.key] ? '' : ' (empty)'}
            </button>
          ))}

          {/* Duplicate from dropdown */}
          {isAdmin && (
            <div className="relative ml-auto group">
              <button className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
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
          )}
        </div>
      </div>

      {/* Template Editor - full width, no card wrapper */}
      <InvoiceTemplateEditor
        conferenceId={conference.id}
        value={currentHtml}
        onChange={handleTemplateChange}
        footerValue={footerHtml}
        onFooterChange={setFooterHtml}
        disabled={!isAdmin}
        onSave={isAdmin ? handleSave : undefined}
        vatSource={vatSource}
        pageFormat={pageFormat}
        onPageFormatChange={setPageFormat}
        templateType={activeType}
      />
    </div>
  );
}
