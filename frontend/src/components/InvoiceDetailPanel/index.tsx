import { useState, useEffect } from 'react';
import AlertDialog from '../AlertDialog';
import ConfirmDialog from '../ConfirmDialog';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import InvoiceDetailsTab from './InvoiceDetailsTab';
import InvoiceLineItemsTab from './InvoiceLineItemsTab';
import InvoiceContactsTab from './InvoiceContactsTab';
import InvoiceDocumentsTab from './InvoiceDocumentsTab';
import type {
  Invoice,
  InvoiceUpdate,
  InvoiceLineItem,
  InvoiceStatus,
  PlatformCurrency,
  LocationContactPerson,
} from '../../types';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  sent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  overdue: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  cancelled: 'bg-yellow-100 dark:bg-amber-900/30 text-yellow-800 dark:text-amber-300',
};

interface InvoiceDetailPanelProps {
  invoice: Invoice;
  currencies: PlatformCurrency[];
  conferenceCurrency?: string | null;
  onSave: (data: InvoiceUpdate) => Promise<void>;
  onDelete?: (id: string) => void;
}

function emptyLineItem(): InvoiceLineItem {
  return { description: '', quantity: 1, unit_price: 0, total: 0 };
}

export default function InvoiceDetailPanel({
  invoice,
  currencies,
  conferenceCurrency,
  onSave,
  onDelete,
}: InvoiceDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'line_items' | 'contacts' | 'documents'>(
    'details'
  );
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const isDraft = invoice.status === 'draft';
  const readOnly = !isDraft;
  const isTerminal = invoice.status === 'paid' || invoice.status === 'cancelled';
  const hasStatusTransitions = readOnly && !isTerminal;
  const [formData, setFormData] = useState<InvoiceUpdate>({
    invoice_number: invoice.invoice_number ?? undefined,
    template_type: invoice.template_type || 'bank_transfer',
    status: invoice.status,
    issue_date: invoice.issue_date || '',
    due_date: invoice.due_date || '',
    recipient_name: invoice.recipient_name,
    recipient_email: invoice.recipient_email || '',
    recipient_address_line1: invoice.recipient_address_line1 || '',
    recipient_address_line2: invoice.recipient_address_line2 || '',
    recipient_city: invoice.recipient_city || '',
    recipient_state: invoice.recipient_state || '',
    recipient_postal_code: invoice.recipient_postal_code || '',
    recipient_country: invoice.recipient_country || '',
    recipient_vat_number: invoice.recipient_vat_number || '',
    line_items: invoice.line_items?.length ? invoice.line_items : [],
    subtotal: invoice.subtotal ?? undefined,
    tax_rate: invoice.tax_rate ?? undefined,
    tax_amount: invoice.tax_amount ?? undefined,
    total: invoice.total ?? undefined,
    currency: invoice.currency || '',
    notes: invoice.notes || '',
    internal_comment: invoice.internal_comment || '',
    contact_persons: invoice.contact_persons || [],
    is_active: invoice.is_active,
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validationAlert, setValidationAlert] = useState<string | null>(null);

  // Reset form when invoice changes
  useEffect(() => {
    setActiveTab('details');
    setFormData({
      invoice_number: invoice.invoice_number ?? undefined,
      template_type: invoice.template_type || 'bank_transfer',
      status: invoice.status,
      issue_date: invoice.issue_date || '',
      due_date: invoice.due_date || '',
      recipient_name: invoice.recipient_name,
      recipient_email: invoice.recipient_email || '',
      recipient_address_line1: invoice.recipient_address_line1 || '',
      recipient_address_line2: invoice.recipient_address_line2 || '',
      recipient_city: invoice.recipient_city || '',
      recipient_state: invoice.recipient_state || '',
      recipient_postal_code: invoice.recipient_postal_code || '',
      recipient_country: invoice.recipient_country || '',
      recipient_vat_number: invoice.recipient_vat_number || '',
      line_items: invoice.line_items?.length ? invoice.line_items : [],
      subtotal: invoice.subtotal ?? undefined,
      tax_rate: invoice.tax_rate ?? undefined,
      tax_amount: invoice.tax_amount ?? undefined,
      total: invoice.total ?? undefined,
      currency: invoice.currency || '',
      notes: invoice.notes || '',
      internal_comment: invoice.internal_comment || '',
      contact_persons: invoice.contact_persons || [],
      is_active: invoice.is_active,
    });
    setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id]);

  // Recalculate totals when line items or tax rate change
  const recalculate = (items: InvoiceLineItem[], taxRate?: number) => {
    const subtotal = items.reduce((sum, li) => sum + (li.total || 0), 0);
    const rate = taxRate ?? formData.tax_rate ?? 0;
    const taxAmount = subtotal * (rate / 100);
    const total = subtotal + taxAmount;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const items = [...(formData.line_items || [])];
    const item = { ...items[index] };

    if (field === 'description') {
      item.description = value as string;
    } else {
      item[field] = Number(value) || 0;
    }

    // Auto-calculate line total
    if (field === 'quantity' || field === 'unit_price') {
      item.total = Math.round(item.quantity * item.unit_price * 100) / 100;
    }

    items[index] = item;
    const totals = recalculate(items);
    setFormData({ ...formData, line_items: items, ...totals });
  };

  const addLineItem = () => {
    const items = [...(formData.line_items || []), emptyLineItem()];
    setFormData({ ...formData, line_items: items });
  };

  const removeLineItem = (index: number) => {
    const items = (formData.line_items || []).filter((_, i) => i !== index);
    const totals = recalculate(items);
    setFormData({ ...formData, line_items: items, ...totals });
  };

  const handleTaxRateChange = (rate: number) => {
    const totals = recalculate(formData.line_items || [], rate);
    setFormData({ ...formData, tax_rate: rate, ...totals });
  };

  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setFormData({
        ...formData,
        contact_persons: [...(formData.contact_persons || []), { ...newContact }],
      });
      setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    }
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      contact_persons: formData.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateContact = (index: number, contact: LocationContactPerson) => {
    setFormData({
      ...formData,
      contact_persons: formData.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (readOnly) {
      // Non-draft: only send status changes
      if (formData.status !== invoice.status) {
        setSaving();
        try {
          await onSave({ status: formData.status });
          setSaved();
        } catch {
          setError();
        }
      }
      return;
    }

    // Validate required fields
    const missing: string[] = [];
    if (!formData.recipient_name?.trim()) missing.push('Recipient Name');
    if (!formData.currency?.trim() && !conferenceCurrency) missing.push('Currency');
    const emptyItems = (formData.line_items || []).filter((li) => !li.description?.trim());
    if (emptyItems.length > 0) missing.push('Description for all Line Items');

    if (missing.length > 0) {
      setValidationAlert(
        `Please fill in the following required fields:\n\n- ${missing.join('\n- ')}`
      );
      return;
    }

    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...newContact }];
    }
    setSaving();
    try {
      await onSave(finalData);
      setSaved();
    } catch {
      setError();
    }
  };

  const handleSendInvoice = async () => {
    // Validate required fields before sending
    const missing: string[] = [];
    if (!formData.recipient_name?.trim()) missing.push('Recipient Name');
    if (!formData.currency?.trim() && !conferenceCurrency) missing.push('Currency');
    if ((formData.line_items || []).length === 0) missing.push('At least one Line Item');
    const emptyItems = (formData.line_items || []).filter((li) => !li.description?.trim());
    if (emptyItems.length > 0) missing.push('Description for all Line Items');

    if (missing.length > 0) {
      setValidationAlert(
        `Please fill in the following required fields before sending:\n\n- ${missing.join('\n- ')}`
      );
      return;
    }

    setShowSendConfirm(true);
  };

  const confirmSendInvoice = async () => {
    setShowSendConfirm(false);
    setIsSending(true);
    try {
      // First save all draft data, then change status to sent
      const finalData = { ...formData, status: 'sent' as InvoiceStatus };
      if (newContact.first_name.trim() && newContact.last_name.trim()) {
        finalData.contact_persons = [...(finalData.contact_persons || []), { ...newContact }];
      }
      await onSave(finalData);
    } catch {
      setError();
    } finally {
      setIsSending(false);
    }
  };

  const tabs = [
    { id: 'details' as const, label: 'Details' },
    {
      id: 'line_items' as const,
      label: `Line Items${(formData.line_items?.length || 0) > 0 ? ` (${formData.line_items?.length})` : ''}`,
    },
    {
      id: 'contacts' as const,
      label: `Contacts${(formData.contact_persons?.length || 0) > 0 ? ` (${formData.contact_persons?.length})` : ''}`,
    },
    { id: 'documents' as const, label: 'Documents' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col h-full">
      {/* Header */}
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
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {invoice.recipient_name}
            </span>
          </div>
        </div>

        {/* Tab bar */}
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <form id="invoice-detail-form" onSubmit={handleSubmit}>
          {activeTab === 'details' && (
            <InvoiceDetailsTab
              invoice={invoice}
              formData={formData}
              setFormData={setFormData}
              currencies={currencies}
              conferenceCurrency={conferenceCurrency}
              readOnly={readOnly}
            />
          )}

          {activeTab === 'line_items' && (
            <InvoiceLineItemsTab
              formData={formData}
              updateLineItem={updateLineItem}
              addLineItem={addLineItem}
              removeLineItem={removeLineItem}
              handleTaxRateChange={handleTaxRateChange}
              readOnly={readOnly}
            />
          )}

          {activeTab === 'contacts' && (
            <InvoiceContactsTab
              contacts={formData.contact_persons || []}
              newContact={newContact}
              setNewContact={setNewContact}
              addContact={addContact}
              removeContact={removeContact}
              updateContact={updateContact}
              readOnly={readOnly}
            />
          )}
        </form>

        {activeTab === 'documents' && <InvoiceDocumentsTab invoiceId={invoice.id} />}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center shrink-0">
        {isDraft && onDelete ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-300 rounded-md transition-colors"
          >
            Delete
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <button
                type="submit"
                form="invoice-detail-form"
                disabled={saveStatus === 'saving'}
                className={`px-4 py-1.5 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50 transition-colors duration-200 ${
                  saveStatus === 'saved'
                    ? 'bg-green-600'
                    : saveStatus === 'error'
                      ? 'bg-red-600'
                      : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {saveStatus === 'saving'
                  ? 'Saving...'
                  : saveStatus === 'saved'
                    ? 'Saved'
                    : saveStatus === 'error'
                      ? 'Save failed'
                      : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={handleSendInvoice}
                disabled={isSending}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md disabled:opacity-50 transition-colors"
              >
                {isSending ? 'Sending...' : 'Send Invoice'}
              </button>
            </>
          )}
          {readOnly && hasStatusTransitions && (
            <button
              type="submit"
              form="invoice-detail-form"
              disabled={saveStatus === 'saving' || formData.status === invoice.status}
              className={`px-4 py-1.5 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50 transition-colors duration-200 ${
                saveStatus === 'saved'
                  ? 'bg-green-600'
                  : saveStatus === 'error'
                    ? 'bg-red-600'
                    : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {saveStatus === 'saving'
                ? 'Updating...'
                : saveStatus === 'saved'
                  ? 'Updated'
                  : saveStatus === 'error'
                    ? 'Update failed'
                    : 'Update Status'}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${invoice.invoice_number || 'DRAFT'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.(invoice.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <AlertDialog
        open={!!validationAlert}
        title="Missing Required Fields"
        message={validationAlert || ''}
        variant="warning"
        onClose={() => setValidationAlert(null)}
      />

      <ConfirmDialog
        open={showSendConfirm}
        title="Send Invoice"
        message="This will assign an invoice number and mark the invoice as sent. After sending, only the status can be changed. This action cannot be undone."
        confirmLabel="Send Invoice"
        onConfirm={confirmSendInvoice}
        onCancel={() => setShowSendConfirm(false)}
      />
    </div>
  );
}
