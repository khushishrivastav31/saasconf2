type DetailTab = 'details' | 'line_items';

import { useState, useMemo, useEffect } from 'react';
import type { TrainingInvoice, LineItem, LineItemInput } from './types';
import { formatDate, formatAmount, StatusBadge, TypeBadge } from './formatters';
import LineItemsEditor, { InvoiceTotalsEditor } from './LineItemsEditor';
import DraftDetailsEditor from './DraftDetailsEditor';

function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  inv,
  allInvoices,
  onBack,
  onNavigate,
  onDownloadPdf,
  onResend,
  onCancel,
  onMarkPaid,
  onReplace,
  onSave,
  onSend,
  isResending,
  isMutating,
  isSaving,
  isSending,
}: {
  inv: TrainingInvoice;
  allInvoices: TrainingInvoice[];
  onBack: () => void;
  onNavigate: (id: string) => void;
  onDownloadPdf: () => void;
  onResend: () => void;
  onCancel: () => void;
  onMarkPaid: () => void;
  onReplace: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onSend: (data: Record<string, unknown>) => void;
  isResending: boolean;
  isMutating: boolean;
  isSaving: boolean;
  isSending: boolean;
}) {
  const [tab, setTab] = useState<DetailTab>('details');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const isDraft = inv.status === 'draft';

  // Draft edit state
  const [editRecipientName, setEditRecipientName] = useState(inv.recipient_name);
  const [editRecipientEmail, setEditRecipientEmail] = useState(inv.recipient_email ?? '');
  const [editAddress, setEditAddress] = useState(inv.recipient_address_line1 ?? '');
  const [editCity, setEditCity] = useState(inv.recipient_city ?? '');
  const [editPostalCode, setEditPostalCode] = useState(inv.recipient_postal_code ?? '');
  const [editCountry, setEditCountry] = useState(inv.recipient_country ?? '');
  const [editVat, setEditVat] = useState(inv.recipient_vat_number ?? '');
  const [editIssueDate, setEditIssueDate] = useState(inv.issue_date ?? '');
  const [editDueDate, setEditDueDate] = useState(inv.due_date ?? '');
  const [editNotes, setEditNotes] = useState(inv.notes ?? '');
  const [editLineItems, setEditLineItems] = useState<LineItemInput[]>(() =>
    ((inv.line_items as LineItem[]) ?? []).map((li) => ({
      description: li.description,
      quantity: String(li.quantity),
      unit_price: String(li.unit_price),
    }))
  );
  const [editTaxRate, setEditTaxRate] = useState(
    inv.tax_rate ? String(parseFloat(String(inv.tax_rate))) : '0'
  );

  const editSubtotal = useMemo(
    () =>
      editLineItems.reduce(
        (s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0),
        0
      ),
    [editLineItems]
  );
  const editTaxAmount = useMemo(
    () => (editSubtotal * (parseFloat(editTaxRate) || 0)) / 100,
    [editSubtotal, editTaxRate]
  );
  const editTotal = editSubtotal + editTaxAmount;

  const buildDraftPayload = () => ({
    recipient_name: editRecipientName,
    recipient_email: editRecipientEmail || null,
    recipient_address_line1: editAddress || null,
    recipient_city: editCity || null,
    recipient_postal_code: editPostalCode || null,
    recipient_country: editCountry || null,
    recipient_vat_number: editVat || null,
    issue_date: editIssueDate || null,
    due_date: editDueDate || null,
    notes: editNotes || null,
    line_items: editLineItems
      .filter((li) => li.description.trim())
      .map((li) => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unit_price: parseFloat(li.unit_price) || 0,
        total: (parseFloat(li.quantity) || 1) * (parseFloat(li.unit_price) || 0),
      })),
    subtotal: editSubtotal,
    tax_rate: parseFloat(editTaxRate) || 0,
    tax_amount: editTaxAmount,
    total: editTotal,
  });

  const handleSaveDraft = () => onSave(buildDraftPayload());
  const handleSendDraft = () => onSend(buildDraftPayload());

  // Reset tab when invoice changes
  useEffect(() => {
    setTab('details');
  }, [inv.id]);

  // Find the linked credit note (if this invoice was cancelled)
  const linkedCreditNote = allInvoices.find(
    (i) => i.related_invoice_id === inv.id && i.template_type === 'credit_note'
  );
  // Find the original invoice (if this is a credit note)
  const originalInvoice = inv.related_invoice_id
    ? allInvoices.find((i) => i.id === inv.related_invoice_id)
    : null;

  const canCancel =
    ['sent', 'overdue', 'paid'].includes(inv.status) && inv.template_type !== 'credit_note';
  const canReplace = canCancel;
  const canMarkPaid =
    inv.template_type === 'bank_transfer' && ['sent', 'overdue'].includes(inv.status);
  const canResend = ['sent', 'overdue'].includes(inv.status) && !!inv.recipient_email;

  const lineItems: LineItem[] = (inv.line_items as LineItem[]) ?? [];
  const lineItemCount = lineItems.length;

  return (
    <div>
      {showCancelConfirm && (
        <ConfirmDialog
          message={`Cancel invoice ${inv.invoice_number ?? 'DRAFT'}? A credit note will be created automatically.`}
          confirmLabel="Cancel Invoice"
          onConfirm={() => {
            setShowCancelConfirm(false);
            onCancel();
          }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to invoices list
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {inv.invoice_number ?? 'DRAFT'}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={inv.status} />
            <TypeBadge type={inv.template_type} />
            <span className="text-sm text-gray-500 dark:text-gray-400">{inv.recipient_name}</span>
          </div>
          {/* Links to related invoices */}
          {originalInvoice && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Credit note for{' '}
              <button
                onClick={() => onNavigate(originalInvoice.id)}
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                {originalInvoice.invoice_number ?? 'DRAFT'}
              </button>
            </p>
          )}
          {linkedCreditNote && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Credit note:{' '}
              <button
                onClick={() => onNavigate(linkedCreditNote.id)}
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                {linkedCreditNote.invoice_number ?? 'DRAFT'}
              </button>
            </p>
          )}

          {/* Tabs */}
          <div className="flex gap-0 mt-5 -mb-5 border-b border-gray-200 dark:border-gray-700">
            {(['details', 'line_items'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t === 'details'
                  ? 'Details'
                  : `Line Items${lineItemCount > 0 ? ` (${lineItemCount})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 py-6">
          {tab === 'details' && isDraft && (
            <DraftDetailsEditor
              editRecipientName={editRecipientName}
              setEditRecipientName={setEditRecipientName}
              editRecipientEmail={editRecipientEmail}
              setEditRecipientEmail={setEditRecipientEmail}
              editAddress={editAddress}
              setEditAddress={setEditAddress}
              editCity={editCity}
              setEditCity={setEditCity}
              editPostalCode={editPostalCode}
              setEditPostalCode={setEditPostalCode}
              editCountry={editCountry}
              setEditCountry={setEditCountry}
              editVat={editVat}
              setEditVat={setEditVat}
              editIssueDate={editIssueDate}
              setEditIssueDate={setEditIssueDate}
              editDueDate={editDueDate}
              setEditDueDate={setEditDueDate}
              editNotes={editNotes}
              setEditNotes={setEditNotes}
              templateType={inv.template_type}
              currency={inv.currency}
            />
          )}

          {tab === 'details' && !isDraft && (
            <div className="space-y-6">
              {/* Identification */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Invoice Number
                  </label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                    {inv.invoice_number ?? '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Template Type
                  </label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm">
                    <TypeBadge type={inv.template_type} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Status
                  </label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm">
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Issue Date
                  </label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                    {formatDate(inv.issue_date)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Due Date
                  </label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                    {formatDate(inv.due_date)}
                  </div>
                </div>
              </div>

              {/* Recipient */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Recipient Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Recipient Name
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.recipient_name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Recipient Email
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.recipient_email ?? '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Address Line 1
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.recipient_address_line1 ?? '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      City
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.recipient_city ?? '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Postal Code
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.recipient_postal_code ?? '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Country
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.recipient_country ?? '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      VAT Number
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.recipient_vat_number ?? '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Currency
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {inv.currency ?? '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment link */}
              {inv.stripe_payment_link_url && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Payment Link
                  </label>
                  <a
                    href={inv.stripe_payment_link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    Pay Online
                  </a>
                </div>
              )}

              {/* Notes */}
              {inv.notes && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Notes
                  </label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {inv.notes}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'line_items' && (
            <div>
              {isDraft ? (
                <>
                  <LineItemsEditor
                    items={editLineItems}
                    currency={inv.currency ?? 'EUR'}
                    onChange={setEditLineItems}
                  />
                  <InvoiceTotalsEditor
                    sym={inv.currency === 'EUR' ? '€' : (inv.currency ?? '')}
                    subtotal={editSubtotal}
                    taxRate={editTaxRate}
                    taxAmount={editTaxAmount}
                    total={editTotal}
                    onTaxRateChange={setEditTaxRate}
                  />
                </>
              ) : (
                <>
                  {lineItems.length === 0 ? (
                    <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                      No line items.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm mb-6">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                            Description
                          </th>
                          <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-16">
                            Qty
                          </th>
                          <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-24">
                            Unit Price
                          </th>
                          <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-24">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {lineItems.map((item, i) => (
                          <tr key={i}>
                            <td className="py-2 text-gray-900 dark:text-gray-100">
                              {item.description}
                            </td>
                            <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                              {item.quantity}
                            </td>
                            <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                              {formatAmount(item.unit_price, inv.currency)}
                            </td>
                            <td
                              className={`py-2 text-right font-medium tabular-nums ${Number(item.total) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
                            >
                              {formatAmount(item.total, inv.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                      <span className="tabular-nums text-gray-900 dark:text-gray-100">
                        {formatAmount(inv.subtotal, inv.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">
                        VAT ({inv.tax_rate ? Number(inv.tax_rate).toFixed(2) : '0.00'}%)
                      </span>
                      <span className="tabular-nums text-gray-900 dark:text-gray-100">
                        {formatAmount(inv.tax_amount, inv.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-base pt-1 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-900 dark:text-gray-100">Total</span>
                      <span
                        className={`tabular-nums ${Number(inv.total) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
                      >
                        {formatAmount(inv.total, inv.currency)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-between items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {canCancel && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={isMutating}
                className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
              >
                Cancel Invoice
              </button>
            )}
            {canReplace && (
              <button
                onClick={onReplace}
                disabled={isMutating}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                Replace Invoice
              </button>
            )}
            {canMarkPaid && (
              <button
                onClick={onMarkPaid}
                disabled={isMutating}
                className="px-3 py-1.5 text-sm text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40"
              >
                Mark as Paid
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <>
                <button
                  onClick={handleSaveDraft}
                  disabled={isSaving || isSending}
                  className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                >
                  {isSaving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  onClick={handleSendDraft}
                  disabled={isSaving || isSending}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
                >
                  {isSending ? 'Sending...' : 'Send Invoice'}
                </button>
              </>
            )}
            {canResend && (
              <button
                onClick={onResend}
                disabled={isResending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Resend
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DetailPanel;
