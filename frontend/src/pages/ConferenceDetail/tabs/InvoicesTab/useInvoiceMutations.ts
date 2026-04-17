import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type {
  CancelInvoiceResponse,
  ConvertToCreditCardResponse,
  Invoice,
  InvoiceCreate,
  InvoiceUpdate,
  PaginatedResponse,
  PlatformCurrency,
  ReplaceInvoiceRequest,
  ReplaceInvoiceResponse,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';

type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

interface Options {
  conferenceId: string;
  debouncedSearch: string;
  filterStatus: string;
  filterType: string;
  filterDateFrom: string;
  filterDateTo: string;
  showToast: ToastFn;
  setError: (msg: string | null) => void;
  setSelectedInvoiceId: (id: string | null) => void;
  onCreated: () => void;
}

export function useInvoiceMutations({
  conferenceId,
  debouncedSearch,
  filterStatus,
  filterType,
  filterDateFrom,
  filterDateTo,
  showToast,
  setError,
  setSelectedInvoiceId,
  onCreated,
}: Options) {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.invoices.byConference(conferenceId),
    });

  const listQuery = useQuery({
    queryKey: [
      ...queryKeys.invoices.byConference(conferenceId),
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
      }>(`/conferences/${conferenceId}/invoices`, { params });
      return response.data;
    },
  });

  const currenciesQuery = useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
  });

  const taxInfoQuery = useQuery({
    queryKey: queryKeys.fiscal.taxInfo(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/tax-info`);
      return res.data as { current_vat_rate: number | null };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (invoiceData: InvoiceCreate) => {
      const response = await api.post<Invoice>(
        `/conferences/${conferenceId}/invoices`,
        invoiceData
      );
      return response.data;
    },
    onSuccess: (newInvoice) => {
      invalidate();
      onCreated();
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
        `/conferences/${conferenceId}/invoices/${id}`,
        invoiceData
      );
      return response.data;
    },
    onSuccess: () => {
      invalidate();
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update invoice'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/invoices/${id}`);
    },
    onSuccess: () => {
      invalidate();
      setSelectedInvoiceId(null);
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
        `/conferences/${conferenceId}/invoices/${id}/cancel`,
        { reason, cancel_registrations, cancellation_email_message }
      );
      return response.data;
    },
    onSuccess: (result) => {
      invalidate();
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
        `/conferences/${conferenceId}/invoices/${id}/replace`,
        request
      );
      return response.data;
    },
    onSuccess: (result) => {
      invalidate();
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
        `/conferences/${conferenceId}/invoices/${id}/refund`
      );
      return response.data;
    },
    onSuccess: () => {
      invalidate();
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to refund payment'));
    },
  });

  const convertToCreditCardMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<ConvertToCreditCardResponse>(
        `/conferences/${conferenceId}/invoices/${id}/convert-to-credit-card`
      );
      return response.data;
    },
    onSuccess: (result) => {
      invalidate();
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
        `/conferences/${conferenceId}/invoices/${id}/mark-paid`,
        { payment_date, comment }
      );
      return response.data;
    },
    onSuccess: () => {
      invalidate();
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
        `/conferences/${conferenceId}/invoices/${id}/reopen`,
        { comment }
      );
      return response.data;
    },
    onSuccess: () => {
      invalidate();
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
      }>(`/conferences/${conferenceId}/invoices/sync-all-payments`);
      return response.data;
    },
    onSuccess: (result) => {
      invalidate();
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
        `/conferences/${conferenceId}/invoices/${invoiceId}/send`
      );
      return response.data;
    },
    onSuccess: (result) => {
      invalidate();
      setError(null);
      showToast(`Invoice ${result.invoice_number} sent to ${result.recipient_email}`, 'success');
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to send invoice'), 'error');
    },
  });

  return {
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
  };
}
