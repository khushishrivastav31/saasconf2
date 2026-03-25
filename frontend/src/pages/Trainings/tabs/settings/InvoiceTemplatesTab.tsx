import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import RichTextEditor from '../../../../components/common/RichTextEditor';

interface TemplateSettings {
  invoice_templates: {
    bank_transfer?: string;
    credit_card?: string;
    credit_note?: string;
  };
  invoice_header_html: string;
  invoice_footer_html: string;
  invoice_page_format: string;
}

const DEFAULTS: TemplateSettings = {
  invoice_templates: {},
  invoice_header_html: '',
  invoice_footer_html: '',
  invoice_page_format: 'A4',
};

const PAGE_FORMATS = ['A4', 'Letter', 'Legal', 'A5', 'B5', 'Tabloid'];

export default function InvoiceTemplatesTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<TemplateSettings>({
    queryKey: [...queryKeys.trainingFinance, 'invoice-templates'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/invoice-templates');
      return res.data;
    },
  });

  const [form, setForm] = useState<TemplateSettings>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  }, [data]);

  const updateTemplate = (key: keyof TemplateSettings['invoice_templates'], value: string) => {
    setForm((prev) => ({
      ...prev,
      invoice_templates: { ...prev.invoice_templates, [key]: value },
    }));
    setIsDirty(true);
  };

  const updateField = (key: keyof Omit<TemplateSettings, 'invoice_templates'>, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const mutation = useMutation({
    mutationFn: async (payload: TemplateSettings) => {
      await api.put('/trainings/finance/invoice-templates', payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Invoice templates saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleDiscard = () => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const sectionClass =
    'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6';

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Invoice Templates
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure invoice body templates, header, footer, and page format for trainings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Discard
            </button>
          )}
          <button
            onClick={() => mutation.mutate(form)}
            disabled={!isDirty || mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Template sections */}
      {(['bank_transfer', 'credit_card', 'credit_note'] as const).map((key) => (
        <div key={key} className={sectionClass}>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 capitalize">
            {key.replace('_', ' ')} Template
          </h4>
          <RichTextEditor
            value={form.invoice_templates[key] || ''}
            onChange={(val) => updateTemplate(key, val)}
            rows={6}
          />
        </div>
      ))}

      {/* Header */}
      <div className={sectionClass}>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Invoice Header
        </h4>
        <RichTextEditor
          value={form.invoice_header_html}
          onChange={(val) => updateField('invoice_header_html', val)}
          rows={4}
        />
      </div>

      {/* Footer */}
      <div className={sectionClass}>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Invoice Footer
        </h4>
        <RichTextEditor
          value={form.invoice_footer_html}
          onChange={(val) => updateField('invoice_footer_html', val)}
          rows={4}
        />
      </div>

      {/* Page Format */}
      <div className={sectionClass}>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Page Format</h4>
        <select
          value={form.invoice_page_format}
          onChange={(e) => updateField('invoice_page_format', e.target.value)}
          className="w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          {PAGE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
