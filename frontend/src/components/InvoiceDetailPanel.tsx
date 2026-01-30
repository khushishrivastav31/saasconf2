import { useState, useEffect } from "react";
import AttachmentList from "./AttachmentList";
import ContactPersonList from "./ContactPersonList";
import ConfirmDialog from "./ConfirmDialog";
import RichTextEditor from "./common/RichTextEditor";
import type {
  Invoice,
  InvoiceUpdate,
  InvoiceLineItem,
  InvoiceStatus,
  PlatformCurrency,
  LocationContactPerson,
} from "../types";

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

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
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.invoice_number}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoice_number: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.status || "draft"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as InvoiceStatus,
                      })
                    }
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.issue_date || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, issue_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Due Date
                  </label>
                  <input
                    type="date"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.due_date || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, due_date: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                  Recipient Information
                </h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Recipient Name *
                      </label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Recipient Email
                      </label>
                      <input
                        type="email"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_email || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_email: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Address Line 1
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_address_line1 || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_address_line1: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Address Line 2
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_address_line2 || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_address_line2: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        City
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_city || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_city: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        State
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_state || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_state: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Postal Code
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_postal_code || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_postal_code: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Country
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.recipient_country || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recipient_country: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      VAT Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., DE123456789"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={formData.recipient_vat_number || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          recipient_vat_number: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                  Financial
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Currency
                    </label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={formData.currency || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, currency: e.target.value })
                      }
                    >
                      <option value="">-- Select Currency --</option>
                      {currencies.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code} - {c.name} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.is_active ?? true}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            is_active: e.target.checked,
                          })
                        }
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Active
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <RichTextEditor
                  value={formData.notes || ""}
                  onChange={(html) =>
                    setFormData({ ...formData, notes: html })
                  }
                  rows={3}
                />
              </div>
            </div>
          )}

          {activeTab === "line_items" && (
            <div className="px-6 py-5">
              <div className="space-y-4">
                {/* Line items table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Description
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">
                          Qty
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                          Unit Price
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                          Total
                        </th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(formData.line_items || []).map((item, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "description",
                                  e.target.value
                                )
                              }
                              placeholder="Item description"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "quantity",
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                              value={item.unit_price}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  "unit_price",
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                            {item.total.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              className="text-gray-400 hover:text-red-500"
                              title="Remove"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={addLineItem}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Line Item
                </button>

                {/* Totals */}
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium text-gray-900">
                      {(formData.subtotal ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Tax Rate (%)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className="w-20 border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={formData.tax_rate ?? ""}
                        onChange={(e) =>
                          handleTaxRateChange(
                            e.target.value ? parseFloat(e.target.value) : 0
                          )
                        }
                      />
                    </div>
                    <span className="font-medium text-gray-900">
                      {(formData.tax_amount ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">
                      {(formData.total ?? 0).toFixed(2)}{" "}
                      {formData.currency || ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "contacts" && (
            <div className="px-6 py-5">
              <ContactPersonList
                contacts={formData.contact_persons || []}
                newContact={newContact}
                setNewContact={setNewContact}
                addContact={addContact}
                removeContact={removeContact}
                updateContact={updateContact}
              />
            </div>
          )}
        </form>

        {activeTab === "documents" && (
          <div className="px-6 py-5">
            <AttachmentList entityType="invoice" entityId={invoice.id} />
          </div>
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
