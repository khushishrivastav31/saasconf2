import { useState } from 'react';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import InvoiceDetailsTab from './InvoiceDetailsTab';
import InvoiceLineItemsTab from './InvoiceLineItemsTab';
import InvoiceContactsTab from './InvoiceContactsTab';
import InvoiceDocumentsTab from './InvoiceDocumentsTab';
import InvoiceDetailHeader from './InvoiceDetailHeader';
import InvoiceVatWarnings from './InvoiceVatWarnings';
import InvoiceDetailFooter from './InvoiceDetailFooter';
import InvoiceDetailDialogs from './InvoiceDetailDialogs';
import { useInvoiceFormState } from './useInvoiceFormState';
import type { Invoice, InvoiceUpdate, PlatformCurrency, ReplaceInvoiceRequest } from '../../types';

interface InvoiceDetailPanelProps {
  invoice: Invoice;
  currencies: PlatformCurrency[];
  conferenceCurrency?: string | null;
  onSave: (data: InvoiceUpdate) => Promise<void>;
  onSend?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onCancel?: (
    id: string,
    reason: string,
    cancelRegistrations?: boolean,
    cancellationEmailMessage?: string
  ) => void;
  onReplace?: (id: string, request: ReplaceInvoiceRequest) => void;
  onRefund?: (id: string) => Promise<void>;
  onConvertToCreditCard?: (id: string) => Promise<void>;
  onMarkPaid?: (id: string, payment_date: string, comment: string) => void;
  onReopen?: (id: string, comment: string) => void;
  onNavigateToInvoice?: (id: string) => void;
  linkedCreditNote?: Invoice | null;
}

export default function InvoiceDetailPanel({
  invoice,
  currencies,
  conferenceCurrency,
  onSave,
  onSend,
  onDelete,
  onCancel,
  onReplace,
  onRefund,
  onConvertToCreditCard,
  onMarkPaid,
  onReopen,
  onNavigateToInvoice,
  linkedCreditNote,
}: InvoiceDetailPanelProps) {
  const {
    formData,
    setFormData,
    newContact,
    setNewContact,
    activeTab,
    setActiveTab,
    updateLineItem,
    addLineItem,
    removeLineItem,
    handleTaxRateChange,
    addContact,
    removeContact,
    updateContact,
  } = useInvoiceFormState(invoice);

  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [validationAlert, setValidationAlert] = useState<string | null>(null);

  const isDraft = invoice.status === 'draft';
  const readOnly = !isDraft;
  const isTerminal = invoice.status === 'paid' || invoice.status === 'cancelled';
  const hasStatusTransitions = readOnly && !isTerminal;
  const isCancellable =
    (invoice.status === 'sent' || invoice.status === 'overdue' || invoice.status === 'paid') &&
    invoice.template_type !== 'credit_note';
  const isReplaceable =
    (invoice.status === 'sent' || invoice.status === 'overdue' || invoice.status === 'paid') &&
    invoice.template_type !== 'credit_note' &&
    !invoice.replaced_by_invoice_id;
  const canRefund =
    invoice.status === 'cancelled' &&
    invoice.template_type === 'credit_card' &&
    !!invoice.stripe_payment_intent_id &&
    !invoice.events.some((e) => e.event_type === 'refund_succeeded');
  const canConvertToCreditCard =
    invoice.template_type === 'bank_transfer' &&
    (invoice.status === 'sent' || invoice.status === 'overdue');
  const canMarkPaid =
    invoice.template_type === 'bank_transfer' &&
    (invoice.status === 'sent' || invoice.status === 'overdue');
  const canReopen =
    invoice.status !== 'draft' &&
    invoice.status !== 'sent' &&
    invoice.template_type !== 'credit_note';
  const canResend =
    (invoice.status === 'sent' || invoice.status === 'overdue') && !!invoice.recipient_email;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (readOnly) {
      if (formData.status !== invoice.status) {
        setSaving();
        try {
          await onSave({ status: formData.status });
          setSaved();
        } catch {
          setError();
        }
      }
      return;
    }

    const missing: string[] = [];
    if (!formData.recipient_name?.trim()) missing.push('Recipient Name');
    if (!formData.currency?.trim() && !conferenceCurrency) missing.push('Currency');
    const emptyItems = (formData.line_items || []).filter((li) => !li.description?.trim());
    if (emptyItems.length > 0) missing.push('Description for all Line Items');

    if (missing.length > 0) {
      setValidationAlert(
        `Please fill in the following required fields:\n\n- ${missing.join('\n- ')}`
      );
      return;
    }

    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...newContact }];
    }
    setSaving();
    try {
      await onSave(finalData);
      setSaved();
    } catch {
      setError();
    }
  };

  const handleSendInvoice = () => {
    const missing: string[] = [];
    if (!formData.recipient_name?.trim()) missing.push('Recipient Name');
    if (!formData.recipient_email?.trim()) missing.push('Recipient Email');
    if (!formData.currency?.trim() && !conferenceCurrency) missing.push('Currency');
    if ((formData.line_items || []).length === 0) missing.push('At least one Line Item');
    const emptyItems = (formData.line_items || []).filter((li) => !li.description?.trim());
    if (emptyItems.length > 0) missing.push('Description for all Line Items');

    if (missing.length > 0) {
      setValidationAlert(
        `Please fill in the following required fields before sending:\n\n- ${missing.join('\n- ')}`
      );
      return;
    }

    setShowSendConfirm(true);
  };

  const confirmSendInvoice = async () => {
    setShowSendConfirm(false);
    setIsSending(true);
    try {
      if (isDraft) {
        const finalData = { ...formData };
        if (newContact.first_name.trim() && newContact.last_name.trim()) {
          finalData.contact_persons = [...(finalData.contact_persons || []), { ...newContact }];
        }
        await onSave(finalData);
      }
      await onSend?.(invoice.id);
    } catch {
      setError();
    } finally {
      setIsSending(false);
    }
  };

  const handleRefund = async () => {
    setShowRefundConfirm(false);
    setIsRefunding(true);
    try {
      await onRefund?.(invoice.id);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleConvert = async () => {
    setShowConvertDialog(false);
    setIsConverting(true);
    try {
      await onConvertToCreditCard?.(invoice.id);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col h-full">
      <InvoiceDetailHeader
        invoice={invoice}
        formData={formData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        linkedCreditNote={linkedCreditNote}
        onNavigateToInvoice={onNavigateToInvoice}
      />

      <InvoiceVatWarnings invoice={invoice} />

      <div className="flex-1 overflow-y-auto">
        <form id="invoice-detail-form" onSubmit={handleSubmit}>
          {activeTab === 'details' && (
            <InvoiceDetailsTab
              invoice={invoice}
              formData={formData}
              setFormData={setFormData}
              currencies={currencies}
              conferenceCurrency={conferenceCurrency}
              readOnly={readOnly}
            />
          )}
          {activeTab === 'line_items' && (
            <InvoiceLineItemsTab
              formData={formData}
              updateLineItem={updateLineItem}
              addLineItem={addLineItem}
              removeLineItem={removeLineItem}
              handleTaxRateChange={handleTaxRateChange}
              readOnly={readOnly}
            />
          )}
          {activeTab === 'contacts' && (
            <InvoiceContactsTab
              contacts={formData.contact_persons || []}
              newContact={newContact}
              setNewContact={setNewContact}
              addContact={addContact}
              removeContact={removeContact}
              updateContact={updateContact}
              readOnly={readOnly}
            />
          )}
        </form>
        {activeTab === 'documents' && <InvoiceDocumentsTab invoiceId={invoice.id} />}
      </div>

      <InvoiceDetailFooter
        invoice={invoice}
        formData={formData}
        isDraft={isDraft}
        readOnly={readOnly}
        hasStatusTransitions={hasStatusTransitions}
        saveStatus={saveStatus}
        isSending={isSending}
        isRefunding={isRefunding}
        isConverting={isConverting}
        canResend={canResend}
        isCancellable={isCancellable}
        isReplaceable={isReplaceable}
        canRefund={canRefund}
        canConvertToCreditCard={canConvertToCreditCard}
        canMarkPaid={canMarkPaid}
        canReopen={canReopen}
        hasDelete={!!onDelete}
        hasCancel={!!onCancel}
        hasReplace={!!onReplace}
        hasRefund={!!onRefund}
        hasConvert={!!onConvertToCreditCard}
        hasMarkPaid={!!onMarkPaid}
        hasReopen={!!onReopen}
        hasSend={!!onSend}
        onDelete={() => setShowDeleteConfirm(true)}
        onCancel={() => setShowCancelConfirm(true)}
        onReplace={() => setShowReplaceDialog(true)}
        onRefund={() => setShowRefundConfirm(true)}
        onConvert={() => setShowConvertDialog(true)}
        onMarkPaid={() => setShowMarkPaidDialog(true)}
        onReopen={() => setShowReopenDialog(true)}
        onSend={handleSendInvoice}
        onResend={() => setShowSendConfirm(true)}
      />

      <InvoiceDetailDialogs
        invoice={invoice}
        formData={formData}
        isDraft={isDraft}
        validationAlert={validationAlert}
        onClearValidationAlert={() => setValidationAlert(null)}
        showDeleteConfirm={showDeleteConfirm}
        onCancelDelete={() => setShowDeleteConfirm(false)}
        onConfirmDelete={() => {
          setShowDeleteConfirm(false);
          onDelete?.(invoice.id);
        }}
        showSendConfirm={showSendConfirm}
        onCancelSend={() => setShowSendConfirm(false)}
        onConfirmSend={confirmSendInvoice}
        showCancelConfirm={showCancelConfirm}
        onCancelCancel={() => setShowCancelConfirm(false)}
        onConfirmCancel={(reason, cancelRegistrations, emailMessage) => {
          setShowCancelConfirm(false);
          onCancel?.(invoice.id, reason, cancelRegistrations, emailMessage);
        }}
        showReplaceDialog={showReplaceDialog}
        onCancelReplace={() => setShowReplaceDialog(false)}
        onConfirmReplace={(request) => {
          onReplace?.(invoice.id, request);
          setShowReplaceDialog(false);
        }}
        showRefundConfirm={showRefundConfirm}
        onCancelRefund={() => setShowRefundConfirm(false)}
        onConfirmRefund={handleRefund}
        showConvertDialog={showConvertDialog}
        onCancelConvert={() => setShowConvertDialog(false)}
        onConfirmConvert={handleConvert}
        showMarkPaidDialog={showMarkPaidDialog}
        onCancelMarkPaid={() => setShowMarkPaidDialog(false)}
        onConfirmMarkPaid={(paymentDate, comment) => {
          setShowMarkPaidDialog(false);
          onMarkPaid?.(invoice.id, paymentDate, comment);
        }}
        showReopenDialog={showReopenDialog}
        onCancelReopen={() => setShowReopenDialog(false)}
        onConfirmReopen={(comment) => {
          setShowReopenDialog(false);
          onReopen?.(invoice.id, comment);
        }}
      />
    </div>
  );
}
