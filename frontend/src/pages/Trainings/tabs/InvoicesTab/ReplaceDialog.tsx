import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';
import type { TrainingInvoice } from './types';

export default function ReplaceForm({
  invoice: orig,
  onBack,
  onReplace,
}: {
  invoice: TrainingInvoice;
  onBack: () => void;
  onReplace: (newId: string) => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState('');
  const [recipientName, setRecipientName] = useState(orig.recipient_name ?? '');
  const [recipientEmail, setRecipientEmail] = useState(orig.recipient_email ?? '');
  const [recipientAddress, setRecipientAddress] = useState(orig.recipient_address_line1 ?? '');
  const [recipientCity, setRecipientCity] = useState(orig.recipient_city ?? '');
  const [recipientPostalCode, setRecipientPostalCode] = useState(orig.recipient_postal_code ?? '');
  const [recipientCountry, setRecipientCountry] = useState(orig.recipient_country ?? '');
  const [recipientVat, setRecipientVat] = useState(orig.recipient_vat_number ?? '');

  const replaceMutation = useMutation({
    mutationFn: () => {
      // Only send fields that changed
      const payload: Record<string, string | null> = { reason };
      if (recipientName !== (orig.recipient_name ?? ''))
        payload.recipient_name = recipientName || null;
      if (recipientEmail !== (orig.recipient_email ?? ''))
        payload.recipient_email = recipientEmail || null;
      if (recipientAddress !== (orig.recipient_address_line1 ?? ''))
        payload.recipient_address_line1 = recipientAddress || null;
      if (recipientCity !== (orig.recipient_city ?? ''))
        payload.recipient_city = recipientCity || null;
      if (recipientPostalCode !== (orig.recipient_postal_code ?? ''))
        payload.recipient_postal_code = recipientPostalCode || null;
      if (recipientCountry !== (orig.recipient_country ?? ''))
        payload.recipient_country = recipientCountry || null;
      if (recipientVat !== (orig.recipient_vat_number ?? ''))
        payload.recipient_vat_number = recipientVat || null;
      return api.post(`/trainings/invoices/${orig.id}/replace`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      showToast('Invoice replaced successfully', 'success');
      onReplace(res.data.new_invoice.id);
    },
    onError: () => showToast('Failed to replace invoice', 'error'),
  });

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';
  const isPaid = orig.status === 'paid';
  const isCreditCard = orig.template_type === 'credit_card';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400"
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
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Replace Invoice with Corrected Billing Information
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This will cancel invoice &quot;{orig.invoice_number}&quot; and create a new invoice
                with corrected billing details.
              </p>
            </div>
          </div>
          {isPaid && (
            <p className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400">
              The new invoice will inherit the &quot;paid&quot; status.
            </p>
          )}
          {!isPaid && isCreditCard && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              A new payment link will be created for the replacement invoice.
            </p>
          )}
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Both a credit note and the new invoice will be sent to the recipient.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason for replacement <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Wrong company name and VAT number provided"
              className={inputCls}
            />
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Corrected billing */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Corrected Billing Information
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Company / Recipient Name
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={recipientCity}
                    onChange={(e) => setRecipientCity(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={recipientPostalCode}
                    onChange={(e) => setRecipientPostalCode(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={recipientCountry}
                  onChange={(e) => setRecipientCountry(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  VAT Number
                </label>
                <input
                  type="text"
                  value={recipientVat}
                  onChange={(e) => setRecipientVat(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-end gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => replaceMutation.mutate()}
            disabled={!reason.trim() || replaceMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
          >
            {replaceMutation.isPending ? 'Replacing...' : 'Replace Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}
