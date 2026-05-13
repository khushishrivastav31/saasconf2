import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../../../../config/api';
import type { Conference, Invoice } from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import { formatNumber } from '../../../../utils/formatCurrency';
import InvoiceDetailPanel from '../../../../components/InvoiceDetailPanel';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import AlertDialog from '../../../../components/AlertDialog';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { useSelection } from '../../SelectionContext';
import { useToast } from '../../../../components/Toast';
import { useMyCompanyAccountingEmail } from '../../../../hooks/useMyCompanyAccountingEmail';
import { useInvoiceFilters } from './useInvoiceFilters';
import { useInvoiceMutations } from './useInvoiceMutations';
import { useInvoiceCreateForm } from './useInvoiceCreateForm';
import InvoiceSearchFilters from './InvoiceSearchFilters';
import CreateInvoiceForm from './CreateInvoiceForm';
import InvoicePdfPreview from './InvoicePdfPreview';
import InvoiceListTable from './InvoiceListTable';
import InvoiceDetailHeader from './InvoiceDetailHeader';

export default function ConferenceInvoicesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { selectedInvoiceId, setSelectedInvoiceId } = useSelection();
  const { showToast } = useToast();
  // QA 4.1.5: warn before the admin clicks Send if the tenant's
  // accounting_email isn't configured — the backend currently 422s with
  // "Set Accounting Email on My Company..." and nothing primes the user.
  const accountingEmail = useMyCompanyAccountingEmail();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const onCreatedRef = useRef<() => void>(() => {});

  const {
    search,
    setSearch,
    debouncedSearch,
    filterStatus,
    setFilterStatus,
    filterType,
    setFilterType,
    filterDateFrom,
    setFilterDateFrom,
    filterDateTo,
    setFilterDateTo,
    hasActiveFilters,
    clearAllFilters,
  } = useInvoiceFilters();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('invoice');
    if (invoiceId && invoiceId !== selectedInvoiceId) {
      setSelectedInvoiceId(invoiceId);
      params.delete('invoice');
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [selectedInvoiceId, setSelectedInvoiceId]);

  const isCurrencyLocked = !!conference.currency;

  const fmtAmount = useCallback(
    (value: number | null | undefined) =>
      formatNumber(value ?? 0, {
        decimalSeparator: (conference.settings?.decimal_separator as string) || '.',
        thousandsSeparator: (conference.settings?.thousands_separator as string) || ',',
        decimalPlaces: 2,
      }),
    [conference.settings]
  );

  const {
    listQuery,
    currenciesQuery,
    taxInfoQuery,
    createMutation,
    updateMutation,
    deleteMutation,
    cancelMutation,
    replaceMutation,
    refundMutation,
    convertToCreditCardMutation,
    markPaidMutation,
    reopenMutation,
    syncPaymentMutation,
    sendMutation,
  } = useInvoiceMutations({
    conferenceId: conference.id,
    debouncedSearch,
    filterStatus,
    filterType,
    filterDateFrom,
    filterDateTo,
    showToast,
    setError,
    setSelectedInvoiceId,
    onCreated: () => onCreatedRef.current(),
  });

  const {
    createForm,
    setCreateForm,
    createNewContact,
    setCreateNewContact,
    autoCalculateVat,
    setAutoCalculateVat,
    isLoadingVatPreview,
    setIsLoadingVatPreview,
    emailError,
    setEmailError,
    validationAlert,
    setValidationAlert,
    resetForm,
    addLineItem,
    removeLineItem,
    updateLineItem,
    handleTaxRateChange,
    handleRecipientSelect,
    handleManualEntry,
    handleCreateSubmit,
    addCreateContact,
    removeCreateContact,
    updateCreateContact,
  } = useInvoiceCreateForm({
    conference,
    taxInfo: taxInfoQuery.data,
    createMutation,
  });

  onCreatedRef.current = () => {
    setIsAdding(false);
    resetForm();
  };

  const { data, isLoading } = listQuery;
  const selectedInvoice = data?.items?.find((inv) => inv.id === selectedInvoiceId);
  const invoiceCount = data?.total || 0;

  const downloadPDF = async (invoiceId: string, invoiceNumber: string | null) => {
    try {
      const res = await api.get(`/conferences/${conference.id}/invoices/${invoiceId}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${invoiceNumber || 'draft'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(parseApiError(err, 'Failed to download PDF'));
    }
  };

  const viewPDF = async (invoiceId: string) => {
    try {
      const res = await api.get(`/conferences/${conference.id}/invoices/${invoiceId}/pdf`, {
        responseType: 'arraybuffer',
      });
      setPdfBytes(new Uint8Array(res.data));
    } catch (err) {
      setError(parseApiError(err, 'Failed to view PDF'));
    }
  };

  const closePdfViewer = () => setPdfBytes(null);

  const handleCancelCreate = () => {
    setIsAdding(false);
    setError(null);
    resetForm();
  };

  return (
    <div>
      {selectedInvoice ? (
        <>
          <InvoiceDetailHeader
            hasPdf={!!pdfBytes}
            onBack={() => {
              closePdfViewer();
              setSelectedInvoiceId(null);
            }}
            onTogglePdf={() => (pdfBytes ? closePdfViewer() : viewPDF(selectedInvoice.id))}
            onDownload={() => downloadPDF(selectedInvoice.id, selectedInvoice.invoice_number)}
          />

          <ErrorBanner message={error} />

          {pdfBytes && <InvoicePdfPreview pdfBytes={pdfBytes} />}

          <InvoiceDetailPanel
            invoice={selectedInvoice}
            currencies={currenciesQuery.data || []}
            conferenceCurrency={conference.currency}
            onSave={async (invoiceData) => {
              await updateMutation.mutateAsync({
                id: selectedInvoice.id,
                data: invoiceData,
              });
            }}
            onSend={async (id) => {
              await sendMutation.mutateAsync(id);
            }}
            onDelete={(id) => deleteMutation.mutate(id)}
            onCancel={(id, reason, cancel_registrations, cancellation_email_message) =>
              cancelMutation.mutate({
                id,
                reason,
                cancel_registrations,
                cancellation_email_message,
              })
            }
            onReplace={(id, request) => replaceMutation.mutate({ id, request })}
            onRefund={async (id) => {
              await refundMutation.mutateAsync(id);
            }}
            onConvertToCreditCard={async (id) => {
              await convertToCreditCardMutation.mutateAsync(id);
            }}
            onMarkPaid={(id, payment_date, comment) =>
              markPaidMutation.mutate({ id, payment_date, comment })
            }
            onReopen={(id, comment) => reopenMutation.mutate({ id, comment })}
            onNavigateToInvoice={(id) => setSelectedInvoiceId(id)}
            linkedCreditNote={
              selectedInvoice.status === 'cancelled'
                ? (data?.items.find(
                    (inv) =>
                      inv.template_type === 'credit_note' &&
                      inv.related_invoice_id === selectedInvoice.id
                  ) ?? null)
                : null
            }
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Invoices
                {invoiceCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {invoiceCount}
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage invoices for this conference.
              </p>
            </div>
            {isAdmin && !isAdding && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await syncPaymentMutation.mutateAsync();
                  }}
                  disabled={syncPaymentMutation.isPending}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Check Stripe for payment status updates on all pending credit card invoices"
                >
                  {syncPaymentMutation.isPending ? 'Syncing...' : '⟳ Sync Stripe Payments'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(true);
                    setError(null);
                  }}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
                >
                  + Add Invoice
                </button>
              </div>
            )}
          </div>

          <ErrorBanner message={error} />

          {!accountingEmail.isLoading && !accountingEmail.isConfigured && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <span className="font-medium">Accounting email not configured.</span> Sending invoices
              or credit notes will fail. Set it on{' '}
              <a href="/my-company" className="underline font-medium hover:no-underline">
                My Company
              </a>{' '}
              before sending.
            </div>
          )}

          {!isAdding && (
            <InvoiceSearchFilters
              search={search}
              onSearchChange={setSearch}
              onClearSearch={() => {
                setSearch('');
              }}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterType={filterType}
              setFilterType={setFilterType}
              filterDateFrom={filterDateFrom}
              setFilterDateFrom={setFilterDateFrom}
              filterDateTo={filterDateTo}
              setFilterDateTo={setFilterDateTo}
              hasActiveFilters={hasActiveFilters}
              onClearAllFilters={clearAllFilters}
            />
          )}

          {isAdding && (
            <CreateInvoiceForm
              conference={conference}
              form={createForm}
              setForm={setCreateForm}
              newContact={createNewContact}
              setNewContact={setCreateNewContact}
              autoCalculateVat={autoCalculateVat}
              setAutoCalculateVat={setAutoCalculateVat}
              isLoadingVatPreview={isLoadingVatPreview}
              setIsLoadingVatPreview={setIsLoadingVatPreview}
              emailError={emailError}
              setEmailError={setEmailError}
              isPending={createMutation.isPending}
              isCurrencyLocked={isCurrencyLocked}
              currencies={currenciesQuery.data || []}
              fmtAmount={fmtAmount}
              onSubmit={handleCreateSubmit}
              onCancel={handleCancelCreate}
              onRecipientSelect={handleRecipientSelect}
              onManualEntry={handleManualEntry}
              onAddLineItem={addLineItem}
              onRemoveLineItem={removeLineItem}
              onUpdateLineItem={updateLineItem}
              onTaxRateChange={handleTaxRateChange}
              onAddContact={addCreateContact}
              onRemoveContact={removeCreateContact}
              onUpdateContact={updateCreateContact}
            />
          )}

          {isLoading ? (
            <LoadingSpinner />
          ) : data?.items && data.items.length > 0 ? (
            <InvoiceListTable
              invoices={data.items}
              isAdmin={isAdmin}
              fmtAmount={fmtAmount}
              onSelect={setSelectedInvoiceId}
              onDownload={downloadPDF}
              sendMutation={sendMutation}
              deleteMutation={deleteMutation}
              onRequestDelete={setDeleteTarget}
            />
          ) : (
            !isAdding && (
              <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                {hasActiveFilters
                  ? 'No invoices match the current filters.'
                  : 'No invoices yet. Click "+ Add Invoice" to get started.'}
              </div>
            )
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${deleteTarget?.invoice_number || 'DRAFT'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <AlertDialog
        open={!!validationAlert}
        title="Missing Required Fields"
        message={validationAlert || ''}
        variant="warning"
        onClose={() => setValidationAlert(null)}
      />
    </div>
  );
}
