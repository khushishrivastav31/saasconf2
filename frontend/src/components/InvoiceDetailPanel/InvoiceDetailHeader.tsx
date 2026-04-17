import type { Invoice, InvoiceStatus, InvoiceUpdate } from '../../types';
import { INVOICE_STATUS_COLORS } from '../../config/statusColors';

const STATUS_COLORS = INVOICE_STATUS_COLORS as Record<InvoiceStatus, string>;

export type InvoiceTabId = 'details' | 'line_items' | 'contacts' | 'documents';

interface Props {
  invoice: Invoice;
  formData: InvoiceUpdate;
  activeTab: InvoiceTabId;
  setActiveTab: (tab: InvoiceTabId) => void;
  linkedCreditNote?: Invoice | null;
  onNavigateToInvoice?: (id: string) => void;
}

export default function InvoiceDetailHeader({
  invoice,
  formData,
  activeTab,
  setActiveTab,
  linkedCreditNote,
  onNavigateToInvoice,
}: Props) {
  const tabs: { id: InvoiceTabId; label: string }[] = [
    { id: 'details', label: 'Details' },
    {
      id: 'line_items',
      label: `Line Items${(formData.line_items?.length || 0) > 0 ? ` (${formData.line_items?.length})` : ''}`,
    },
    {
      id: 'contacts',
      label: `Contacts${(formData.contact_persons?.length || 0) > 0 ? ` (${formData.contact_persons?.length})` : ''}`,
    },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {invoice.invoice_number || (
            <span className="text-gray-400 dark:text-gray-500 italic">DRAFT</span>
          )}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[invoice.status]}`}
          >
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{invoice.recipient_name}</span>
        </div>
        {invoice.template_type === 'credit_note' && invoice.related_invoice_id && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Credit note for invoice{' '}
            {onNavigateToInvoice ? (
              <button
                type="button"
                onClick={() => onNavigateToInvoice(invoice.related_invoice_id!)}
                className="text-primary-600 hover:text-primary-700 underline"
              >
                {invoice.related_invoice_number}
              </button>
            ) : (
              invoice.related_invoice_number
            )}
          </p>
        )}
        {invoice.status === 'cancelled' && linkedCreditNote && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Credit note:{' '}
            {onNavigateToInvoice ? (
              <button
                type="button"
                onClick={() => onNavigateToInvoice(linkedCreditNote.id)}
                className="text-primary-600 hover:text-primary-700 underline"
              >
                {linkedCreditNote.invoice_number}
              </button>
            ) : (
              linkedCreditNote.invoice_number
            )}
          </p>
        )}
      </div>

      <div className="flex gap-1 -mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600 bg-primary-50'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
