import RichTextEditor from "../common/RichTextEditor";
import type {
  InvoiceUpdate,
  InvoiceStatus,
  PlatformCurrency,
} from "../../types";

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

interface InvoiceDetailsTabProps {
  formData: InvoiceUpdate;
  setFormData: (data: InvoiceUpdate) => void;
  currencies: PlatformCurrency[];
}

export default function InvoiceDetailsTab({
  formData,
  setFormData,
  currencies,
}: InvoiceDetailsTabProps) {
  return (
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
  );
}
