import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useInvoiceFilters } from './useInvoiceFilters';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
import type {
  CancelInvoiceResponse,
  Conference,
  ConvertToCreditCardResponse,
  Invoice,
  InvoiceCreate,
  InvoiceUpdate,
  InvoiceLineItem,
  PlatformCurrency,
  PaginatedResponse,
  LocationContactPerson,
  RecipientSearchResult,
  ReplaceInvoiceRequest,
  ReplaceInvoiceResponse,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import { formatNumber } from '../../../../utils/formatCurrency';
import InvoiceDetailPanel from '../../../../components/InvoiceDetailPanel';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import AlertDialog from '../../../../components/AlertDialog';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { ChevronLeftIcon, DeleteIcon } from '../../icons';
import { useSelection } from '../../SelectionContext';
import { useToast } from '../../../../components/Toast';
import { INVOICE_STATUS_COLORS as STATUS_COLORS } from '../../../../config/statusColors';
import InvoiceSearchFilters from './InvoiceSearchFilters';
import CreateInvoiceForm from './CreateInvoiceForm';

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  credit_note: 'Credit Note',
};

export default function ConferenceInvoicesTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { selectedInvoiceId, setSelectedInvoiceId } = useSelection();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  // Search & filter state
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

  // Read invoice ID from URL parameter and select it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('invoice');
    if (invoiceId && invoiceId !== selectedInvoiceId) {
      setSelectedInvoiceId(invoiceId);
      // Clean up the URL parameter
      params.delete('invoice');
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [selectedInvoiceId, setSelectedInvoiceId]);

  // Use conference currency if set
  const isCurrencyLocked = !!conference.currency;

  const emptyCreateForm: InvoiceCreate = {
    template_type: 'bank_transfer',
    issue_date: '',
    due_date: '',
    recipient_name: '',
    recipient_email: '',
    recipient_address_line1: '',
    recipient_address_line2: '',
    recipient_city: '',
    recipient_state: '',
    recipient_postal_code: '',
    recipient_country: '',
    recipient_vat_number: '',
    line_items: [],
    subtotal: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 0,
    currency: conference.currency || '',
    notes: '',
    internal_comment: '',
    contact_persons: [],
    is_active: true,
  };

  // Number format from conference settings
  const fmtAmount = useCallback(
    (value: number | null | undefined) =>
      formatNumber(value ?? 0, {
        decimalSeparator: (conference.settings?.decimal_separator as string) || '.',
        thousandsSeparator: (conference.settings?.thousands_separator as string) || ',',
        decimalPlaces: 2,
      }),
    [conference.settings]
  );

  const [createForm, setCreateForm] = useState<InvoiceCreate>(emptyCreateForm);
  const [createNewContact, setCreateNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });
  const [autoCalculateVat, setAutoCalculateVat] = useState(true);
  const [isLoadingVatPreview, setIsLoadingVatPreview] = useState(false);
  const vatPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [
      ...queryKeys.invoices.byConference(conference.id),
      debouncedSearch,
      filterStatus,
      filterType,
      filterDateFrom,
      filterDateTo,
    ],
    queryFn: async () => {
      const params: Record<string, string> = { page_size: '100' };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.template_type = filterType;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      const response = await api.get<{
        items: Invoice[];
        total: number;
      }>(`/conferences/${conference.id}/invoices`, { params });
      return response.data;
    },
  });

  // Platform currencies for dropdowns
  const { data: currenciesData } = useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
  });

  // Tax info for auto-filling tax rate
  const { data: taxInfo } = useQuery({
    queryKey: queryKeys.fiscal.taxInfo(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/tax-info`);
      return res.data as { current_vat_rate: number | null };
    },
  });

  const [validationAlert, setValidationAlert] = useState<string | null>(null);

  const selectedInvoice = data?.items?.find((inv) => inv.id === selectedInvoiceId);

  const createMutation = useMutation({
    mutationFn: async (invoiceData: InvoiceCreate) => {
      const response = await api.post<Invoice>(
        `/conferences/${conference.id}/invoices`,
        invoiceData
      );
      return response.data;
    },
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setIsAdding(false);
      setCreateForm(emptyCreateForm);
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
      setError(null);
      setSelectedInvoiceId(newInvoice.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create invoice'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: invoiceData }: { id: string; data: InvoiceUpdate }) => {
      const response = await api.put<Invoice>(
        `/conferences/${conference.id}/invoices/${id}`,
        invoiceData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update invoice'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setSelectedInvoiceId(null);
      setDeleteTarget(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({
      id,
      reason,
      cancel_registrations,
      cancellation_email_message,
    }: {
      id: string;
      reason: string;
      cancel_registrations?: boolean;
      cancellation_email_message?: string;
    }) => {
      const response = await api.post<CancelInvoiceResponse>(
        `/conferences/${conference.id}/invoices/${id}/cancel`,
        {
          reason,
          cancel_registrations,
          cancellation_email_message,
        }
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setSelectedInvoiceId(result.credit_note.id);
      setError(null);
      if (result.registrations_cancelled && result.registrations_cancelled > 0) {
        showToast(
          `Invoice cancelled. ${result.registrations_cancelled} registration(s) cancelled and ${result.access_removed_count || 0} conference access(es) removed.`,
          'success'
        );
      } else {
        showToast('Invoice cancelled and credit note created.', 'success');
      }
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to cancel invoice'));
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async ({ id, request }: { id: string; request: ReplaceInvoiceRequest }) => {
      const response = await api.post<ReplaceInvoiceResponse>(
        `/conferences/${conference.id}/invoices/${id}/replace`,
        request
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setSelectedInvoiceId(result.new_invoice.id);
      setError(null);
      showToast(
        `Invoice replaced successfully. ${result.registrations_transferred} registration(s) transferred to new invoice.`,
        'success'
      );
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to replace invoice'));
    },
  });

  const refundMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<Invoice>(
        `/conferences/${conference.id}/invoices/${id}/refund`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to refund payment'));
    },
  });

  const convertToCreditCardMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<ConvertToCreditCardResponse>(
        `/conferences/${conference.id}/invoices/${id}/convert-to-credit-card`
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      showToast(
        `Invoice converted to credit card. Payment link: ${result.payment_link_url}`,
        'success'
      );
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to convert invoice to credit card'));
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({
      id,
      payment_date,
      comment,
    }: {
      id: string;
      payment_date: string;
      comment: string;
    }) => {
      const response = await api.post<Invoice>(
        `/conferences/${conference.id}/invoices/${id}/mark-paid`,
        { payment_date, comment }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      showToast('Invoice marked as paid', 'success');
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to mark invoice as paid'));
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
      const response = await api.post<Invoice>(
        `/conferences/${conference.id}/invoices/${id}/reopen`,
        { comment }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      showToast('Invoice reopened', 'success');
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to reopen invoice'));
    },
  });

  const syncPaymentMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        message: string;
        total_checked: number;
        updated_to_paid: number;
        payment_failures_logged: number;
        errors: Array<{ invoice_id: string; invoice_number: string; error: string }>;
      }>(`/conferences/${conference.id}/invoices/sync-all-payments`);
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });

      if (result.updated_to_paid > 0) {
        showToast(
          `${result.updated_to_paid} invoice(s) updated to paid. ${result.total_checked} total checked.`,
          'success'
        );
      } else if (result.total_checked > 0) {
        showToast(`Checked ${result.total_checked} invoice(s). No status changes.`, 'info');
      } else {
        showToast('No pending credit card invoices to sync', 'info');
      }

      if (result.errors.length > 0) {
        setError(`${result.errors.length} invoice(s) failed to sync. Check console for details.`);
        console.error('Sync errors:', result.errors);
      } else {
        setError(null);
      }
    },
    onError: (err: unknown) => {
      const errorMsg = parseApiError(err, 'Failed to sync payment status');
      setError(errorMsg);
      showToast(errorMsg, 'error');
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await api.post<Invoice>(
        `/conferences/${conference.id}/invoices/${invoiceId}/send`
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setError(null);
      showToast(`Invoice ${result.invoice_number} sent to ${result.recipient_email}`, 'success');
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to send invoice'), 'error');
    },
  });

  // --- Line item helpers for create form ---
  const recalcTotals = useCallback((items: InvoiceLineItem[], taxRate: number) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = subtotal * (taxRate / 100);
    return { subtotal, tax_amount: taxAmount, total: subtotal + taxAmount };
  }, []);

  const addLineItem = () => {
    const items: InvoiceLineItem[] = [
      ...(createForm.line_items || []),
      { description: '', quantity: 1, unit_price: 0, discount: 0, total: 0 },
    ];
    setCreateForm({ ...createForm, line_items: items });
  };

  const removeLineItem = (index: number) => {
    const items = (createForm.line_items || []).filter((_, i) => i !== index);
    const totals = recalcTotals(items, createForm.tax_rate || 0);
    setCreateForm({ ...createForm, line_items: items, ...totals });
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const items = [...(createForm.line_items || [])];
    const item = { ...items[index] };
    const numVal = typeof value === 'string' ? parseFloat(value) || 0 : value;

    if (field === 'description') {
      item.description = String(value);
    } else if (field === 'quantity') {
      item.quantity = numVal;
    } else if (field === 'unit_price') {
      item.unit_price = numVal;
    } else if (field === 'discount') {
      item.discount = numVal;
    } else if (field === 'total') {
      item.total = numVal;
    }

    // Recalculate line total
    item.total = item.quantity * item.unit_price - (item.discount || 0);
    if (item.total < 0) item.total = 0;
    items[index] = item;

    const totals = recalcTotals(items, createForm.tax_rate || 0);
    setCreateForm({ ...createForm, line_items: items, ...totals });
  };

  const handleTaxRateChange = (rate: number) => {
    const totals = recalcTotals(createForm.line_items || [], rate);
    setCreateForm({ ...createForm, tax_rate: rate, ...totals });
  };

  // VAT auto-calculation preview
  const previewVat = useCallback(async () => {
    if (!autoCalculateVat) return;
    if (!createForm.recipient_country?.trim()) return;
    if (!createForm.subtotal || createForm.subtotal <= 0) return;

    setIsLoadingVatPreview(true);
    try {
      const response = await api.post(`/conferences/${conference.id}/invoices/preview-vat`, {
        recipient_country: createForm.recipient_country,
        recipient_vat_number: createForm.recipient_vat_number || null,
        subtotal: createForm.subtotal,
        issue_date: createForm.issue_date || null,
      });

      const { tax_rate, tax_amount, total, notes_text } = response.data;

      // Update tax fields
      setCreateForm((prev) => ({
        ...prev,
        tax_rate,
        tax_amount,
        total,
        // Append notes_text if provided and not already present
        notes:
          notes_text && !prev.notes?.includes(notes_text)
            ? prev.notes
              ? `${prev.notes}\n\n${notes_text}`
              : notes_text
            : prev.notes,
      }));
    } catch (err) {
      console.error('VAT preview failed:', err);
      // Silently fail - user can enter manually
    } finally {
      setIsLoadingVatPreview(false);
    }
  }, [
    autoCalculateVat,
    createForm.recipient_country,
    createForm.recipient_vat_number,
    createForm.subtotal,
    createForm.issue_date,
    conference.id,
  ]);

  // Debounced VAT preview on relevant field changes
  useEffect(() => {
    if (!autoCalculateVat) return;

    if (vatPreviewTimerRef.current) {
      clearTimeout(vatPreviewTimerRef.current);
    }

    vatPreviewTimerRef.current = setTimeout(() => {
      previewVat();
    }, 500);

    return () => {
      if (vatPreviewTimerRef.current) {
        clearTimeout(vatPreviewTimerRef.current);
      }
    };
  }, [autoCalculateVat, previewVat]);

  // Auto-fill tax rate from conference VAT rate settings (only when not auto-calculating)
  useEffect(() => {
    if (!autoCalculateVat && taxInfo?.current_vat_rate != null && createForm.tax_rate === 0) {
      handleTaxRateChange(Number(taxInfo.current_vat_rate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxInfo?.current_vat_rate, autoCalculateVat]);

  // --- Recipient picker ---
  const handleRecipientSelect = (result: RecipientSearchResult) => {
    setCreateForm({
      ...createForm,
      recipient_source_type: result.source_type,
      recipient_source_id: result.id,
      recipient_name: result.display_name,
      recipient_email: result.email || '',
      recipient_address_line1: result.address_line1 || '',
      recipient_address_line2: result.address_line2 || '',
      recipient_city: result.city || '',
      recipient_state: result.state || '',
      recipient_postal_code: result.postal_code || '',
      recipient_country: result.country || '',
      recipient_vat_number: result.vat_number || '',
      contact_persons: result.contact_persons || [],
    });
  };

  const handleManualEntry = () => {
    setCreateForm({
      ...createForm,
      recipient_source_type: undefined,
      recipient_source_id: undefined,
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const missing: string[] = [];
    if (!createForm.recipient_name?.trim()) missing.push('Recipient Name');
    if (!createForm.recipient_address_line1?.trim()) missing.push('Address Line 1');
    if (!createForm.recipient_city?.trim()) missing.push('City');
    if (!createForm.recipient_postal_code?.trim()) missing.push('Postal Code');
    if (!createForm.recipient_country?.trim()) missing.push('Country');
    if (!createForm.currency?.trim() && !conference.currency) missing.push('Currency');
    if ((createForm.line_items || []).length === 0) missing.push('At least one Line Item');
    const emptyItems = (createForm.line_items || []).filter((li) => !li.description?.trim());
    if (emptyItems.length > 0) missing.push('Description for all Line Items');

    if (missing.length > 0) {
      setValidationAlert(
        `Please fill in the following required fields:\n\n- ${missing.join('\n- ')}`
      );
      return;
    }

    const finalData = { ...createForm };
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...createNewContact }];
    }
    createMutation.mutate(finalData);
  };

  const addCreateContact = () => {
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [...(createForm.contact_persons || []), { ...createNewContact }],
      });
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

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

  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState(0);

  const pdfFile = useMemo(() => (pdfBytes ? { data: new Uint8Array(pdfBytes) } : null), [pdfBytes]);

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

  const closePdfViewer = () => {
    setPdfBytes(null);
    setPdfNumPages(0);
  };

  const invoiceCount = data?.total || 0;

  // Pre-compute flattened row list for virtual scrolling (parent invoices + credit note sub-rows)
  const flattenedRows = useMemo(() => {
    if (!data?.items?.length) return [];
    const itemIds = new Set(data.items.map((inv) => inv.id));
    const creditNotesByParent = new Map<string, Invoice[]>();
    const creditNoteIds = new Set<string>();
    for (const inv of data.items) {
      if (
        inv.template_type === 'credit_note' &&
        inv.related_invoice_id &&
        itemIds.has(inv.related_invoice_id)
      ) {
        const list = creditNotesByParent.get(inv.related_invoice_id) || [];
        list.push(inv);
        creditNotesByParent.set(inv.related_invoice_id, list);
        creditNoteIds.add(inv.id);
      }
    }
    const rows: { invoice: Invoice; isSubRow: boolean }[] = [];
    for (const invoice of data.items) {
      if (creditNoteIds.has(invoice.id)) continue;
      rows.push({ invoice, isSubRow: false });
      const creditNotes = creditNotesByParent.get(invoice.id);
      if (creditNotes) {
        for (const cn of creditNotes) {
          rows.push({ invoice: cn, isSubRow: true });
        }
      }
    }
    return rows;
  }, [data?.items]);

  const invoiceScrollRef = useRef<HTMLDivElement>(null);
  const invoiceVirtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement: () => invoiceScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  return (
    <div>
      {/* === DETAIL PANEL VIEW === */}
      {selectedInvoice ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                closePdfViewer();
                setSelectedInvoiceId(null);
              }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronLeftIcon />
              Back to invoices list
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (pdfBytes ? closePdfViewer() : viewPDF(selectedInvoice.id))}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  pdfBytes
                    ? 'text-white bg-primary-600 hover:bg-primary-700'
                    : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                {pdfBytes ? 'Close PDF' : 'View PDF'}
              </button>
              <button
                type="button"
                onClick={() => downloadPDF(selectedInvoice.id, selectedInvoice.invoice_number)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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

          <ErrorBanner message={error} />

          {pdfBytes && (
            <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
              <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
                <Document
                  file={pdfFile}
                  onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                  loading={
                    <div className="flex items-center justify-center py-12">
                      <LoadingSpinner />
                    </div>
                  }
                >
                  {Array.from({ length: pdfNumPages }, (_, i) => (
                    <Page key={i + 1} pageNumber={i + 1} width={800} className="mx-auto" />
                  ))}
                </Document>
              </div>
            </div>
          )}

          <InvoiceDetailPanel
            invoice={selectedInvoice}
            currencies={currenciesData || []}
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
          {/* === TABLE LIST VIEW === */}
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

          {/* Search & Filters */}
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

          {/* Create form */}
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
              currencies={currenciesData || []}
              fmtAmount={fmtAmount}
              onSubmit={handleCreateSubmit}
              onCancel={() => {
                setIsAdding(false);
                setError(null);
                setCreateForm(emptyCreateForm);
                setCreateNewContact({
                  first_name: '',
                  last_name: '',
                  email: '',
                  phone: '',
                  comment: '',
                });
              }}
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

          {/* Invoices table */}
          {isLoading ? (
            <LoadingSpinner />
          ) : data?.items && data.items.length > 0 ? (
            <div
              ref={invoiceScrollRef}
              className="overflow-auto max-h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Issue Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Total
                    </th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {invoiceVirtualizer.getVirtualItems().length > 0 && (
                    <tr style={{ height: `${invoiceVirtualizer.getVirtualItems()[0].start}px` }}>
                      <td colSpan={isAdmin ? 8 : 7} />
                    </tr>
                  )}
                  {invoiceVirtualizer.getVirtualItems().map((virtualRow) => {
                    const { invoice, isSubRow } = flattenedRows[virtualRow.index];
                    return (
                      <tr
                        key={invoice.id}
                        data-index={virtualRow.index}
                        ref={invoiceVirtualizer.measureElement}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                          isSubRow ? 'bg-gray-50/50 dark:bg-gray-750/50' : ''
                        }`}
                        onClick={() => setSelectedInvoiceId(invoice.id)}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <div className={isSubRow ? 'pl-6 flex items-center gap-1.5' : ''}>
                            {isSubRow && (
                              <svg
                                className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 5l-6 7h18"
                                  transform="rotate(90 12 12)"
                                />
                              </svg>
                            )}
                            {invoice.invoice_number || (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 italic">
                                DRAFT
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {TEMPLATE_TYPE_LABELS[invoice.template_type] || invoice.template_type}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {invoice.recipient_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {invoice.issue_date || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {invoice.due_date || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              STATUS_COLORS[invoice.status] ||
                              'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
                          {invoice.total != null
                            ? `${fmtAmount(invoice.total)}${invoice.currency ? ` ${invoice.currency}` : ''}`
                            : '-'}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => downloadPDF(invoice.id, invoice.invoice_number)}
                                className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors"
                                title="Download PDF"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                  />
                                </svg>
                              </button>
                              {(invoice.status === 'sent' || invoice.status === 'overdue') &&
                                invoice.recipient_email && (
                                  <button
                                    type="button"
                                    onClick={() => sendMutation.mutate(invoice.id)}
                                    disabled={sendMutation.isPending}
                                    className="text-gray-400 dark:text-gray-500 hover:text-blue-600 p-1 rounded transition-colors disabled:opacity-50"
                                    title="Resend"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </button>
                                )}
                              {invoice.status === 'draft' &&
                                invoice.template_type !== 'credit_note' && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(invoice)}
                                    disabled={deleteMutation.isPending}
                                    className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                                    title="Delete"
                                  >
                                    <DeleteIcon />
                                  </button>
                                )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {invoiceVirtualizer.getVirtualItems().length > 0 && (
                    <tr
                      style={{
                        height: `${invoiceVirtualizer.getTotalSize() - (invoiceVirtualizer.getVirtualItems()[invoiceVirtualizer.getVirtualItems().length - 1]?.end ?? 0)}px`,
                      }}
                    >
                      <td colSpan={isAdmin ? 8 : 7} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${deleteTarget?.invoice_number || 'DRAFT'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Validation alert */}
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
