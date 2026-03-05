import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import api from '../../../config/api';
import { queryKeys } from '../../../config/queryKeys';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
import type {
  CancelInvoiceResponse,
  Conference,
  Invoice,
  InvoiceCreate,
  InvoiceUpdate,
  InvoiceTemplateType,
  InvoiceLineItem,
  PlatformCurrency,
  PaginatedResponse,
  LocationContactPerson,
  RecipientSearchResult,
} from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import { formatNumber } from '../../../utils/formatCurrency';
import InvoiceDetailPanel from '../../../components/InvoiceDetailPanel';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ContactPersonList from '../../../components/ContactPersonList';
import RecipientPicker from '../../../components/RecipientPicker';
import RichTextEditor from '../../../components/common/RichTextEditor';
import VatNumberInput from '../../../components/common/VatNumberInput';
import AlertDialog from '../../../components/AlertDialog';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { COUNTRY_OPTIONS } from '../../../config/countries';
import { ChevronLeftIcon, CloseIcon, DeleteIcon } from '../icons';
import { useSelection } from '../SelectionContext';
import { useToast } from '../../../components/Toast';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  cancelled: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

const TEMPLATE_TYPE_OPTIONS: { value: InvoiceTemplateType; label: string }[] = [
  { value: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { value: 'credit_card', label: 'Invoice (Credit Card)' },
  { value: 'credit_note', label: 'Credit Note' },
];

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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

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
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.post<CancelInvoiceResponse>(
        `/conferences/${conference.id}/invoices/${id}/cancel`,
        { reason }
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conference.id),
      });
      setSelectedInvoiceId(result.credit_note.id);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to cancel invoice'));
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

  // Auto-fill tax rate from conference VAT rate settings
  useEffect(() => {
    if (taxInfo?.current_vat_rate != null && createForm.tax_rate === 0) {
      handleTaxRateChange(Number(taxInfo.current_vat_rate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxInfo?.current_vat_rate]);

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
  const hasActiveFilters = !!(
    debouncedSearch ||
    filterStatus ||
    filterType ||
    filterDateFrom ||
    filterDateTo
  );

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
            onCancel={(id, reason) => cancelMutation.mutate({ id, reason })}
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
            )}
          </div>

          <ErrorBanner message={error} />

          {/* Search & Filters */}
          {!isAdding && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by number or recipient..."
                  className="w-full pl-10 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setDebouncedSearch('');
                      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">All Types</option>
                {TEMPLATE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From"
                title="Issue date from"
                className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To"
                title="Issue date to"
                className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setDebouncedSearch('');
                    setFilterStatus('');
                    setFilterType('');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                  }}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 whitespace-nowrap"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Create form */}
          {isAdding && (
            <form
              onSubmit={handleCreateSubmit}
              className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4"
            >
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                New Invoice (Draft)
              </h5>

              {/* Template Type + Dates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Template Type
                  </label>
                  <select
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.template_type || 'bank_transfer'}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        template_type: e.target.value as InvoiceTemplateType,
                      })
                    }
                  >
                    {TEMPLATE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.issue_date || ''}
                    onChange={(e) => setCreateForm({ ...createForm, issue_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.due_date || ''}
                    onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Recipient Picker */}
              <RecipientPicker
                conferenceId={conference.id}
                onSelect={handleRecipientSelect}
                onManualEntry={handleManualEntry}
              />

              {/* Recipient Name + Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipient Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.recipient_name}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, recipient_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.recipient_email || ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, recipient_email: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Address */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.recipient_address_line1 || ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, recipient_address_line1: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.recipient_address_line2 || ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, recipient_address_line2: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.recipient_city || ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, recipient_city: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.recipient_postal_code || ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, recipient_postal_code: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Country
                  </label>
                  <select
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.recipient_country || ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, recipient_country: e.target.value })
                    }
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
                  value={createForm.recipient_vat_number || ''}
                  onChange={(val) => setCreateForm({ ...createForm, recipient_vat_number: val })}
                  country={createForm.recipient_country || undefined}
                />
              </div>

              {/* Line Items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Line Items
                </label>
                {(createForm.line_items || []).length > 0 && (
                  <div className="overflow-x-auto mb-2">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Description
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">
                            Qty
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">
                            Unit Price
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">
                            Discount
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">
                            Total
                          </th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {(createForm.line_items || []).map((item, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                                value={item.description}
                                onChange={(e) =>
                                  updateLineItem(index, 'description', e.target.value)
                                }
                                placeholder="Item description"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                                value={item.quantity}
                                onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                                value={item.unit_price}
                                onChange={(e) =>
                                  updateLineItem(index, 'unit_price', e.target.value)
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                                value={item.discount ?? 0}
                                onChange={(e) => updateLineItem(index, 'discount', e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                              {fmtAmount(item.total)}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => removeLineItem(index)}
                                className="text-gray-400 dark:text-gray-500 hover:text-red-500"
                                title="Remove"
                              >
                                <svg
                                  className="w-4 h-4"
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
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  type="button"
                  onClick={addLineItem}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Line Item
                </button>

                {/* Totals summary */}
                {(createForm.line_items || []).length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {fmtAmount(createForm.subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">Tax Rate (%)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="w-20 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={createForm.tax_rate ?? ''}
                          onChange={(e) =>
                            handleTaxRateChange(e.target.value ? parseFloat(e.target.value) : 0)
                          }
                        />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {fmtAmount(createForm.tax_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold border-t border-gray-200 dark:border-gray-700 pt-2">
                      <span className="text-gray-900 dark:text-gray-100">Total</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {fmtAmount(createForm.total)}{' '}
                        {createForm.currency || conference.currency || ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Currency selector — only shown when conference has no currency set */}
              {!isCurrencyLocked && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Currency
                  </label>
                  <select
                    className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                    value={createForm.currency || ''}
                    onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                  >
                    <option value="">-- Select Currency --</option>
                    {(currenciesData || []).map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} - {c.name} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes (shown on invoice) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes (shown on invoice)
                </label>
                <RichTextEditor
                  value={createForm.notes || ''}
                  onChange={(html) => setCreateForm({ ...createForm, notes: html })}
                  rows={2}
                />
              </div>

              {/* Internal Comment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Internal Comment (not shown on invoice)
                </label>
                <textarea
                  className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  rows={2}
                  value={createForm.internal_comment || ''}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, internal_comment: e.target.value })
                  }
                  placeholder="Admin-only notes..."
                />
              </div>

              {/* Contact Persons */}
              <ContactPersonList
                contacts={createForm.contact_persons || []}
                newContact={createNewContact}
                setNewContact={setCreateNewContact}
                addContact={addCreateContact}
                removeContact={removeCreateContact}
                updateContact={updateCreateContact}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Draft'}
                </button>
                <button
                  type="button"
                  onClick={() => {
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
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Invoices table */}
          {isLoading ? (
            <LoadingSpinner />
          ) : data?.items && data.items.length > 0 ? (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
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
                  {(() => {
                    // Build map: cancelled invoice id → credit note(s)
                    // Only group as sub-rows when the parent invoice is also in the results
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

                    const renderRow = (invoice: Invoice, isSubRow: boolean) => (
                      <tr
                        key={invoice.id}
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
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 italic">
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

                    // Render: main invoices (skip standalone credit notes), then their credit notes as sub-rows
                    return data.items
                      .filter((inv) => !creditNoteIds.has(inv.id))
                      .flatMap((invoice) => {
                        const rows = [renderRow(invoice, false)];
                        const creditNotes = creditNotesByParent.get(invoice.id);
                        if (creditNotes) {
                          for (const cn of creditNotes) {
                            rows.push(renderRow(cn, true));
                          }
                        }
                        return rows;
                      });
                  })()}
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
