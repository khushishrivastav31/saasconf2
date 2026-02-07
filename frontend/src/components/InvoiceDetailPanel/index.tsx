import { useState, useEffect } from "react";
import ConfirmDialog from "../ConfirmDialog";
import InvoiceDetailsTab from "./InvoiceDetailsTab";
import InvoiceLineItemsTab from "./InvoiceLineItemsTab";
import InvoiceContactsTab from "./InvoiceContactsTab";
import InvoiceDocumentsTab from "./InvoiceDocumentsTab";
import type {
  Invoice,
  InvoiceUpdate,
  InvoiceLineItem,
  InvoiceStatus,
  PlatformCurrency,
  LocationContactPerson,
} from "../../types";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-yellow-100 text-yellow-800",
};

interface InvoiceDetailPanelProps {
  invoice: Invoice;
  currencies: PlatformCurrency[];
  onSave: (data: InvoiceUpdate) => void;
  onDelete?: (id: string) => void;
  isSaving: boolean;
}

function emptyLineItem(): InvoiceLineItem {
  return { description: "", quantity: 1, unit_price: 0, total: 0 };
}

export default function InvoiceDetailPanel({
  invoice,
  currencies,
  onSave,
  onDelete,
  isSaving,
}: InvoiceDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<
    "details" | "line_items" | "contacts" | "documents"
  >("details");
  const [formData, setFormData] = useState<InvoiceUpdate>({
    invoice_number: invoice.invoice_number,
    status: invoice.status,
    issue_date: invoice.issue_date || "",
    due_date: invoice.due_date || "",
    recipient_name: invoice.recipient_name,
    recipient_email: invoice.recipient_email || "",
    recipient_address_line1: invoice.recipient_address_line1 || "",
    recipient_address_line2: invoice.recipient_address_line2 || "",
    recipient_city: invoice.recipient_city || "",
    recipient_state: invoice.recipient_state || "",
    recipient_postal_code: invoice.recipient_postal_code || "",
    recipient_country: invoice.recipient_country || "",
    recipient_vat_number: invoice.recipient_vat_number || "",
    line_items: invoice.line_items?.length ? invoice.line_items : [],
    subtotal: invoice.subtotal ?? undefined,
    tax_rate: invoice.tax_rate ?? undefined,
    tax_amount: invoice.tax_amount ?? undefined,
    total: invoice.total ?? undefined,
    currency: invoice.currency || "",
    notes: invoice.notes || "",
    contact_persons: invoice.contact_persons || [],
    is_active: invoice.is_active,
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    comment: "",
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset form when invoice changes
  useEffect(() => {
    setActiveTab("details");
    setFormData({
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      issue_date: invoice.issue_date || "",
      due_date: invoice.due_date || "",
      recipient_name: invoice.recipient_name,
      recipient_email: invoice.recipient_email || "",
      recipient_address_line1: invoice.recipient_address_line1 || "",
      recipient_address_line2: invoice.recipient_address_line2 || "",
      recipient_city: invoice.recipient_city || "",
      recipient_state: invoice.recipient_state || "",
      recipient_postal_code: invoice.recipient_postal_code || "",
      recipient_country: invoice.recipient_country || "",
      recipient_vat_number: invoice.recipient_vat_number || "",
      line_items: invoice.line_items?.length ? invoice.line_items : [],
      subtotal: invoice.subtotal ?? undefined,
      tax_rate: invoice.tax_rate ?? undefined,
      tax_amount: invoice.tax_amount ?? undefined,
      total: invoice.total ?? undefined,
      currency: invoice.currency || "",
      notes: invoice.notes || "",
      contact_persons: invoice.contact_persons || [],
      is_active: invoice.is_active,
    });
    setNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
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

  const updateLineItem = (
    index: number,
    field: keyof InvoiceLineItem,
    value: string | number
  ) => {
    const items = [...(formData.line_items || [])];
    const item = { ...items[index] };

    if (field === "description") {
      item.description = value as string;
    } else {
      item[field] = Number(value) || 0;
    }

    // Auto-calculate line total
    if (field === "quantity" || field === "unit_price") {
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
        contact_persons: [
          ...(formData.contact_persons || []),
          { ...newContact },
        ],
      });
      setNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      contact_persons:
        formData.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateContact = (index: number, contact: LocationContactPerson) => {
    setFormData({
      ...formData,
      contact_persons:
        formData.contact_persons?.map((c, i) => (i === index ? contact : c)) ||
        [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...newContact },
      ];
    }
    onSave(finalData);
  };

  const tabs = [
    { id: "details" as const, label: "Details" },
    {
      id: "line_items" as const,
      label: `Line Items${(formData.line_items?.length || 0) > 0 ? ` (${formData.line_items?.length})` : ""}`,
    },
    {
      id: "contacts" as const,
      label: `Contacts${(formData.contact_persons?.length || 0) > 0 ? ` (${formData.contact_persons?.length})` : ""}`,
    },
    { id: "documents" as const, label: "Documents" },
  ];

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              {invoice.invoice_number}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[invoice.status]}`}
              >
                {invoice.status.charAt(0).toUpperCase() +
                  invoice.status.slice(1)}
              </span>
              <span className="text-sm text-gray-500">
                {invoice.recipient_name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Delete invoice"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
            <button
              type="submit"
              form="invoice-detail-form"
              disabled={isSaving}
              className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
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
                  ? "border-primary-600 text-primary-600 bg-primary-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
          {activeTab === "details" && (
            <InvoiceDetailsTab
              formData={formData}
              setFormData={setFormData}
              currencies={currencies}
            />
          )}

          {activeTab === "line_items" && (
            <InvoiceLineItemsTab
              formData={formData}
              updateLineItem={updateLineItem}
              addLineItem={addLineItem}
              removeLineItem={removeLineItem}
              handleTaxRateChange={handleTaxRateChange}
            />
          )}

          {activeTab === "contacts" && (
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

        {activeTab === "documents" && (
          <InvoiceDocumentsTab invoiceId={invoice.id} />
        )}
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
