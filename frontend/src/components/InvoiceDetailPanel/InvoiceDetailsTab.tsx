import RichTextEditor from '../common/RichTextEditor';
import type {
  InvoiceUpdate,
  InvoiceStatus,
  InvoiceTemplateType,
  PlatformCurrency,
} from '../../types';

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TEMPLATE_TYPE_OPTIONS: { value: InvoiceTemplateType; label: string }[] = [
  { value: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { value: 'credit_card', label: 'Invoice (Credit Card)' },
  { value: 'credit_note', label: 'Credit Note' },
];

interface InvoiceDetailsTabProps {
  formData: InvoiceUpdate;
  setFormData: (data: InvoiceUpdate) => void;
  currencies: PlatformCurrency[];
  conferenceCurrency?: string | null;
}

export default function InvoiceDetailsTab({
  formData,
  setFormData,
  currencies,
  conferenceCurrency,
}: InvoiceDetailsTabProps) {
  // Use conference currency if set
  const isCurrencyLocked = !!conferenceCurrency;
  return (
    <div className="px-6 py-5 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Invoice Number *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Template Type
          </label>
          <select
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            value={formData.template_type || 'bank_transfer'}
            onChange={(e) =>
              setFormData({
                ...formData,
                template_type: e.target.value as InvoiceTemplateType,
              })
            }
          >
            {TEMPLATE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Status
          </label>
          <select
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            value={formData.status || 'draft'}
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Issue Date
          </label>
          <input
            type="date"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            value={formData.issue_date || ''}
            onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Due Date
          </label>
          <input
            type="date"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            value={formData.due_date || ''}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          Recipient Information
        </h4>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Recipient Name *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Recipient Email
              </label>
              <input
                type="email"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_email || ''}
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Address Line 1
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_address_line1 || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_address_line1: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Address Line 2
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_address_line2 || ''}
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                City
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_city || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_city: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                State
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_state || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_state: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Postal Code
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_postal_code || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_postal_code: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Country
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_country || ''}
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              VAT Number
            </label>
            <input
              type="text"
              placeholder="e.g., DE123456789"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.recipient_vat_number || ''}
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

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Financial</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Currency
            </label>
            {isCurrencyLocked ? (
              <input
                type="text"
                value={conferenceCurrency || ''}
                disabled
                title="Set by conference"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800 shadow-sm py-2 px-3 text-sm text-gray-600 dark:text-gray-300"
              />
            ) : (
              <select
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.currency || ''}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              >
                <option value="">-- Select Currency --</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} - {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            )}
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
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <RichTextEditor
          value={formData.notes || ''}
          onChange={(html) => setFormData({ ...formData, notes: html })}
          rows={3}
        />
      </div>
    </div>
  );
}
