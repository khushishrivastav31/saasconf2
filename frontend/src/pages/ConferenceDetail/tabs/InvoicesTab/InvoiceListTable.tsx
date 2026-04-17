import { useMemo, useRef } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DeleteIcon } from '../../icons';
import { INVOICE_STATUS_COLORS as STATUS_COLORS } from '../../../../config/statusColors';
import type { Invoice } from '../../../../types';

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  credit_note: 'Credit Note',
};

type MinimalMutation = Pick<
  UseMutationResult<unknown, unknown, string, unknown>,
  'mutate' | 'isPending'
>;

interface Props {
  invoices: Invoice[];
  isAdmin: boolean;
  fmtAmount: (value: number | null | undefined) => string;
  onSelect: (id: string) => void;
  onDownload: (id: string, invoiceNumber: string | null) => void;
  sendMutation: MinimalMutation;
  deleteMutation: MinimalMutation;
  onRequestDelete: (invoice: Invoice) => void;
}

export default function InvoiceListTable({
  invoices,
  isAdmin,
  fmtAmount,
  onSelect,
  onDownload,
  sendMutation,
  deleteMutation,
  onRequestDelete,
}: Props) {
  const flattenedRows = useMemo(() => {
    if (!invoices.length) return [];
    const itemIds = new Set(invoices.map((inv) => inv.id));
    const creditNotesByParent = new Map<string, Invoice[]>();
    const creditNoteIds = new Set<string>();
    for (const inv of invoices) {
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
    for (const invoice of invoices) {
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
  }, [invoices]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const colSpan = isAdmin ? 8 : 7;

  return (
    <div
      ref={scrollRef}
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
          {virtualItems.length > 0 && (
            <tr style={{ height: `${virtualItems[0].start}px` }}>
              <td colSpan={colSpan} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const { invoice, isSubRow } = flattenedRows[virtualRow.index];
            return (
              <tr
                key={invoice.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={`hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                  isSubRow ? 'bg-gray-50/50 dark:bg-gray-750/50' : ''
                }`}
                onClick={() => onSelect(invoice.id)}
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
                        onClick={() => onDownload(invoice.id, invoice.invoice_number)}
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
                      {invoice.status === 'draft' && invoice.template_type !== 'credit_note' && (
                        <button
                          type="button"
                          onClick={() => onRequestDelete(invoice)}
                          disabled={deleteMutation.isPending}
                          className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                          title="Delete"
                          aria-label="Delete"
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
          {virtualItems.length > 0 && (
            <tr
              style={{
                height: `${virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)}px`,
              }}
            >
              <td colSpan={colSpan} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
