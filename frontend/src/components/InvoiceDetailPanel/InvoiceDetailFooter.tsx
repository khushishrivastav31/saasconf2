import type { Invoice, InvoiceUpdate } from '../../types';
import type { SaveStatus } from '../../hooks/useSaveStatus';

interface Props {
  invoice: Invoice;
  formData: InvoiceUpdate;
  isDraft: boolean;
  readOnly: boolean;
  hasStatusTransitions: boolean;
  saveStatus: SaveStatus;
  isSending: boolean;
  isRefunding: boolean;
  isConverting: boolean;
  canResend: boolean;
  isCancellable: boolean;
  isReplaceable: boolean;
  canRefund: boolean;
  canConvertToCreditCard: boolean;
  canMarkPaid: boolean;
  canReopen: boolean;
  hasDelete: boolean;
  hasCancel: boolean;
  hasReplace: boolean;
  hasRefund: boolean;
  hasConvert: boolean;
  hasMarkPaid: boolean;
  hasReopen: boolean;
  hasSend: boolean;
  onDelete: () => void;
  onCancel: () => void;
  onReplace: () => void;
  onRefund: () => void;
  onConvert: () => void;
  onMarkPaid: () => void;
  onReopen: () => void;
  onSend: () => void;
  onResend: () => void;
}

export default function InvoiceDetailFooter({
  invoice,
  formData,
  isDraft,
  readOnly,
  hasStatusTransitions,
  saveStatus,
  isSending,
  isRefunding,
  isConverting,
  canResend,
  isCancellable,
  isReplaceable,
  canRefund,
  canConvertToCreditCard,
  canMarkPaid,
  canReopen,
  hasDelete,
  hasCancel,
  hasReplace,
  hasRefund,
  hasConvert,
  hasMarkPaid,
  hasReopen,
  hasSend,
  onDelete,
  onCancel,
  onReplace,
  onRefund,
  onConvert,
  onMarkPaid,
  onReopen,
  onSend,
  onResend,
}: Props) {
  return (
    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center shrink-0">
      <div className="flex items-center gap-2">
        {isDraft && hasDelete && invoice.template_type !== 'credit_note' && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-md transition-colors"
          >
            Delete
          </button>
        )}
        {isCancellable && hasCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-md transition-colors"
          >
            Cancel Invoice
          </button>
        )}
        {isReplaceable && hasReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="px-4 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-md transition-colors"
          >
            Replace Invoice
          </button>
        )}
        {canRefund && hasRefund && (
          <button
            type="button"
            onClick={onRefund}
            disabled={isRefunding}
            className="px-4 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-md transition-colors disabled:opacity-50"
          >
            {isRefunding ? 'Refunding...' : 'Refund to Stripe'}
          </button>
        )}
        {canConvertToCreditCard && hasConvert && (
          <button
            type="button"
            onClick={onConvert}
            disabled={isConverting}
            className="px-4 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-400 hover:text-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-purple-300 dark:border-purple-700 rounded-md transition-colors disabled:opacity-50"
          >
            {isConverting ? 'Converting...' : 'Convert to Credit Card'}
          </button>
        )}
        {canMarkPaid && hasMarkPaid && (
          <button
            type="button"
            onClick={onMarkPaid}
            className="px-4 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:text-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-md transition-colors"
          >
            Mark as Paid
          </button>
        )}
        {canReopen && hasReopen && (
          <button
            type="button"
            onClick={onReopen}
            className="px-4 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-md transition-colors"
          >
            Reopen
          </button>
        )}
      </div>
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
              onClick={onSend}
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
        {canResend && hasSend && (
          <button
            type="button"
            onClick={onResend}
            disabled={isSending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md disabled:opacity-50 transition-colors"
          >
            {isSending ? 'Sending...' : 'Resend'}
          </button>
        )}
      </div>
    </div>
  );
}
