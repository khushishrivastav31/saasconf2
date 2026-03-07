import { useState } from 'react';
import { COUNTRY_OPTIONS } from '../../config/countries';
import type { Invoice, ReplaceInvoiceRequest } from '../../types';

interface ReplaceInvoiceDialogProps {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onConfirm: (request: ReplaceInvoiceRequest) => void;
}

export default function ReplaceInvoiceDialog({
  invoice,
  open,
  onClose,
  onConfirm,
}: ReplaceInvoiceDialogProps) {
  const [reason, setReason] = useState('');
  const [recipientName, setRecipientName] = useState(invoice.recipient_name || '');
  const [recipientEmail, setRecipientEmail] = useState(invoice.recipient_email || '');
  const [recipientAddress, setRecipientAddress] = useState(invoice.recipient_address_line1 || '');
  const [recipientCity, setRecipientCity] = useState(invoice.recipient_city || '');
  const [recipientPostalCode, setRecipientPostalCode] = useState(
    invoice.recipient_postal_code || ''
  );
  const [recipientCountry, setRecipientCountry] = useState(invoice.recipient_country || '');
  const [recipientVatNumber, setRecipientVatNumber] = useState(invoice.recipient_vat_number || '');
  const [procurementCode, setProcurementCode] = useState(invoice.procurement_code || '');
  const [customMessage, setCustomMessage] = useState('');

  const handleClose = () => {
    setReason('');
    setRecipientName(invoice.recipient_name || '');
    setRecipientEmail(invoice.recipient_email || '');
    setRecipientAddress(invoice.recipient_address_line1 || '');
    setRecipientCity(invoice.recipient_city || '');
    setRecipientPostalCode(invoice.recipient_postal_code || '');
    setRecipientCountry(invoice.recipient_country || '');
    setRecipientVatNumber(invoice.recipient_vat_number || '');
    setProcurementCode(invoice.procurement_code || '');
    setCustomMessage('');
    onClose();
  };

  const handleConfirm = () => {
    const request: ReplaceInvoiceRequest = {
      reason: reason.trim(),
    };

    // Only include fields that have changed
    if (recipientName !== invoice.recipient_name) {
      request.recipient_name = recipientName.trim();
    }
    if (recipientEmail !== invoice.recipient_email) {
      request.recipient_email = recipientEmail.trim();
    }
    if (recipientAddress !== invoice.recipient_address_line1) {
      request.recipient_address_line1 = recipientAddress.trim();
    }
    if (recipientCity !== invoice.recipient_city) {
      request.recipient_city = recipientCity.trim();
    }
    if (recipientPostalCode !== invoice.recipient_postal_code) {
      request.recipient_postal_code = recipientPostalCode.trim();
    }
    if (recipientCountry !== invoice.recipient_country) {
      request.recipient_country = recipientCountry;
    }
    if (recipientVatNumber !== invoice.recipient_vat_number) {
      request.recipient_vat_number = recipientVatNumber.trim();
    }
    if (procurementCode !== invoice.procurement_code) {
      request.procurement_code = procurementCode.trim();
    }
    if (customMessage.trim()) {
      request.custom_email_message = customMessage.trim();
    }

    onConfirm(request);
    handleClose();
  };

  // Check if at least one field has changed
  const hasChanges =
    recipientName !== invoice.recipient_name ||
    recipientEmail !== invoice.recipient_email ||
    recipientAddress !== invoice.recipient_address_line1 ||
    recipientCity !== invoice.recipient_city ||
    recipientPostalCode !== invoice.recipient_postal_code ||
    recipientCountry !== invoice.recipient_country ||
    recipientVatNumber !== invoice.recipient_vat_number ||
    procurementCode !== invoice.procurement_code;

  const isValid = reason.trim() && hasChanges;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Replace Invoice with Corrected Billing Information
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This will cancel invoice &quot;{invoice.invoice_number}&quot; and create a new
                invoice with corrected billing details.
                {invoice.status === 'paid' && (
                  <strong className="block mt-1 text-blue-600 dark:text-blue-400">
                    The new invoice will inherit the &quot;paid&quot; status.
                  </strong>
                )}
                {invoice.status === 'sent' && invoice.template_type === 'credit_card' && (
                  <strong className="block mt-1 text-blue-600 dark:text-blue-400">
                    A new payment link will be created for the replacement invoice.
                  </strong>
                )}{' '}
                Both a credit note and the new invoice will be sent to the recipient. Active
                registrations will remain linked.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Reason */}
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Reason for replacement <span className="text-red-500">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="e.g. Wrong company name and VAT number provided"
              />
            </label>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Corrected Billing Information
              </h4>

              {/* Company/Recipient Name */}
              <label className="block mb-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Company / Recipient Name
                </span>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>

              {/* Email */}
              <label className="block mb-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">Email</span>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>

              {/* Address */}
              <label className="block mb-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">Street Address</span>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>

              {/* City & Postal Code */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label className="block">
                  <span className="text-sm text-gray-600 dark:text-gray-400">City</span>
                  <input
                    type="text"
                    value={recipientCity}
                    onChange={(e) => setRecipientCity(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Postal Code</span>
                  <input
                    type="text"
                    value={recipientPostalCode}
                    onChange={(e) => setRecipientPostalCode(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </label>
              </div>

              {/* Country */}
              <label className="block mb-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">Country</span>
                <select
                  value={recipientCountry}
                  onChange={(e) => setRecipientCountry(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select a country...</option>
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* VAT Number */}
              <label className="block mb-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">VAT Number</span>
                <input
                  type="text"
                  value={recipientVatNumber}
                  onChange={(e) => setRecipientVatNumber(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  placeholder="e.g. DE999888777"
                />
              </label>

              {/* Procurement Code / PO Number */}
              <label className="block mb-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  PO Number / Procurement Code
                </span>
                <input
                  type="text"
                  value={procurementCode}
                  onChange={(e) => setProcurementCode(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>
            </div>

            {/* Custom Email Message */}
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Custom Email Message (Optional)
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-1">
                This message will be included in the email template from settings sent to the
                recipient.
              </p>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="e.g. Please use this corrected invoice for your records."
              />
            </label>

            {!hasChanges && reason.trim() && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  At least one billing field must be different from the original invoice.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Replace Invoice & Create Credit Note
          </button>
        </div>
      </div>
    </div>
  );
}
