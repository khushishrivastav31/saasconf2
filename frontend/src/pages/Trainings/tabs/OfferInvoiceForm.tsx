/**
 * OfferInvoiceForm — Modal to create an invoice from an accepted offer.
 * Fetches placement/attendee data from the invoice-preview endpoint,
 * lets the user select trainings, set prices, and create the invoice.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';

interface PreviewAttendee {
  first_name: string;
  last_name: string;
  email: string | null;
  certification: boolean;
  exam_mode: string | null;
  exam_language: string | null;
  extra_time: boolean;
}

interface PreviewPlacement {
  id: string;
  training_name: string;
  start_date: string | null;
  placement_type: string;
  attendee_count: number;
  certification_count: number;
  attendees: PreviewAttendee[];
}

interface InvoicePreview {
  offer_number: string;
  customer_name: string;
  recipient_name: string;
  recipient_email: string | null;
  currency: string;
  po_number: string | null;
  suggested_training_price: number;
  suggested_certification_price: number;
  default_vat_rate: number;
  default_issue_date: string;
  default_due_date: string;
  offer_total: number;
  already_invoiced: number;
  placements: PreviewPlacement[];
}

interface PlacementForm {
  placementId: string;
  include: boolean;
  trainingPrice: string;
  certificationPrice: string;
}

const formatDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

export default function OfferInvoiceForm({
  offerId,
  onClose,
  onCreated,
}: {
  offerId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: preview, isLoading } = useQuery<InvoicePreview>({
    queryKey: ['offer-invoice-preview', offerId],
    queryFn: async () => {
      const res = await api.get(`/trainings/offers/${offerId}/invoice-preview`);
      return res.data;
    },
  });

  const [templateType, setTemplateType] = useState('bank_transfer');
  const [issueDate, setIssueDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [placementOverrides, setPlacementOverrides] = useState<PlacementForm[] | null>(null);

  // Use preview defaults until user overrides
  const effectiveIssueDate = issueDate ?? preview?.default_issue_date ?? '';
  const effectiveDueDate = dueDate ?? preview?.default_due_date ?? '';
  const effectiveTaxRate = taxRate ?? String(preview?.default_vat_rate ?? 0);

  // Initialize placement form state when preview loads
  const placementForms = useMemo(() => {
    if (placementOverrides) return placementOverrides;
    if (!preview) return [];
    return preview.placements.map((p) => ({
      placementId: p.id,
      include: true,
      trainingPrice: String(preview.suggested_training_price || 0),
      certificationPrice: String(preview.suggested_certification_price || 0),
    }));
  }, [placementOverrides, preview]);

  const updatePlacement = useCallback(
    (idx: number, field: keyof PlacementForm, value: string | boolean) => {
      const updated = [...placementForms];
      updated[idx] = { ...updated[idx], [field]: value };
      setPlacementOverrides(updated);
    },
    [placementForms]
  );

  // Compute line items + totals
  const { lineItems, subtotal } = useMemo(() => {
    if (!preview)
      return {
        lineItems: [] as { desc: string; qty: number; price: number; total: number }[],
        subtotal: 0,
      };
    const items: { desc: string; qty: number; price: number; total: number }[] = [];
    let sub = 0;

    for (let i = 0; i < placementForms.length; i++) {
      const pf = placementForms[i];
      if (!pf.include) continue;
      const pd = preview.placements[i];
      if (!pd) continue;

      const tp = parseFloat(pf.trainingPrice) || 0;
      const cp = parseFloat(pf.certificationPrice) || 0;

      if (pd.attendee_count > 0 && tp > 0) {
        const t = tp * pd.attendee_count;
        items.push({
          desc: `${pd.training_name} — ${formatDate(pd.start_date)} (${pd.attendee_count} att.)`,
          qty: pd.attendee_count,
          price: tp,
          total: t,
        });
        sub += t;
      }
      if (pd.certification_count > 0 && cp > 0) {
        const t = cp * pd.certification_count;
        items.push({
          desc: `Certification — ${pd.training_name} (${pd.certification_count} att.)`,
          qty: pd.certification_count,
          price: cp,
          total: t,
        });
        sub += t;
      }
    }
    return { lineItems: items, subtotal: sub };
  }, [placementForms, preview]);

  const taxAmount = (subtotal * (parseFloat(effectiveTaxRate) || 0)) / 100;
  const total = subtotal + taxAmount;
  const sym = (preview?.currency === 'EUR' ? '€' : preview?.currency) || '€';
  const fmt = (n: number) =>
    `${sym}\u00A0${n.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;

  const createMutation = useMutation({
    mutationFn: (status: 'draft' | 'sent') =>
      api.post(`/trainings/offers/${offerId}/invoice`, {
        placements: placementForms.map((pf) => ({
          placement_id: pf.placementId,
          training_price: parseFloat(pf.trainingPrice) || 0,
          certification_price: parseFloat(pf.certificationPrice) || 0,
          include: pf.include,
        })),
        template_type: templateType,
        issue_date: effectiveIssueDate || null,
        due_date: effectiveDueDate || null,
        tax_rate: parseFloat(effectiveTaxRate) || 0,
        notes: notes || null,
        status,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['training-pending-invoicing'] });
      queryClient.invalidateQueries({ queryKey: ['customer-offers'] });
      showToast('Invoice created', 'success');
      onCreated(res.data.invoice.id);
    },
    onError: () => showToast('Failed to create invoice', 'error'),
  });

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';

  if (isLoading || !preview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Create Invoice from {preview.offer_number}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{preview.customer_name}</p>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Settings row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Template
              </label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className={inputCls}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Issue Date
              </label>
              <input
                type="date"
                value={effectiveIssueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={effectiveDueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                VAT Rate (%)
              </label>
              <input
                type="number"
                value={effectiveTaxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Placement selection */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Select Trainings
            </h4>
            <div className="space-y-3">
              {preview.placements.map((pd, i) => {
                const pf = placementForms[i];
                if (!pf) return null;
                return (
                  <div
                    key={pd.id}
                    className={`border rounded-lg p-3 transition-colors ${
                      pf.include
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700 opacity-50'
                    }`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input
                        type="checkbox"
                        checked={pf.include}
                        onChange={(e) => updatePlacement(i, 'include', e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                      />
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {pd.training_name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(pd.start_date)}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">{pd.placement_type}</span>
                    </label>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {pd.attendee_count} attendee{pd.attendee_count !== 1 ? 's' : ''}
                      {pd.certification_count > 0 && ` (${pd.certification_count} with exam)`}
                    </div>
                    {pf.include && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                            Training Price (per attendee)
                          </label>
                          <input
                            type="number"
                            value={pf.trainingPrice}
                            onChange={(e) => updatePlacement(i, 'trainingPrice', e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                            Exam Price (per attendee)
                          </label>
                          <input
                            type="number"
                            value={pf.certificationPrice}
                            onChange={(e) =>
                              updatePlacement(i, 'certificationPrice', e.target.value)
                            }
                            className={inputCls}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Line items preview */}
          {lineItems.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Line Items
              </h4>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <th className="text-left py-1.5">Description</th>
                    <th className="text-right py-1.5 w-12">Qty</th>
                    <th className="text-right py-1.5 w-24">Price</th>
                    <th className="text-right py-1.5 w-24">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lineItems.map((li, i) => (
                    <tr key={i} className="text-gray-700 dark:text-gray-300">
                      <td className="py-1.5">{li.desc}</td>
                      <td className="py-1.5 text-right tabular-nums">{li.qty}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmt(li.price)}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">
                        {fmt(li.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 space-y-1 text-sm text-right">
                <div className="text-gray-500 dark:text-gray-400">Subtotal: {fmt(subtotal)}</div>
                <div className="text-gray-500 dark:text-gray-400">
                  VAT ({effectiveTaxRate}%): {fmt(taxAmount)}
                </div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  Total: {fmt(total)}
                </div>
              </div>
            </div>
          )}

          {/* Offer amount summary — compares net (excl. VAT) amounts */}
          {preview && (
            <OfferAmountSummary
              offerTotal={preview.offer_total}
              alreadyInvoiced={preview.already_invoiced}
              thisInvoice={subtotal}
              currency={preview.currency}
            />
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => createMutation.mutate('draft')}
              disabled={lineItems.length === 0 || createMutation.isPending}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate('sent')}
              disabled={lineItems.length === 0 || createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
            >
              Send Invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Offer amount summary with warning ────────────────────────────────────────
function OfferAmountSummary({
  offerTotal,
  alreadyInvoiced,
  thisInvoice,
  currency,
}: {
  offerTotal: number;
  alreadyInvoiced: number;
  thisInvoice: number;
  currency: string;
}) {
  const sym = currency === 'EUR' ? '€' : currency;
  const fmt = (n: number) =>
    `${sym}\u00A0${n.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;

  const openBefore = offerTotal - alreadyInvoiced;
  const openAfter = offerTotal - alreadyInvoiced - thisInvoice;
  const diff = Math.abs(openAfter);
  const isOver = openAfter < -0.01;
  const isUnder = openAfter > 0.01;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Offer Amount (net, excl. VAT)
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-gray-500 dark:text-gray-400">Quoted (net)</span>
        <span className="text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
          {fmt(offerTotal)}
        </span>
        {alreadyInvoiced > 0 && (
          <>
            <span className="text-gray-500 dark:text-gray-400">Already invoiced (net)</span>
            <span className="text-right tabular-nums text-gray-600 dark:text-gray-400">
              {fmt(alreadyInvoiced)}
            </span>
          </>
        )}
        <span className="text-gray-500 dark:text-gray-400">Open before this invoice</span>
        <span className="text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
          {fmt(openBefore)}
        </span>
        <span className="text-gray-500 dark:text-gray-400">This invoice (net)</span>
        <span className="text-right tabular-nums text-gray-600 dark:text-gray-400">
          {fmt(thisInvoice)}
        </span>
        <span className="font-semibold text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700 pt-1">
          Remaining open
        </span>
        <span
          className={`text-right tabular-nums font-semibold border-t border-gray-200 dark:border-gray-700 pt-1 ${
            isOver
              ? 'text-red-600 dark:text-red-400'
              : isUnder
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-green-600 dark:text-green-400'
          }`}
        >
          {fmt(openBefore - thisInvoice)}
        </span>
      </div>
      {isOver && (
        <div className="flex items-start gap-2 mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <span>This invoice exceeds the quoted amount by {fmt(diff)}.</span>
        </div>
      )}
      {isUnder && (
        <div className="flex items-start gap-2 mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{fmt(diff)} remaining to be invoiced after this invoice.</span>
        </div>
      )}
    </div>
  );
}
