import AlertDialog from '../AlertDialog';
import ConfirmDialog from '../ConfirmDialog';
import ReplaceInvoiceDialog from './ReplaceInvoiceDialog';
import CancelInvoiceDialog from './CancelInvoiceDialog';
import MarkPaidDialog from './MarkPaidDialog';
import ReopenInvoiceDialog from './ReopenInvoiceDialog';
import type { Invoice, InvoiceUpdate, ReplaceInvoiceRequest } from '../../types';

interface Props {
  invoice: Invoice;
  formData: InvoiceUpdate;
  isDraft: boolean;
  validationAlert: string | null;
  onClearValidationAlert: () => void;
  showDeleteConfirm: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  showSendConfirm: boolean;
  onCancelSend: () => void;
  onConfirmSend: () => void;
  showCancelConfirm: boolean;
  onCancelCancel: () => void;
  onConfirmCancel: (
    reason: string,
    cancelRegistrations: boolean,
    emailMessage: string | undefined
  ) => void;
  showReplaceDialog: boolean;
  onCancelReplace: () => void;
  onConfirmReplace: (request: ReplaceInvoiceRequest) => void;
  showRefundConfirm: boolean;
  onCancelRefund: () => void;
  onConfirmRefund: () => void;
  showConvertDialog: boolean;
  onCancelConvert: () => void;
  onConfirmConvert: () => void;
  showMarkPaidDialog: boolean;
  onCancelMarkPaid: () => void;
  onConfirmMarkPaid: (paymentDate: string, comment: string) => void;
  showReopenDialog: boolean;
  onCancelReopen: () => void;
  onConfirmReopen: (comment: string) => void;
}

export default function InvoiceDetailDialogs({
  invoice,
  formData,
  isDraft,
  validationAlert,
  onClearValidationAlert,
  showDeleteConfirm,
  onCancelDelete,
  onConfirmDelete,
  showSendConfirm,
  onCancelSend,
  onConfirmSend,
  showCancelConfirm,
  onCancelCancel,
  onConfirmCancel,
  showReplaceDialog,
  onCancelReplace,
  onConfirmReplace,
  showRefundConfirm,
  onCancelRefund,
  onConfirmRefund,
  showConvertDialog,
  onCancelConvert,
  onConfirmConvert,
  showMarkPaidDialog,
  onCancelMarkPaid,
  onConfirmMarkPaid,
  showReopenDialog,
  onCancelReopen,
  onConfirmReopen,
}: Props) {
  return (
    <>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${invoice.invoice_number || 'DRAFT'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <AlertDialog
        open={!!validationAlert}
        title="Missing Required Fields"
        message={validationAlert || ''}
        variant="warning"
        onClose={onClearValidationAlert}
      />

      <ConfirmDialog
        open={showSendConfirm}
        title={isDraft ? 'Send Invoice' : 'Resend Invoice'}
        message={
          isDraft
            ? `This will assign an invoice number, mark the invoice as sent, and email the PDF to ${formData.recipient_email}. After sending, only the status can be changed.`
            : `This will resend the invoice PDF to ${invoice.recipient_email}.`
        }
        confirmLabel={isDraft ? 'Send Invoice' : 'Resend'}
        variant="warning"
        onConfirm={onConfirmSend}
        onCancel={onCancelSend}
      />

      <CancelInvoiceDialog
        invoice={invoice}
        open={showCancelConfirm}
        onClose={onCancelCancel}
        onConfirm={onConfirmCancel}
      />

      <ReplaceInvoiceDialog
        invoice={invoice}
        open={showReplaceDialog}
        onClose={onCancelReplace}
        onConfirm={onConfirmReplace}
      />

      <ConfirmDialog
        open={showRefundConfirm}
        title="Refund to Stripe"
        message={`This will issue a refund to the customer's credit card via Stripe for the full amount of ${invoice.currency} ${invoice.total?.toFixed(2)}. This action cannot be undone.`}
        confirmLabel="Refund to Stripe"
        variant="warning"
        onConfirm={onConfirmRefund}
        onCancel={onCancelRefund}
      />

      <ConfirmDialog
        open={showConvertDialog}
        title="Convert to Credit Card"
        message={`This will convert this bank transfer invoice to a credit card invoice and generate a Stripe payment link. The invoice will remain in '${invoice.status}' status until the customer pays.`}
        confirmLabel="Convert & Generate Link"
        variant="warning"
        onConfirm={onConfirmConvert}
        onCancel={onCancelConvert}
      />

      <MarkPaidDialog
        invoice={invoice}
        open={showMarkPaidDialog}
        onClose={onCancelMarkPaid}
        onConfirm={onConfirmMarkPaid}
      />

      <ReopenInvoiceDialog
        invoice={invoice}
        open={showReopenDialog}
        onClose={onCancelReopen}
        onConfirm={onConfirmReopen}
      />
    </>
  );
}
