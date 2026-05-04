/**
 * Bulk-cancel-with-credit-note dialog for the training registrations admin tab.
 *
 * Three steps inside one modal:
 *   1. Filter — admin builds the filter (date range, originating IP,
 *      billing-email pattern, payment status) and writes a reason.
 *   2. Preview — calls /preview, shows total, top-N IP and email groupings,
 *      and the matching rows.
 *   3. Confirm — typed-count guard ("type the number to confirm") to defend
 *      against fat-finger clicks; submit calls /confirm.
 *
 * The dialog short-circuits to the confirm endpoint's response on success
 * and bubbles errors back to the parent for toast display.
 */
import { useState } from 'react';
import api from '../../config/api';
import type { components } from '../../types/api.generated';

type Filter = components['schemas']['RegistrationBulkCancelFilter'];
type Preview = components['schemas']['RegistrationBulkCancelPreview'];
type Result = components['schemas']['RegistrationBulkCancelResult'];

type Step = 'filter' | 'preview' | 'confirm' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted?: (result: Result) => void;
}

export default function BulkCancelDialog({ open, onClose, onCompleted }: Props) {
  const [step, setStep] = useState<Step>('filter');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [originatingIp, setOriginatingIp] = useState('');
  const [emailPattern, setEmailPattern] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<Filter['payment_status']>('any');
  const [reason, setReason] = useState('');

  const [preview, setPreview] = useState<Preview | null>(null);
  // IDs the admin currently wants to cancel. Default = all preview rows
  // (loaded after /preview). Per-row checkboxes toggle membership; the
  // confirm payload sends this set as ``registration_ids`` so the
  // backend cancels only the ticked rows.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCount, setConfirmCount] = useState('');

  if (!open) return null;

  const reset = () => {
    setStep('filter');
    setCreatedAfter('');
    setCreatedBefore('');
    setOriginatingIp('');
    setEmailPattern('');
    setPaymentStatus('any');
    setReason('');
    setPreview(null);
    setSelectedIds(new Set());
    setResult(null);
    setLoading(false);
    setError(null);
    setConfirmCount('');
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const buildFilter = (opts?: { withIds?: boolean }): Filter => ({
    created_after: createdAfter ? new Date(createdAfter).toISOString() : undefined,
    created_before: createdBefore ? new Date(createdBefore).toISOString() : undefined,
    originating_ip: originatingIp.trim() || undefined,
    billing_email_pattern: emailPattern.trim() || undefined,
    payment_status: paymentStatus,
    reason: reason.trim(),
    // Only the confirm path narrows by id subset. Preview always returns
    // the full filter result so the admin has the choice to deselect.
    registration_ids: opts?.withIds ? Array.from(selectedIds) : undefined,
  });

  const handleShowPreview = async () => {
    setError(null);
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<Preview>(
        '/trainings/registrations/bulk-cancel/preview',
        buildFilter()
      );
      setPreview(res.data);
      // Default: all rows ticked. Admin unticks any they want to spare.
      setSelectedIds(new Set((res.data.items ?? []).map((it) => it.registration_id)));
      setStep('preview');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Preview failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<Result>(
        '/trainings/registrations/bulk-cancel/confirm',
        buildFilter({ withIds: true })
      );
      setResult(res.data);
      setStep('done');
      onCompleted?.(res.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Confirm failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (!preview?.items) return;
    setSelectedIds((prev) =>
      prev.size === preview.items!.length
        ? new Set()
        : new Set(preview.items!.map((it) => it.registration_id))
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Cancel many registrations
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}

        {step === 'filter' && (
          <FilterStep
            createdAfter={createdAfter}
            setCreatedAfter={setCreatedAfter}
            createdBefore={createdBefore}
            setCreatedBefore={setCreatedBefore}
            originatingIp={originatingIp}
            setOriginatingIp={setOriginatingIp}
            emailPattern={emailPattern}
            setEmailPattern={setEmailPattern}
            paymentStatus={paymentStatus}
            setPaymentStatus={setPaymentStatus}
            reason={reason}
            setReason={setReason}
            onCancel={handleClose}
            onPreview={handleShowPreview}
            loading={loading}
          />
        )}

        {step === 'preview' && preview && (
          <PreviewStep
            preview={preview}
            selectedIds={selectedIds}
            onToggleId={toggleId}
            onToggleAll={toggleAll}
            onBack={() => setStep('filter')}
            onProceed={() => setStep('confirm')}
          />
        )}

        {step === 'confirm' && preview && (
          <ConfirmStep
            selectedCount={selectedIds.size}
            confirmCount={confirmCount}
            setConfirmCount={setConfirmCount}
            onBack={() => setStep('preview')}
            onConfirm={handleConfirm}
            loading={loading}
          />
        )}

        {step === 'done' && result && <DoneStep result={result} onClose={handleClose} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-steps (kept inline so the whole feature is one file the reviewer can
// scan top-to-bottom; the dialog itself is only opened from one entry
// point in the training admin so file-scoping it here is fine).
// ─────────────────────────────────────────────────────────────────────────

interface FilterStepProps {
  createdAfter: string;
  setCreatedAfter: (v: string) => void;
  createdBefore: string;
  setCreatedBefore: (v: string) => void;
  originatingIp: string;
  setOriginatingIp: (v: string) => void;
  emailPattern: string;
  setEmailPattern: (v: string) => void;
  paymentStatus: Filter['payment_status'];
  setPaymentStatus: (v: Filter['payment_status']) => void;
  reason: string;
  setReason: (v: string) => void;
  onCancel: () => void;
  onPreview: () => void;
  loading: boolean;
}

function FilterStep(p: FilterStepProps) {
  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100';
  return (
    <div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Build a filter, then preview which registrations would be cancelled. Each match gets a
        credit note generated, the original invoice flipped to cancelled, and the credit-note email
        sent to the billing contact.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Created on or after
          </label>
          <input
            type="datetime-local"
            value={p.createdAfter}
            onChange={(e) => p.setCreatedAfter(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Created on or before
          </label>
          <input
            type="datetime-local"
            value={p.createdBefore}
            onChange={(e) => p.setCreatedBefore(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Originating IP
          </label>
          <input
            type="text"
            placeholder="e.g. 203.0.113.42"
            value={p.originatingIp}
            onChange={(e) => p.setOriginatingIp(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Billing email pattern
          </label>
          <input
            type="text"
            placeholder="%@spam.com"
            value={p.emailPattern}
            onChange={(e) => p.setEmailPattern(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Payment status
        </label>
        <select
          value={p.paymentStatus}
          onChange={(e) => p.setPaymentStatus(e.target.value as Filter['payment_status'])}
          className={inputCls}
        >
          <option value="any">Any</option>
          <option value="unpaid">Unpaid only</option>
          <option value="paid">Paid only</option>
        </select>
      </div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Reason (recorded on every credit note + audit log)
        </label>
        <textarea
          rows={3}
          minLength={10}
          maxLength={500}
          placeholder="e.g. bot burst from 203.0.113.42 on 2026-05-04 morning"
          value={p.reason}
          onChange={(e) => p.setReason(e.target.value)}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {p.reason.length} / 500 — minimum 10 characters
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={p.onCancel}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={p.onPreview}
          disabled={p.loading || p.reason.trim().length < 10}
          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-md"
        >
          {p.loading ? 'Loading…' : 'Show matches'}
        </button>
      </div>
    </div>
  );
}

interface PreviewStepProps {
  preview: Preview;
  selectedIds: Set<string>;
  onToggleId: (id: string) => void;
  onToggleAll: () => void;
  onBack: () => void;
  onProceed: () => void;
}

function PreviewStep({
  preview,
  selectedIds,
  onToggleId,
  onToggleAll,
  onBack,
  onProceed,
}: PreviewStepProps) {
  const items = preview.items ?? [];
  const allChecked = items.length > 0 && selectedIds.size === items.length;
  const someChecked = selectedIds.size > 0 && !allChecked;
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Matching</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {preview.total}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Selected</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {selectedIds.size}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Credit-note value</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {preview.total_credit_note_value}
          </div>
        </div>
      </div>

      {preview.truncated && (
        <div className="mb-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 px-3 py-2 rounded text-sm">
          Filter matches more than 500 rows — confirm will refuse. Narrow the filter (tighter date
          range or specific IP) and retry.
        </div>
      )}

      {preview.by_originating_ip && preview.by_originating_ip.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Top originating IPs
          </div>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
            {preview.by_originating_ip.map((g) => (
              <li key={g.key}>
                <code>{g.key}</code> — {g.count}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.by_billing_email && preview.by_billing_email.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Top billing emails
          </div>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
            {preview.by_billing_email.map((g) => (
              <li key={g.key}>
                {g.key} — {g.count}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="px-2 py-1 w-6">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={onToggleAll}
                />
              </th>
              <th className="px-2 py-1 text-left text-gray-500 dark:text-gray-400">Created</th>
              <th className="px-2 py-1 text-left text-gray-500 dark:text-gray-400">Email</th>
              <th className="px-2 py-1 text-left text-gray-500 dark:text-gray-400">IP</th>
              <th className="px-2 py-1 text-right text-gray-500 dark:text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const checked = selectedIds.has(it.registration_id);
              return (
                <tr
                  key={it.registration_id}
                  className={`border-t border-gray-100 dark:border-gray-800 ${
                    checked ? '' : 'opacity-50'
                  }`}
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      aria-label={`Cancel registration ${it.registration_id}`}
                      checked={checked}
                      onChange={() => onToggleId(it.registration_id)}
                    />
                  </td>
                  <td className="px-2 py-1 text-gray-700 dark:text-gray-300">
                    {it.created_at.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-2 py-1 text-gray-700 dark:text-gray-300">{it.billing_email}</td>
                  <td className="px-2 py-1 text-gray-700 dark:text-gray-300">
                    <code>{it.originating_ip ?? '—'}</code>
                  </td>
                  <td className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">
                    {it.invoice_total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md"
        >
          ← Adjust filter
        </button>
        <button
          type="button"
          onClick={onProceed}
          disabled={selectedIds.size === 0 || preview.truncated}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md"
        >
          Proceed to confirm ({selectedIds.size})
        </button>
      </div>
    </div>
  );
}

interface ConfirmStepProps {
  selectedCount: number;
  confirmCount: string;
  setConfirmCount: (v: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function ConfirmStep({
  selectedCount,
  confirmCount,
  setConfirmCount,
  onBack,
  onConfirm,
  loading,
}: ConfirmStepProps) {
  const expected = String(selectedCount);
  const matches = confirmCount === expected;
  return (
    <div>
      <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
        About to cancel <strong>{selectedCount}</strong> registrations and generate the same number
        of credit notes. Each billing contact will receive an email. For paid credit-card invoices,
        Stripe refunds will be initiated automatically. This is not reversible from the UI.
      </div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Type <strong>{expected}</strong> to confirm
      </label>
      <input
        type="text"
        value={confirmCount}
        onChange={(e) => setConfirmCount(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 mb-4"
      />
      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!matches || loading}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md"
        >
          {loading ? 'Cancelling…' : `Cancel ${selectedCount} registrations`}
        </button>
      </div>
    </div>
  );
}

interface DoneStepProps {
  result: Result;
  onClose: () => void;
}

function DoneStep({ result, onClose }: DoneStepProps) {
  return (
    <div>
      <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 px-3 py-3 rounded text-sm">
        <p className="font-medium">Done.</p>
        <ul className="mt-2 space-y-0.5">
          <li>{result.cancelled} registrations cancelled</li>
          <li>{result.credit_notes_created} credit notes created</li>
          <li>{result.emails_sent} credit-note emails sent</li>
          <li>{result.refunds_initiated} Stripe refunds initiated</li>
        </ul>
      </div>
      {result.errors && result.errors.length > 0 && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 px-3 py-2 rounded text-sm">
          <p className="font-medium">Best-effort side-effects with errors:</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {result.errors.map((e, i) => (
              <li key={i}>
                <code>{e.registration_id}</code>: {e.error}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            The cancellations themselves committed successfully — only emails or refunds for these
            specific rows didn't go through. Follow up manually.
          </p>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  );
}
