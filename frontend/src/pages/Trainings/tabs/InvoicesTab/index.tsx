/**
 * Training Invoices Tab — Main component with list view.
 * Sub-components extracted to separate files in this directory.
 */
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';

import type { TrainingInvoice } from './types';
import { formatDate, formatAmount, StatusBadge, TypeBadge } from './formatters';
import CreateForm from './CreateForm';
import ReplaceForm from './ReplaceDialog';
import DetailPanel from './DetailPanel';

// ── List view helpers ────────────────────────────────────────────────────────
interface ListRow {
  inv: TrainingInvoice;
  isSubRow: boolean;
}

function buildRows(items: TrainingInvoice[]): ListRow[] {
  const creditNotesByParent = new Map<string, TrainingInvoice[]>();
  const parents: TrainingInvoice[] = [];

  for (const inv of items) {
    if (inv.template_type === 'credit_note' && inv.related_invoice_id) {
      const list = creditNotesByParent.get(inv.related_invoice_id) ?? [];
      list.push(inv);
      creditNotesByParent.set(inv.related_invoice_id, list);
    } else {
      parents.push(inv);
    }
  }

  const rows: ListRow[] = [];
  for (const parent of parents) {
    rows.push({ inv: parent, isSubRow: false });
    const children = creditNotesByParent.get(parent.id) ?? [];
    for (const child of children) {
      rows.push({ inv: child, isSubRow: true });
    }
  }

  for (const inv of items) {
    if (inv.template_type === 'credit_note' && inv.related_invoice_id) {
      const parentPresent = parents.some((p) => p.id === inv.related_invoice_id);
      if (!parentPresent) rows.push({ inv, isSubRow: false });
    }
  }

  return rows;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function InvoicesTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParamsInvoice] = useSearchParams();
  const initialInvoiceId = searchParams.get('invoiceId');
  const [selectedId, setSelectedId] = useState<string | null>(initialInvoiceId);
  const [view, setView] = useState<'list' | 'create' | 'replace'>('list');

  useEffect(() => {
    if (initialInvoiceId) {
      const params = new URLSearchParams(searchParams);
      params.delete('invoiceId');
      setSearchParamsInvoice(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), per_page: '50' };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    if (typeFilter) p.template_type = typeFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    return p;
  }, [search, statusFilter, typeFilter, dateFrom, dateTo, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['training-invoices', params],
    queryFn: async () => {
      const res = await api.get('/trainings/invoices', { params });
      return res.data as {
        items: TrainingInvoice[];
        total: number;
        page: number;
        per_page: number;
      };
    },
  });

  const { data: detailData } = useQuery({
    queryKey: ['training-invoice-detail', selectedId],
    queryFn: async () => {
      const res = await api.get(`/trainings/invoices/${selectedId}`);
      return res.data as TrainingInvoice;
    },
    enabled: !!selectedId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
    if (selectedId)
      queryClient.invalidateQueries({ queryKey: ['training-invoice-detail', selectedId] });
  };

  const resendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/trainings/invoices/${id}/resend`),
    onSuccess: () => showToast('Invoice email resent', 'success'),
    onError: () => showToast('Failed to resend email', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/trainings/invoices/${id}/cancel`),
    onSuccess: (res) => {
      invalidate();
      showToast('Invoice cancelled and credit note created', 'success');
      const creditNote = res.data?.credit_note;
      if (creditNote?.id) setSelectedId(creditNote.id);
    },
    onError: () => showToast('Failed to cancel invoice', 'error'),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/trainings/invoices/${id}/mark-paid`),
    onSuccess: () => {
      invalidate();
      showToast('Invoice marked as paid', 'success');
    },
    onError: () => showToast('Failed to mark as paid', 'error'),
  });

  const syncStripeMutation = useMutation({
    mutationFn: () => api.post('/trainings/invoices/sync-stripe'),
    onSuccess: (res) => {
      invalidate();
      const d = res.data as { total_checked: number; updated_to_paid: number; errors: unknown[] };
      if (d.updated_to_paid > 0)
        showToast(
          `${d.updated_to_paid} invoice(s) updated to paid. ${d.total_checked} total checked.`,
          'success'
        );
      else if (d.total_checked > 0)
        showToast(`Checked ${d.total_checked} invoice(s). No status changes.`, 'info');
      else showToast('No pending credit card invoices to sync', 'info');
    },
    onError: () => showToast('Failed to sync Stripe payments', 'error'),
  });

  const saveDraftMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => api.put(`/trainings/invoices/${selectedId}`, d),
    onSuccess: () => {
      invalidate();
      showToast('Draft saved', 'success');
    },
    onError: () => showToast('Failed to save draft', 'error'),
  });

  const sendDraftMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) =>
      api.post(`/trainings/invoices/${selectedId}/send`, d),
    onSuccess: () => {
      invalidate();
      showToast('Invoice sent and number assigned', 'success');
    },
    onError: () => showToast('Failed to send invoice', 'error'),
  });

  const handleDownloadPdf = async (id: string, number: string | null) => {
    try {
      const res = await api.get(`/trainings/invoices/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${number ?? 'DRAFT'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download PDF', 'error');
    }
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;
  const rows = useMemo(() => buildRows(items), [items]);

  const selectedListItem = items.find((i) => i.id === selectedId);
  const selectedInvoice: TrainingInvoice | null = selectedId
    ? detailData
      ? { ...selectedListItem, ...detailData }
      : (selectedListItem ?? null)
    : null;

  const isMutating = cancelMutation.isPending || markPaidMutation.isPending;

  // ── Create view ──────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <CreateForm
        onBack={() => setView('list')}
        onCreate={(id) => {
          setView('list');
          setSelectedId(id);
        }}
      />
    );
  }

  // ── Detail view + replace dialog overlay ─────────────────────────────────
  if (selectedInvoice) {
    return (
      <>
        <DetailPanel
          inv={selectedInvoice}
          allInvoices={items}
          onBack={() => setSelectedId(null)}
          onNavigate={(id) => setSelectedId(id)}
          onDownloadPdf={() =>
            handleDownloadPdf(selectedInvoice.id, selectedInvoice.invoice_number)
          }
          onResend={() => resendMutation.mutate(selectedInvoice.id)}
          onCancel={() => cancelMutation.mutate(selectedInvoice.id)}
          onMarkPaid={() => markPaidMutation.mutate(selectedInvoice.id)}
          onReplace={() => setView('replace')}
          onSave={(d) => saveDraftMutation.mutate(d)}
          onSend={(d) => sendDraftMutation.mutate(d)}
          isResending={resendMutation.isPending}
          isMutating={isMutating}
          isSaving={saveDraftMutation.isPending}
          isSending={sendDraftMutation.isPending}
        />
        {view === 'replace' && (
          <ReplaceForm
            invoice={selectedInvoice}
            onBack={() => setView('list')}
            onReplace={(id) => {
              setView('list');
              setSelectedId(id);
            }}
          />
        )}
      </>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Training Invoices
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({total})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncStripeMutation.mutate()}
            disabled={syncStripeMutation.isPending}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Check Stripe for payment status updates on all pending credit card invoices"
          >
            {syncStripeMutation.isPending ? 'Syncing...' : '\u27F3 Sync Stripe Payments'}
          </button>
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Invoice
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, number, email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 min-w-45 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Types</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="credit_card">Credit Card</option>
          <option value="credit_note">Credit Note</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          title="Issue date from"
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          title="Issue date to"
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">No invoices found.</div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Invoice #
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Recipient
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Training
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Issue Date
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Due Date
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Total
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map(({ inv, isSubRow }) => {
                  const isNegative = inv.total !== null && Number(inv.total) < 0;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedId(inv.id)}
                      className={`cursor-pointer transition-colors ${isSubRow ? 'bg-orange-50/40 dark:bg-orange-900/5 hover:bg-orange-50 dark:hover:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-900 dark:text-gray-100">
                        {isSubRow && (
                          <span className="mr-1.5 text-gray-400 dark:text-gray-500">↳</span>
                        )}
                        {inv.invoice_number ?? 'DRAFT'}
                      </td>
                      <td className="px-3 py-2.5">
                        <TypeBadge type={inv.template_type} />
                      </td>
                      <td className="px-3 py-2.5 text-gray-900 dark:text-gray-100 max-w-40 truncate">
                        {inv.recipient_name}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 max-w-35 truncate">
                        {inv.training_name}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(inv.issue_date)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {isSubRow ? '—' : formatDate(inv.due_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-medium tabular-nums whitespace-nowrap ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
                      >
                        {formatAmount(inv.total, inv.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadPdf(inv.id, inv.invoice_number);
                            }}
                            className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded"
                            title="Download PDF"
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
                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </button>
                          {['sent', 'overdue'].includes(inv.status) && inv.recipient_email && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                resendMutation.mutate(inv.id);
                              }}
                              disabled={resendMutation.isPending}
                              className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded disabled:opacity-40"
                              title="Resend email"
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
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
