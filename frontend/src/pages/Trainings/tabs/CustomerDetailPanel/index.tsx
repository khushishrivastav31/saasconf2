/**
 * CustomerDetailPanel — 5-tab detail panel for training customers.
 * Tabs extracted to separate files in this directory.
 */
import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import ContactPersonList from '../../../../components/ContactPersonList';
import type { LocationContactPerson } from '../../../../types';
import type { Customer } from '../CustomersTab';
import DetailsTab from './DetailsTab';
import OffersTab from './OffersTab';
import DocumentsTab from './DocumentsTab';
import CustomerInvoicesTab from './CustomerInvoicesTab';

interface ContactPerson {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  comment: string | null;
}

interface CustomerForm {
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  comments: string | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
  is_active: boolean;
  contact_persons: ContactPerson[];
}

function formFromCustomer(c: Customer): CustomerForm {
  return {
    name: c.name,
    contact_person: c.contact_person,
    email: c.email,
    phone: c.phone,
    website: c.website,
    address_line1: c.address_line1,
    address_line2: c.address_line2,
    city: c.city,
    state: c.state,
    postal_code: c.postal_code,
    country: c.country,
    vat_number: c.vat_number,
    comments: c.comments,
    price: c.price,
    currency: c.currency,
    notes: c.notes,
    is_active: c.is_active,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contact_persons: (c.contact_persons ?? []).map((cp: any) => ({
      first_name: cp.first_name ?? cp.name ?? '',
      last_name: cp.last_name ?? '',
      email: cp.email ?? null,
      phone: cp.phone ?? null,
      comment: cp.comment ?? cp.role ?? null,
    })),
  };
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
  initialOfferId,
  initialTab,
  onBack,
  onSaved,
}: {
  customer: Customer;
  initialOfferId?: string;
  initialTab?: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>((initialTab as TabId) || 'details');
  const [form, setForm] = useState<CustomerForm>(formFromCustomer(customer));
  const [isDirty, setIsDirty] = useState(false);
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm(formFromCustomer(customer));
    setIsDirty(false);
    setConfirmDelete(false);
  }, [customer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = useCallback((key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);
  const discard = useCallback(() => {
    setForm(formFromCustomer(customer));
    setIsDirty(false);
  }, [customer]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        contact_persons: (form.contact_persons ?? []).map((c) => ({
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email || null,
          phone: c.phone || null,
          comment: c.comment || null,
        })),
      };
      return (await api.put(`/trainings/customers/${customer.id}`, payload)).data as Customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-customers'] });
      showToast('Customer updated', 'success');
      setIsDirty(false);
      onSaved();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/trainings/customers/${customer.id}`),
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

  const deactivateMutation = useMutation({
    mutationFn: () => api.put(`/trainings/customers/${customer.id}`, { is_active: false }),
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
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={customer.has_inhouse_trainings}
              className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete
            </button>
            {isDirty && (
              <button
                type="button"
                onClick={discard}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Discard
              </button>
            )}
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
        <nav className="flex px-6 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}`}
            >
              {tab.id === 'contacts' && contactsCount > 0
                ? `${tab.label} (${contactsCount})`
                : tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'details' && (
          <DetailsTab form={form} updateField={updateField} inputClass={inputClass} />
        )}
        {activeTab === 'contacts' && (
          <ContactPersonList
            contacts={(form.contact_persons ?? []) as LocationContactPerson[]}
            newContact={newContact}
            setNewContact={setNewContact}
            addContact={() => {
              if (!newContact.first_name && !newContact.last_name) return;
              setForm((prev) => ({
                ...prev,
                contact_persons: [
                  ...(prev.contact_persons ?? []),
                  { ...newContact } as ContactPerson,
                ],
              }));
              setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
              setIsDirty(true);
            }}
            removeContact={(i) => {
              setForm((prev) => ({
                ...prev,
                contact_persons: (prev.contact_persons ?? []).filter((_, idx) => idx !== i),
              }));
              setIsDirty(true);
            }}
            updateContact={(i, contact) => {
              setForm((prev) => ({
                ...prev,
                contact_persons: (prev.contact_persons ?? []).map((c, idx) =>
                  idx === i ? (contact as ContactPerson) : c
                ),
              }));
              setIsDirty(true);
            }}
          />
        )}
        {activeTab === 'offers' && (
          <OffersTab
            customerId={customer.id}
            customerName={customer.name}
            initialOfferId={initialOfferId}
            contactPersons={(form.contact_persons ?? []).map((cp) => ({
              first_name: cp.first_name,
              last_name: cp.last_name,
              email: cp.email ?? '',
              phone: cp.phone ?? undefined,
            }))}
          />
        )}
        {activeTab === 'documents' && <DocumentsTab customerId={customer.id} />}
        {activeTab === 'invoices' && <CustomerInvoicesTab customerId={customer.id} />}
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
