import RichTextEditor from '../common/RichTextEditor';
import VatNumberInput from '../common/VatNumberInput';
import { COUNTRY_OPTIONS } from '../../config/countries';
import type {
  Invoice,
  InvoiceUpdate,
  InvoiceStatus,
  InvoiceTemplateType,
  PlatformCurrency,
} from '../../types';

const VALID_STATUS_TRANSITIONS: Record<string, InvoiceStatus[]> = {
  sent: ['paid', 'overdue'], // cancelled only via Cancel Invoice button
  overdue: ['paid'], // cancelled only via Cancel Invoice button
  paid: [],
  cancelled: [],
};

const TEMPLATE_TYPE_OPTIONS: { value: InvoiceTemplateType; label: string }[] = [
  { value: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { value: 'credit_card', label: 'Invoice (Credit Card)' },
  { value: 'credit_note', label: 'Credit Note' },
];

interface InvoiceDetailsTabProps {
  invoice: Invoice;
  formData: InvoiceUpdate;
  setFormData: (data: InvoiceUpdate) => void;
  currencies: PlatformCurrency[];
  conferenceCurrency?: string | null;
  readOnly?: boolean;
}

export default function InvoiceDetailsTab({
  invoice,
  formData,
  setFormData,
  currencies,
  conferenceCurrency,
  readOnly = false,
}: InvoiceDetailsTabProps) {
  // Use conference currency if set
  const isCurrencyLocked = !!conferenceCurrency;
  const hasNumber = invoice.invoice_number !== null;
  const isTerminal = invoice.status === 'paid' || invoice.status === 'cancelled';
  const statusTransitions = VALID_STATUS_TRANSITIONS[invoice.status] || [];

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Invoice Number
          </label>
          <input
            type="text"
            disabled
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 sm:text-sm bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400"
            value={hasNumber ? (formData.invoice_number ?? '') : 'Not yet assigned'}
          />
          {!hasNumber && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Assigned when invoice is sent
            </p>
          )}
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
            disabled={readOnly}
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
          {readOnly && statusTransitions.length > 0 ? (
            <select
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.status || invoice.status}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value as InvoiceStatus,
                })
              }
            >
              <option value={invoice.status}>
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </option>
              {statusTransitions.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              disabled
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 sm:text-sm bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400"
              value={
                (formData.status || invoice.status).charAt(0).toUpperCase() +
                (formData.status || invoice.status).slice(1)
              }
            />
          )}
          {isTerminal && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              This is a final status
            </p>
          )}
        </div>
      </div>

      {invoice.template_type === 'credit_note' && invoice.related_invoice_number && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Original Invoice
          </label>
          <input
            type="text"
            disabled
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 sm:text-sm bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400"
            value={invoice.related_invoice_number}
          />
        </div>
      )}

      {invoice.template_type === 'credit_card' && invoice.stripe_payment_link_url && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Payment Link
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              disabled
              className="flex-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 sm:text-sm bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 font-mono text-xs"
              value={invoice.stripe_payment_link_url}
            />
            <a
              href={invoice.stripe_payment_link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap"
            >
              Open Link
            </a>
          </div>
        </div>
      )}

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
            disabled={readOnly}
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
            disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Address Line 1 *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_address_line1 || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_address_line1: e.target.value,
                  })
                }
                disabled={readOnly}
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
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                City *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_city || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_city: e.target.value,
                  })
                }
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Postal Code *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_postal_code || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_postal_code: e.target.value,
                  })
                }
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Country *
              </label>
              <select
                required
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.recipient_country || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipient_country: e.target.value,
                  })
                }
                disabled={readOnly}
              >
                <option value="">Select a country</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <VatNumberInput
              value={formData.recipient_vat_number || ''}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  recipient_vat_number: val,
                })
              }
              country={formData.recipient_country || undefined}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>

      {!isCurrencyLocked && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Financial</h4>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Currency
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
              value={formData.currency || ''}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              disabled={readOnly}
            >
              <option value="">-- Select Currency --</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code} - {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Notes (shown on invoice)
        </label>
        <RichTextEditor
          value={formData.notes || ''}
          onChange={(html) => setFormData({ ...formData, notes: html })}
          rows={3}
          disabled={readOnly}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Internal Comment (not shown on invoice)
        </label>
        <textarea
          className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
          rows={2}
          value={formData.internal_comment || ''}
          onChange={(e) => setFormData({ ...formData, internal_comment: e.target.value })}
          placeholder="Admin-only notes..."
          disabled={readOnly}
        />
      </div>

      {/* Event Timeline - Show payment/refund history */}
      {invoice.events && Array.isArray(invoice.events) && invoice.events.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            Payment & Refund History
          </h4>
          <div className="space-y-3">
            {invoice.events.map((event) => {
              const isError = event.status === 'failed';
              const isSuccess = event.status === 'succeeded';
              const isPending = event.status === 'pending';

              return (
                <div
                  key={event.id}
                  className="flex gap-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-gray-50 dark:bg-gray-900"
                >
                  {/* Icon */}
                  <div className="shrink-0 mt-0.5">
                    {isError && (
                      <svg
                        className="w-5 h-5 text-red-500"
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
                    )}
                    {isSuccess && (
                      <svg
                        className="w-5 h-5 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    {isPending && (
                      <svg
                        className="w-5 h-5 text-yellow-500 animate-spin"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`font-medium ${
                          isError
                            ? 'text-red-700 dark:text-red-400'
                            : isSuccess
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {event.event_type
                          .split('_')
                          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                          .join(' ')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(event.created_at).toLocaleDateString()} at{' '}
                        {new Date(event.created_at).toLocaleTimeString()}
                      </p>
                    </div>

                    {event.amount && event.currency && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                        Amount: {event.currency} {event.amount.toFixed(2)}
                      </p>
                    )}

                    {event.user_email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        By: {event.user_email}
                      </p>
                    )}

                    {event.stripe_object_id && (
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">
                        Stripe ID: {event.stripe_object_id}
                      </p>
                    )}

                    {event.error_message && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Error: {event.error_message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
