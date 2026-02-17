import { useState, useEffect } from 'react';
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
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-yellow-100 text-yellow-800',
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
  const [formData, setFormData] = useState<InvoiceUpdate>({
    invoice_number: invoice.invoice_number,
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

  // Reset form when invoice changes
  useEffect(() => {
    setActiveTab('details');
    setFormData({
      invoice_number: invoice.invoice_number,
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
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-900">{invoice.invoice_number}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[invoice.status]}`}
            >
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </span>
            <span className="text-sm text-gray-500">{invoice.recipient_name}</span>
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
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
              formData={formData}
              setFormData={setFormData}
              currencies={currencies}
              conferenceCurrency={conferenceCurrency}
            />
          )}

          {activeTab === 'line_items' && (
            <InvoiceLineItemsTab
              formData={formData}
              updateLineItem={updateLineItem}
              addLineItem={addLineItem}
              removeLineItem={removeLineItem}
              handleTaxRateChange={handleTaxRateChange}
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
            />
          )}
        </form>

        {activeTab === 'documents' && <InvoiceDocumentsTab invoiceId={invoice.id} />}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
        {onDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-300 rounded-md transition-colors"
          >
            Delete
          </button>
        )}
        {!onDelete && <div />}
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
          {saveStatus === 'saving' ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Saving...
            </span>
          ) : saveStatus === 'saved' ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          ) : saveStatus === 'error' ? (
            'Save failed'
          ) : (
            'Save Changes'
          )}
        </button>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${invoice.invoice_number}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.(invoice.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
