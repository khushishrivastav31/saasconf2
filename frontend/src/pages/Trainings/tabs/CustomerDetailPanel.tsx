/**
 * CustomerDetailPanel — 5-tab detail panel for training customers.
 * Matches the SponsorDetailPanel pattern.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import { COUNTRY_OPTIONS } from '../../../config/countries';
import VatNumberInput from '../../../components/common/VatNumberInput';
import type { Customer } from './CustomersTab';

interface ContactPerson {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

interface CustomerForm {
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
  is_active: boolean;
  contact_persons: ContactPerson[];
}

interface Attachment {
  id: string;
  filename: string;
  file_size: number;
  content_type: string;
  created_at: string;
}

function formFromCustomer(c: Customer): CustomerForm {
  return {
    name: c.name,
    contact_person: c.contact_person,
    email: c.email,
    phone: c.phone,
    address_line1: c.address_line1,
    address_line2: c.address_line2,
    city: c.city,
    postal_code: c.postal_code,
    country: c.country,
    vat_number: c.vat_number,
    price: c.price,
    currency: c.currency,
    notes: c.notes,
    is_active: c.is_active,
    contact_persons: c.contact_persons ?? [],
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'offers', label: 'Offers' },
  { id: 'documents', label: 'Documents' },
  { id: 'invoices', label: 'Invoices' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function CustomerDetailPanel({
  customer,
  onBack,
  onSaved,
}: {
  customer: Customer;
  onBack: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [form, setForm] = useState<CustomerForm>(formFromCustomer(customer));
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset form when customer changes
  useEffect(() => {
    setForm(formFromCustomer(customer));
    setIsDirty(false);
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

  const updateField = useCallback((key: keyof CustomerForm, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const discard = useCallback(() => {
    setForm(formFromCustomer(customer));
    setIsDirty(false);
  }, [customer]);

  // ---- Save mutation ----
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/trainings/customers/${customer.id}`, form);
      return res.data as Customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers'] });
      showToast('Customer updated', 'success');
      setIsDirty(false);
      onSaved();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // ---- Delete mutation ----
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/trainings/customers/${customer.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers'] });
      showToast('Customer deleted', 'success');
      onBack();
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      setConfirmDelete(false);
    },
  });

  // ---- Deactivate mutation ----
  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/trainings/customers/${customer.id}`, { is_active: false });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers'] });
      showToast('Customer deactivated', 'success');
      onSaved();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const contactsCount = form.contact_persons.length;

  const inputClass =
    'block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {customer.name}
            </h3>
            {customer.city && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{customer.city}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Deactivate button when has inhouse trainings */}
            {customer.has_inhouse_trainings && customer.is_active && (
              <button
                type="button"
                onClick={() => deactivateMutation.mutate()}
                disabled={deactivateMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-900/30 border border-amber-300 dark:border-amber-600 rounded-md transition-colors disabled:opacity-50"
              >
                Deactivate
              </button>
            )}
            {/* Delete button */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={customer.has_inhouse_trainings}
                className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
              {customer.has_inhouse_trainings && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                  Cannot delete: has linked inhouse trainings
                </span>
              )}
            </div>
            {/* Discard */}
            {isDirty && (
              <button
                type="button"
                onClick={discard}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Discard
              </button>
            )}
            {/* Save */}
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!isDirty || saveMutation.isPending || !form.name.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex px-6 -mb-px" aria-label="Tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const label =
              tab.id === 'contacts' && contactsCount > 0
                ? `${tab.label} (${contactsCount})`
                : tab.label;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'details' && (
          <DetailsTab
            form={form}
            updateField={updateField}
            inputClass={inputClass}
            customerId={customer.id}
          />
        )}
        {activeTab === 'contacts' && (
          <ContactsTab
            contacts={form.contact_persons}
            onChange={(contacts) => {
              setForm((prev) => ({ ...prev, contact_persons: contacts }));
              setIsDirty(true);
            }}
            inputClass={inputClass}
          />
        )}
        {activeTab === 'offers' && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-sm">Offer management coming soon.</p>
          </div>
        )}
        {activeTab === 'documents' && <DocumentsTab customerId={customer.id} />}
        {activeTab === 'invoices' && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-sm">Invoice management coming soon.</p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Customer?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This will permanently delete &quot;{customer.name}&quot;. This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Details
// ---------------------------------------------------------------------------

function DetailsTab({
  form,
  updateField,
  inputClass,
  customerId,
}: {
  form: CustomerForm;
  updateField: (key: keyof CustomerForm, value: unknown) => void;
  inputClass: string;
  customerId: string;
}) {
  return (
    <div className="space-y-5">
      {/* Logo upload */}
      <LogoUpload customerId={customerId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Company Name *
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Contact Person
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.contact_person ?? ''}
            onChange={(e) => updateField('contact_person', e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            type="email"
            className={inputClass}
            value={form.email ?? ''}
            onChange={(e) => updateField('email', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.phone ?? ''}
            onChange={(e) => updateField('phone', e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address Line 1
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.address_line1 ?? ''}
            onChange={(e) => updateField('address_line1', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address Line 2
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.address_line2 ?? ''}
            onChange={(e) => updateField('address_line2', e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            City
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.city ?? ''}
            onChange={(e) => updateField('city', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Postal Code
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.postal_code ?? ''}
            onChange={(e) => updateField('postal_code', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Country
          </label>
          <select
            className={inputClass}
            value={form.country ?? ''}
            onChange={(e) => updateField('country', e.target.value || null)}
          >
            <option value="">Select...</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <VatNumberInput
        value={form.vat_number ?? ''}
        onChange={(val) => updateField('vat_number', val || null)}
        country={form.country || undefined}
        placeholder="e.g., DE123456789"
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Price
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={form.price ?? ''}
            onChange={(e) =>
              updateField('price', e.target.value ? parseFloat(e.target.value) : null)
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Currency
          </label>
          <input
            type="text"
            maxLength={3}
            placeholder="EUR"
            className={inputClass}
            value={form.currency ?? ''}
            onChange={(e) => updateField('currency', e.target.value.toUpperCase() || null)}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes
        </label>
        <textarea
          rows={3}
          className={inputClass}
          value={form.notes ?? ''}
          onChange={(e) => updateField('notes', e.target.value || null)}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => updateField('is_active', e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logo Upload sub-component
// ---------------------------------------------------------------------------

function LogoUpload({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: logoData } = useQuery<{ items: Attachment[] }>({
    queryKey: ['training-customers', customerId, 'logo'],
    queryFn: async () => {
      const res = await api.get('/attachments', {
        params: { entity_type: 'customer_logo', entity_id: customerId },
      });
      return res.data;
    },
  });

  const logo = useMemo(() => logoData?.items?.[0] ?? null, [logoData]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'customer_logo');
      fd.append('entity_id', customerId);
      await api.post('/attachments', fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers', customerId, 'logo'] });
      showToast('Logo uploaded', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers', customerId, 'logo'] });
      showToast('Logo removed', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
        {logo ? (
          <img
            src={`/api/v1/attachments/${logo.id}/download`}
            alt="Logo"
            className="w-full h-full object-contain"
          />
        ) : (
          <svg
            className="w-8 h-8 text-gray-300 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {uploadMutation.isPending ? 'Uploading...' : 'Upload Logo'}
        </button>
        {logo && (
          <button
            type="button"
            onClick={() => deleteMutation.mutate(logo.id)}
            disabled={deleteMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Contacts
// ---------------------------------------------------------------------------

function ContactsTab({
  contacts,
  onChange,
  inputClass,
}: {
  contacts: ContactPerson[];
  onChange: (contacts: ContactPerson[]) => void;
  inputClass: string;
}) {
  const [newContact, setNewContact] = useState<ContactPerson>({
    name: '',
    email: null,
    phone: null,
    role: null,
  });

  const addContact = () => {
    if (!newContact.name.trim()) return;
    onChange([...contacts, { ...newContact }]);
    setNewContact({ name: '', email: null, phone: null, role: null });
  };

  const removeContact = (index: number) => {
    onChange(contacts.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof ContactPerson, value: string | null) => {
    const updated = contacts.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {contacts.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No contact persons yet.</p>
      )}

      {contacts.map((contact, idx) => (
        <div
          key={idx}
          className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Contact {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeContact(idx)}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Name *
              </label>
              <input
                type="text"
                className={inputClass}
                value={contact.name}
                onChange={(e) => updateContact(idx, 'name', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Role
              </label>
              <input
                type="text"
                className={inputClass}
                value={contact.role ?? ''}
                onChange={(e) => updateContact(idx, 'role', e.target.value || null)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Email
              </label>
              <input
                type="email"
                className={inputClass}
                value={contact.email ?? ''}
                onChange={(e) => updateContact(idx, 'email', e.target.value || null)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Phone
              </label>
              <input
                type="text"
                className={inputClass}
                value={contact.phone ?? ''}
                onChange={(e) => updateContact(idx, 'phone', e.target.value || null)}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add new contact */}
      <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
        <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">
          Add Contact Person
        </h5>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Name *
            </label>
            <input
              type="text"
              className={inputClass}
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Role
            </label>
            <input
              type="text"
              className={inputClass}
              value={newContact.role ?? ''}
              onChange={(e) => setNewContact({ ...newContact, role: e.target.value || null })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Email
            </label>
            <input
              type="email"
              className={inputClass}
              value={newContact.email ?? ''}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value || null })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Phone
            </label>
            <input
              type="text"
              className={inputClass}
              value={newContact.phone ?? ''}
              onChange={(e) => setNewContact({ ...newContact, phone: e.target.value || null })}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={addContact}
          disabled={!newContact.name.trim()}
          className="mt-3 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Documents
// ---------------------------------------------------------------------------

function DocumentsTab({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ items: Attachment[] }>({
    queryKey: ['training-customers', customerId, 'documents'],
    queryFn: async () => {
      const res = await api.get('/attachments', {
        params: { entity_type: 'customer', entity_id: customerId },
      });
      return res.data;
    },
  });

  const attachments = useMemo(() => data?.items ?? [], [data]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'customer');
      fd.append('entity_id', customerId);
      await api.post('/attachments', fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers', customerId, 'documents'] });
      showToast('File uploaded', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers', customerId, 'documents'] });
      showToast('File deleted', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Files attached to this customer.</p>
        <div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {uploadMutation.isPending ? 'Uploading...' : '+ Upload File'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
      ) : attachments.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {att.filename}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(att.file_size)} &middot;{' '}
                  {new Date(att.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <a
                  href={`/api/v1/attachments/${att.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 dark:text-gray-500 hover:text-blue-600 p-1 rounded transition-colors"
                  title="Download"
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
                </a>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(att.id)}
                  disabled={deleteMutation.isPending}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                  title="Delete"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No documents uploaded yet.
        </div>
      )}
    </div>
  );
}
