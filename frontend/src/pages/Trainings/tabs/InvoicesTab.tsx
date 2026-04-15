/**
 * Training Invoices Tab
 *
 * List view with click-to-detail, credit note sub-rows, and operations matching
 * conference invoice behaviour: Cancel → credit note, Mark as Paid.
 */
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';

interface TrainingInvoice {
  id: string;
  invoice_number: string | null;
  template_type: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  recipient_name: string;
  recipient_email: string | null;
  training_name: string;
  payment_method: string | null;
  subtotal: string | null;
  tax_rate?: string | null;
  tax_amount: string | null;
  total: string | null;
  currency: string | null;
  related_invoice_id: string | null;
  line_items?: LineItem[] | null;
  recipient_address_line1?: string | null;
  recipient_city?: string | null;
  recipient_postal_code?: string | null;
  recipient_country?: string | null;
  recipient_vat_number?: string | null;
  notes?: string | null;
  stripe_payment_link_url?: string | null;
  created_at: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface LineItemInput {
  description: string;
  quantity: string;
  unit_price: string;
}

// ── Formatters ────────────────────────────────────────────────────────────────
const formatDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

const formatAmount = (amt: string | number | null | undefined, currency: string | null) => {
  if (amt === null || amt === undefined || amt === '') return '—';
  const num = Number(amt);
  const sym = currency === 'EUR' ? '€' : (currency ?? '');
  const formatted = Math.abs(num).toLocaleString('de-DE', { minimumFractionDigits: 2 });
  return num < 0 ? `-${sym}\u00A0${formatted}` : `${sym}\u00A0${formatted}`;
};

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Type badge ────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  credit_card: 'Credit Card',
  credit_note: 'Credit Note',
};
const TYPE_COLORS: Record<string, string> = {
  bank_transfer: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  credit_card: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
  credit_note: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
};

function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type;
  const cls = TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
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

// ── Line items editor ─────────────────────────────────────────────────────────
function LineItemsEditor({
  items,
  currency,
  onChange,
}: {
  items: LineItemInput[];
  currency: string;
  onChange: (items: LineItemInput[]) => void;
}) {
  const sym = currency === 'EUR' ? '€' : currency || '';
  const update = (idx: number, field: keyof LineItemInput, value: string) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, { description: '', quantity: '1', unit_price: '' }]);

  return (
    <div>
      <table className="min-w-full text-sm mb-2">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left font-medium text-gray-500 dark:text-gray-400">
              Description
            </th>
            <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-16">
              Qty
            </th>
            <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-28">
              Unit Price
            </th>
            <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-24">
              Total
            </th>
            <th className="py-2 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {items.map((it, i) => {
            const rowTotal = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
            return (
              <tr key={i}>
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => update(i, 'description', e.target.value)}
                    placeholder="Description"
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    value={it.quantity}
                    onChange={(e) => update(i, 'quantity', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    value={it.unit_price}
                    onChange={(e) => update(i, 'unit_price', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
                  />
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {`${sym}\u00A0${rowTotal.toFixed(2)}`}
                </td>
                <td className="py-1.5 pl-2">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Line Item
      </button>
    </div>
  );
}

// ── Invoice totals block (shared) ─────────────────────────────────────────────
function InvoiceTotalsEditor({
  sym,
  subtotal,
  taxRate,
  taxAmount,
  total,
  onTaxRateChange,
}: {
  sym: string;
  subtotal: number;
  taxRate: string;
  taxAmount: number;
  total: number;
  onTaxRateChange: (v: string) => void;
}) {
  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-1.5 text-sm max-w-xs ml-auto">
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
        <span className="tabular-nums">{`${sym}\u00A0${subtotal.toFixed(2)}`}</span>
      </div>
      <div className="flex justify-between items-center gap-4">
        <span className="text-gray-500 dark:text-gray-400">VAT rate (%)</span>
        <input
          type="number"
          value={taxRate}
          onChange={(e) => onTaxRateChange(e.target.value)}
          className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
        />
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-gray-400">VAT amount</span>
        <span className="tabular-nums">{`${sym}\u00A0${taxAmount.toFixed(2)}`}</span>
      </div>
      <div className="flex justify-between font-semibold text-base pt-1 border-t border-gray-200 dark:border-gray-700">
        <span className="text-gray-900 dark:text-gray-100">Total</span>
        <span className="tabular-nums">{`${sym}\u00A0${total.toFixed(2)}`}</span>
      </div>
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────
function CreateForm({ onBack, onCreate }: { onBack: () => void; onCreate: (id: string) => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [templateType, setTemplateType] = useState('bank_transfer');
  const [currency, setCurrency] = useState('EUR');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientCity, setRecipientCity] = useState('');
  const [recipientPostalCode, setRecipientPostalCode] = useState('');
  const [recipientCountry, setRecipientCountry] = useState('');
  const [recipientVat, setRecipientVat] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    { description: '', quantity: '1', unit_price: '' },
  ]);

  const subtotal = useMemo(
    () =>
      lineItems.reduce(
        (s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0),
        0
      ),
    [lineItems]
  );
  const taxAmount = useMemo(
    () => (subtotal * (parseFloat(taxRate) || 0)) / 100,
    [subtotal, taxRate]
  );
  const total = subtotal + taxAmount;
  const sym = currency === 'EUR' ? '€' : currency || '';

  const createMutation = useMutation({
    mutationFn: (status: 'draft' | 'sent') =>
      api.post('/trainings/invoices', {
        template_type: templateType,
        status,
        recipient_name: recipientName,
        recipient_email: recipientEmail || null,
        recipient_address_line1: recipientAddress || null,
        recipient_city: recipientCity || null,
        recipient_postal_code: recipientPostalCode || null,
        recipient_country: recipientCountry || null,
        recipient_vat_number: recipientVat || null,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        currency: currency || null,
        line_items: lineItems
          .filter((it) => it.description.trim())
          .map((it) => ({
            description: it.description,
            quantity: parseFloat(it.quantity) || 1,
            unit_price: parseFloat(it.unit_price) || 0,
            total: (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0),
          })),
        subtotal: subtotal.toFixed(2),
        tax_rate: (parseFloat(taxRate) || 0).toFixed(2),
        tax_amount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        notes: notes || null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      showToast('Invoice created', 'success');
      onCreate(res.data.id);
    },
    onError: () => showToast('Failed to create invoice', 'error'),
  });

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';

  return (
    <div>
      <div className="flex items-center mb-6">
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
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">New Invoice</h3>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Template Type
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
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputCls}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Issue Date
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Recipient
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Address Line 1
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={recipientCity}
                  onChange={(e) => setRecipientCity(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={recipientPostalCode}
                  onChange={(e) => setRecipientPostalCode(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={recipientCountry}
                  onChange={(e) => setRecipientCountry(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  VAT Number
                </label>
                <input
                  type="text"
                  value={recipientVat}
                  onChange={(e) => setRecipientVat(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Line Items
            </h4>
            <LineItemsEditor items={lineItems} currency={currency} onChange={setLineItems} />
            <InvoiceTotalsEditor
              sym={sym}
              subtotal={subtotal}
              taxRate={taxRate}
              taxAmount={taxAmount}
              total={total}
              onTaxRateChange={setTaxRate}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-between items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => createMutation.mutate('draft')}
              disabled={!recipientName.trim() || createMutation.isPending}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Save Draft
            </button>
            <button
              onClick={() => createMutation.mutate('sent')}
              disabled={!recipientName.trim() || createMutation.isPending}
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

// ── Replace invoice dialog (billing correction — 1:1 with conference) ─────────
function ReplaceForm({
  invoice: orig,
  onBack,
  onReplace,
}: {
  invoice: TrainingInvoice;
  onBack: () => void;
  onReplace: (newId: string) => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState('');
  const [recipientName, setRecipientName] = useState(orig.recipient_name ?? '');
  const [recipientEmail, setRecipientEmail] = useState(orig.recipient_email ?? '');
  const [recipientAddress, setRecipientAddress] = useState(orig.recipient_address_line1 ?? '');
  const [recipientCity, setRecipientCity] = useState(orig.recipient_city ?? '');
  const [recipientPostalCode, setRecipientPostalCode] = useState(orig.recipient_postal_code ?? '');
  const [recipientCountry, setRecipientCountry] = useState(orig.recipient_country ?? '');
  const [recipientVat, setRecipientVat] = useState(orig.recipient_vat_number ?? '');

  const replaceMutation = useMutation({
    mutationFn: () => {
      // Only send fields that changed
      const payload: Record<string, string | null> = { reason };
      if (recipientName !== (orig.recipient_name ?? ''))
        payload.recipient_name = recipientName || null;
      if (recipientEmail !== (orig.recipient_email ?? ''))
        payload.recipient_email = recipientEmail || null;
      if (recipientAddress !== (orig.recipient_address_line1 ?? ''))
        payload.recipient_address_line1 = recipientAddress || null;
      if (recipientCity !== (orig.recipient_city ?? ''))
        payload.recipient_city = recipientCity || null;
      if (recipientPostalCode !== (orig.recipient_postal_code ?? ''))
        payload.recipient_postal_code = recipientPostalCode || null;
      if (recipientCountry !== (orig.recipient_country ?? ''))
        payload.recipient_country = recipientCountry || null;
      if (recipientVat !== (orig.recipient_vat_number ?? ''))
        payload.recipient_vat_number = recipientVat || null;
      return api.post(`/trainings/invoices/${orig.id}/replace`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['training-invoices'] });
      showToast('Invoice replaced successfully', 'success');
      onReplace(res.data.new_invoice.id);
    },
    onError: () => showToast('Failed to replace invoice', 'error'),
  });

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';
  const isPaid = orig.status === 'paid';
  const isCreditCard = orig.template_type === 'credit_card';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Replace Invoice with Corrected Billing Information
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This will cancel invoice &quot;{orig.invoice_number}&quot; and create a new invoice
                with corrected billing details.
              </p>
            </div>
          </div>
          {isPaid && (
            <p className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400">
              The new invoice will inherit the &quot;paid&quot; status.
            </p>
          )}
          {!isPaid && isCreditCard && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              A new payment link will be created for the replacement invoice.
            </p>
          )}
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Both a credit note and the new invoice will be sent to the recipient.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason for replacement <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Wrong company name and VAT number provided"
              className={inputCls}
            />
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Corrected billing */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Corrected Billing Information
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Company / Recipient Name
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={recipientCity}
                    onChange={(e) => setRecipientCity(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={recipientPostalCode}
                    onChange={(e) => setRecipientPostalCode(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={recipientCountry}
                  onChange={(e) => setRecipientCountry(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  VAT Number
                </label>
                <input
                  type="text"
                  value={recipientVat}
                  onChange={(e) => setRecipientVat(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-end gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => replaceMutation.mutate()}
            disabled={!reason.trim() || replaceMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
          >
            {replaceMutation.isPending ? 'Replacing...' : 'Replace Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draft details editor ──────────────────────────────────────────────────────
function DraftDetailsEditor(props: {
  editRecipientName: string;
  setEditRecipientName: (v: string) => void;
  editRecipientEmail: string;
  setEditRecipientEmail: (v: string) => void;
  editAddress: string;
  setEditAddress: (v: string) => void;
  editCity: string;
  setEditCity: (v: string) => void;
  editPostalCode: string;
  setEditPostalCode: (v: string) => void;
  editCountry: string;
  setEditCountry: (v: string) => void;
  editVat: string;
  setEditVat: (v: string) => void;
  editIssueDate: string;
  setEditIssueDate: (v: string) => void;
  editDueDate: string;
  setEditDueDate: (v: string) => void;
  editNotes: string;
  setEditNotes: (v: string) => void;
  templateType: string;
  currency: string | null;
}) {
  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Template Type
          </label>
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm">
            <TypeBadge type={props.templateType} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Issue Date
          </label>
          <input
            type="date"
            value={props.editIssueDate}
            onChange={(e) => props.setEditIssueDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={props.editDueDate}
            onChange={(e) => props.setEditDueDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recipient</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Name
            </label>
            <input
              type="text"
              value={props.editRecipientName}
              onChange={(e) => props.setEditRecipientName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Email
            </label>
            <input
              type="email"
              value={props.editRecipientEmail}
              onChange={(e) => props.setEditRecipientEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Address
            </label>
            <input
              type="text"
              value={props.editAddress}
              onChange={(e) => props.setEditAddress(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              City
            </label>
            <input
              type="text"
              value={props.editCity}
              onChange={(e) => props.setEditCity(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Postal Code
            </label>
            <input
              type="text"
              value={props.editPostalCode}
              onChange={(e) => props.setEditPostalCode(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Country
            </label>
            <input
              type="text"
              value={props.editCountry}
              onChange={(e) => props.setEditCountry(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              VAT Number
            </label>
            <input
              type="text"
              value={props.editVat}
              onChange={(e) => props.setEditVat(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Currency
            </label>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100">
              {props.currency ?? '—'}
            </div>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Notes
        </label>
        <textarea
          value={props.editNotes}
          onChange={(e) => props.setEditNotes(e.target.value)}
          rows={3}
          className={inputCls}
        />
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
type DetailTab = 'details' | 'line_items';

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

// ── List view ─────────────────────────────────────────────────────────────────
interface ListRow {
  inv: TrainingInvoice;
  isSubRow: boolean;
}

function buildRows(items: TrainingInvoice[]): ListRow[] {
  // Separate credit notes from parent invoices
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

  // Build flattened list: parent → its credit notes → next parent → …
  const rows: ListRow[] = [];
  for (const parent of parents) {
    rows.push({ inv: parent, isSubRow: false });
    const children = creditNotesByParent.get(parent.id) ?? [];
    for (const child of children) {
      rows.push({ inv: child, isSubRow: true });
    }
  }

  // Orphaned credit notes (parent not on current page) — append at end
  for (const inv of items) {
    if (inv.template_type === 'credit_note' && inv.related_invoice_id) {
      const parentPresent = parents.some((p) => p.id === inv.related_invoice_id);
      if (!parentPresent) rows.push({ inv, isSubRow: false });
    }
  }

  return rows;
}

// ── Main component ────────────────────────────────────────────────────────────
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

  // Clear invoiceId from URL after using it
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

  // When a detail view is open, fetch the full invoice (includes line_items, address fields)
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
      // Navigate to the new credit note
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
      if (d.updated_to_paid > 0) {
        showToast(
          `${d.updated_to_paid} invoice(s) updated to paid. ${d.total_checked} total checked.`,
          'success'
        );
      } else if (d.total_checked > 0) {
        showToast(`Checked ${d.total_checked} invoice(s). No status changes.`, 'info');
      } else {
        showToast('No pending credit card invoices to sync', 'info');
      }
    },
    onError: () => showToast('Failed to sync Stripe payments', 'error'),
  });

  const saveDraftMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/trainings/invoices/${selectedId}`, data),
    onSuccess: () => {
      invalidate();
      showToast('Draft saved', 'success');
    },
    onError: () => showToast('Failed to save draft', 'error'),
  });

  const sendDraftMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post(`/trainings/invoices/${selectedId}/send`, data),
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

  // Find selected invoice (merge list data with full detail data)
  const selectedListItem = items.find((i) => i.id === selectedId);
  const selectedInvoice: TrainingInvoice | null = selectedId
    ? detailData
      ? { ...selectedListItem, ...detailData }
      : (selectedListItem ?? null)
    : null;

  const isMutating = cancelMutation.isPending || markPaidMutation.isPending;

  // ── Create view ────────────────────────────────────────────────────────────
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
          onSave={(data) => saveDraftMutation.mutate(data)}
          onSend={(data) => sendDraftMutation.mutate(data)}
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

  // ── List view ──────────────────────────────────────────────────────────────
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

      {/* Filters */}
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
                      className={`cursor-pointer transition-colors ${
                        isSubRow
                          ? 'bg-orange-50/40 dark:bg-orange-900/5 hover:bg-orange-50 dark:hover:bg-orange-900/10'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
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
