import type {
  Conference,
  InvoiceCreate,
  InvoiceLineItem,
  InvoiceTemplateType,
  LocationContactPerson,
  PlatformCurrency,
  RecipientSearchResult,
} from '../../../../types';
import RecipientPicker from '../../../../components/RecipientPicker';
import ContactPersonList from '../../../../components/ContactPersonList';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import { validateEmail } from '../../../../utils/validators';
import { COUNTRIES_BY_CONTINENT } from '../../../../config/countries';
import InvoiceLineItemsEditor from './InvoiceLineItemsEditor';

const TEMPLATE_TYPE_OPTIONS: { value: InvoiceTemplateType; label: string }[] = [
  { value: 'bank_transfer', label: 'Invoice (Bank Transfer)' },
  { value: 'credit_card', label: 'Invoice (Credit Card)' },
  { value: 'credit_note', label: 'Credit Note' },
];

interface CreateInvoiceFormProps {
  conference: Conference;
  form: InvoiceCreate;
  setForm: React.Dispatch<React.SetStateAction<InvoiceCreate>>;
  newContact: LocationContactPerson;
  setNewContact: React.Dispatch<React.SetStateAction<LocationContactPerson>>;
  autoCalculateVat: boolean;
  setAutoCalculateVat: (v: boolean) => void;
  isLoadingVatPreview: boolean;
  setIsLoadingVatPreview: (v: boolean) => void;
  emailError: string | null;
  setEmailError: (v: string | null) => void;
  isPending: boolean;
  isCurrencyLocked: boolean;
  currencies: PlatformCurrency[];
  fmtAmount: (value: number | null | undefined) => string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onRecipientSelect: (result: RecipientSearchResult) => void;
  onManualEntry: () => void;
  onAddLineItem: () => void;
  onRemoveLineItem: (index: number) => void;
  onUpdateLineItem: (index: number, field: keyof InvoiceLineItem, value: string | number) => void;
  onTaxRateChange: (rate: number) => void;
  onAddContact: () => void;
  onRemoveContact: (index: number) => void;
  onUpdateContact: (index: number, contact: LocationContactPerson) => void;
}

export default function CreateInvoiceForm({
  conference,
  form,
  setForm,
  newContact,
  setNewContact,
  autoCalculateVat,
  setAutoCalculateVat,
  isLoadingVatPreview,
  setIsLoadingVatPreview,
  emailError,
  setEmailError,
  isPending,
  isCurrencyLocked,
  currencies,
  fmtAmount,
  onSubmit,
  onCancel,
  onRecipientSelect,
  onManualEntry,
  onAddLineItem,
  onRemoveLineItem,
  onUpdateLineItem,
  onTaxRateChange,
  onAddContact,
  onRemoveContact,
  onUpdateContact,
}: CreateInvoiceFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4"
    >
      <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">New Invoice (Draft)</h5>

      {/* Template Type + Dates */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Template Type
          </label>
          <select
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            value={form.template_type || 'bank_transfer'}
            onChange={(e) =>
              setForm({ ...form, template_type: e.target.value as InvoiceTemplateType })
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
            value={form.issue_date || ''}
            onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Due Date
          </label>
          <input
            type="date"
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            value={form.due_date || ''}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
        </div>
      </div>

      {/* Recipient Picker */}
      <RecipientPicker
        conferenceId={conference.id}
        onSelect={onRecipientSelect}
        onManualEntry={onManualEntry}
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
            value={form.recipient_name}
            onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Recipient Email
          </label>
          <input
            type="email"
            className={`block w-full border ${emailError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100`}
            value={form.recipient_email || ''}
            onChange={(e) => setForm({ ...form, recipient_email: e.target.value })}
            onBlur={(e) => setEmailError(validateEmail(e.target.value))}
          />
          {emailError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
          )}
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
            value={form.recipient_address_line1 || ''}
            onChange={(e) => setForm({ ...form, recipient_address_line1: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address Line 2
          </label>
          <input
            type="text"
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            value={form.recipient_address_line2 || ''}
            onChange={(e) => setForm({ ...form, recipient_address_line2: e.target.value })}
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
            value={form.recipient_city || ''}
            onChange={(e) => setForm({ ...form, recipient_city: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Postal Code
          </label>
          <input
            type="text"
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            value={form.recipient_postal_code || ''}
            onChange={(e) => setForm({ ...form, recipient_postal_code: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Country
          </label>
          <select
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            value={form.recipient_country || ''}
            onChange={(e) => setForm({ ...form, recipient_country: e.target.value })}
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
        <VatNumberInput
          value={form.recipient_vat_number || ''}
          onChange={(val) => setForm({ ...form, recipient_vat_number: val })}
          country={form.recipient_country || undefined}
        />
      </div>

      {/* Line Items */}
      <InvoiceLineItemsEditor
        lineItems={form.line_items || []}
        subtotal={form.subtotal ?? 0}
        taxRate={form.tax_rate}
        taxAmount={form.tax_amount}
        total={form.total}
        currency={form.currency || conference.currency || ''}
        autoCalculateVat={autoCalculateVat}
        setAutoCalculateVat={setAutoCalculateVat}
        isLoadingVatPreview={isLoadingVatPreview}
        setIsLoadingVatPreview={setIsLoadingVatPreview}
        fmtAmount={fmtAmount}
        onAddItem={onAddLineItem}
        onRemoveItem={onRemoveLineItem}
        onUpdateItem={onUpdateLineItem}
        onTaxRateChange={onTaxRateChange}
      />

      {/* Currency selector — only shown when conference has no currency set */}
      {!isCurrencyLocked && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Currency
          </label>
          <select
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            value={form.currency || ''}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            <option value="">-- Select Currency --</option>
            {(currencies || []).map((c) => (
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
          value={form.notes || ''}
          onChange={(html) => setForm({ ...form, notes: html })}
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
          value={form.internal_comment || ''}
          onChange={(e) => setForm({ ...form, internal_comment: e.target.value })}
          placeholder="Admin-only notes..."
        />
      </div>

      {/* Contact Persons */}
      <ContactPersonList
        contacts={form.contact_persons || []}
        newContact={newContact}
        setNewContact={setNewContact}
        addContact={onAddContact}
        removeContact={onRemoveContact}
        updateContact={onUpdateContact}
      />

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending || !!emailError}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {isPending ? 'Creating...' : 'Create Draft'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
