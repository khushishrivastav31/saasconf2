import { useState } from 'react';
import type { Invoice } from '../../types';

interface Props {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onConfirm: (
    reason: string,
    cancelRegistrations: boolean,
    cancellationEmailMessage: string | undefined
  ) => void;
}

export default function CancelInvoiceDialog({ invoice, open, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [cancelRegistrations, setCancelRegistrations] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  if (!open) return null;

  const reset = () => {
    setReason('');
    setCancelRegistrations(false);
    setEmailMessage('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(reason.trim(), cancelRegistrations, emailMessage.trim() || undefined);
    reset();
  };

  const isPaidCreditCard = invoice.status === 'paid' && invoice.template_type === 'credit_card';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-yellow-100 dark:bg-yellow-900/30">
            <svg
              className="w-5 h-5 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Cancel Invoice</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This will cancel invoice &quot;{invoice.invoice_number}&quot; and automatically create
              a credit note.
              {isPaidCreditCard && (
                <strong className="block mt-1 text-amber-600 dark:text-amber-400">
                  A full refund will be issued to the customer via Stripe.
                </strong>
              )}
              {invoice.recipient_email
                ? ` The credit note will be sent to ${invoice.recipient_email} using the email template from settings.`
                : ''}{' '}
              This action cannot be undone.
            </p>
            <label className="block mt-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Reason for cancellation <span className="text-red-500">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="e.g. Duplicate invoice, wrong amount, customer requested cancellation..."
                autoFocus
              />
            </label>
            {invoice.recipient_source_type === 'registration' && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cancelRegistrations}
                    onChange={(e) => {
                      setCancelRegistrations(e.target.checked);
                      if (!e.target.checked) setEmailMessage('');
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Cancel all registrations
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      This will cancel all attendee registrations linked to this invoice and remove
                      their conference access. User accounts will remain active.
                    </p>
                  </div>
                </label>
                {cancelRegistrations && (
                  <label className="block mt-3">
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      Cancellation message to attendees (optional)
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-1">
                      This message will be included in the cancellation email template sent to each
                      attendee.
                    </p>
                    <textarea
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      placeholder="e.g. Unfortunately the event has been cancelled. Full refund has been processed."
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPaidCreditCard
              ? 'Cancel, Refund & Create Credit Note'
              : 'Cancel Invoice & Create Credit Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
