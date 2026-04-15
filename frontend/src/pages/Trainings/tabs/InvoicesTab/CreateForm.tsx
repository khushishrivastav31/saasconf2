import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';
import { COUNTRIES_BY_CONTINENT } from '../../../../config/countries';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import { validateEmail } from '../../../../utils/validators';
import type { LineItemInput } from './types';
import LineItemsEditor, { InvoiceTotalsEditor } from './LineItemsEditor';

export default function CreateForm({
  onBack,
  onCreate,
}: {
  onBack: () => void;
  onCreate: (id: string) => void;
}) {
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
  const [emailError, setEmailError] = useState<string | null>(null);
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
                  onChange={(e) => {
                    setRecipientEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  onBlur={() => {
                    const err = validateEmail(recipientEmail);
                    setEmailError(err);
                  }}
                  className={`${inputCls} ${emailError ? 'border-red-500 dark:border-red-500' : ''}`}
                />
                {emailError && (
                  <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{emailError}</p>
                )}
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
                <select
                  value={recipientCountry}
                  onChange={(e) => setRecipientCountry(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select a country</option>
                  {COUNTRIES_BY_CONTINENT.map((group) => (
                    <optgroup key={group.continent} label={group.continent}>
                      {group.countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  VAT Number
                </label>
                <VatNumberInput
                  value={recipientVat}
                  onChange={(val) => setRecipientVat(val)}
                  country={recipientCountry || undefined}
                  placeholder="e.g., DE123456789"
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
