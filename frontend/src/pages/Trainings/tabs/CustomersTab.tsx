/**
 * Customers Tab — Table list with click-to-detail panel pattern.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import CustomerDetailPanel from './CustomerDetailPanel';
import { COUNTRY_OPTIONS, COUNTRIES_BY_CONTINENT } from '../../../config/countries';
import RichTextEditor from '../../../components/common/RichTextEditor';
import ContactPersonList from '../../../components/ContactPersonList';
import VatNumberInput from '../../../components/common/VatNumberInput';
import type { LocationContactPerson } from '../../../types';

export interface Customer {
  id: string;
  tenant_id: string;
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
  contact_persons: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    comment: string | null;
  }[];
  price: number | null;
  currency: string | null;
  notes: string | null;
  is_active: boolean;
  has_inhouse_trainings: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateForm {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  website: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  vat_number: string;
  comments: string;
  price: string;
  currency: string;
  is_active: boolean;
  contact_persons: LocationContactPerson[];
}

const EMPTY_CREATE: CreateForm = {
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  website: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
  vat_number: '',
  comments: '',
  price: '',
  currency: '',
  is_active: true,
  contact_persons: [],
};

const QK = ['training-customers'];

const countryName = (code: string | null) => {
  if (!code) return '-';
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.name ?? code;
};

export default function CustomersTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createNewContact, setCreateNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });

  const { data, isLoading } = useQuery<{
    items: Customer[];
    total: number;
    page: number;
    page_size: number;
  }>({
    queryKey: [...QK, search],
    queryFn: async () => {
      const params: Record<string, string> = { page_size: '500' };
      if (search) params.search = search;
      const res = await api.get('/trainings/customers', { params });
      return res.data;
    },
  });

  const customers = useMemo(() => data?.items ?? [], [data]);
  const customerCount = customers.length;

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QK });
  }, [queryClient]);

  const addCreateContact = () => {
    if (!createNewContact.first_name && !createNewContact.last_name) return;
    setCreateForm((prev) => ({
      ...prev,
      contact_persons: [...(prev.contact_persons || []), { ...createNewContact }],
    }));
    setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
  };

  const removeCreateContact = (index: number) => {
    setCreateForm((prev) => ({
      ...prev,
      contact_persons: (prev.contact_persons || []).filter((_, i) => i !== index),
    }));
  };

  const updateCreateContact = (index: number, contact: LocationContactPerson) => {
    setCreateForm((prev) => ({
      ...prev,
      contact_persons: (prev.contact_persons || []).map((c, i) => (i === index ? contact : c)),
    }));
  };

  const createMutation = useMutation({
    mutationFn: async (form: CreateForm) => {
      // Include any in-progress contact person
      const finalContacts = [...(form.contact_persons || [])];
      if (createNewContact.first_name.trim() || createNewContact.last_name.trim()) {
        finalContacts.push({ ...createNewContact });
      }
      const payload: Record<string, unknown> = {
        name: form.name,
        contact_person: form.contact_person || null,
        email: form.email || null,
        phone: form.phone || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state: form.state || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        vat_number: form.vat_number || null,
        comments: form.comments || null,
        price: form.price ? parseFloat(form.price) : null,
        currency: form.currency || null,
        is_active: form.is_active,
        contact_persons: finalContacts.map((c) => ({
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email || null,
          phone: c.phone || null,
          comment: c.comment || null,
        })),
      };
      const res = await api.post('/trainings/customers', payload);
      return res.data as Customer;
    },
    onSuccess: (newCustomer) => {
      refetch();
      showToast('Customer created', 'success');
      setIsAdding(false);
      setCreateForm(EMPTY_CREATE);
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
      setSelected(newCustomer);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    createMutation.mutate(createForm);
  };

  const inputClass =
    'block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100';

  // ---- Detail panel view ----
  if (selected) {
    return (
      <div>
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to customers list
          </button>
        </div>
        <CustomerDetailPanel
          customer={selected}
          onBack={() => setSelected(null)}
          onSaved={() => {
            refetch();
            // Re-select the customer with updated data after refetch
          }}
        />
      </div>
    );
  }

  // ---- Table list view ----
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Customers
            {customerCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {customerCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage B2B customers for trainings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="w-56 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
          />
          {!isAdding && (
            <button
              type="button"
              onClick={() => {
                setIsAdding(true);
                setCreateForm(EMPTY_CREATE);
              }}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              + Add Customer
            </button>
          )}
        </div>
      </div>

      {/* Inline create form */}
      {isAdding && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4"
        >
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">New Customer</h5>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Company Name *
            </label>
            <input
              type="text"
              required
              className={inputClass}
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <input
                type="text"
                placeholder="+491234545 or 00491234566"
                className={inputClass}
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Website
              </label>
              <input
                type="text"
                placeholder="example.com"
                className={inputClass}
                value={createForm.website}
                onChange={(e) => setCreateForm({ ...createForm, website: e.target.value })}
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
                value={createForm.address_line1}
                onChange={(e) => setCreateForm({ ...createForm, address_line1: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Address Line 2
              </label>
              <input
                type="text"
                className={inputClass}
                value={createForm.address_line2}
                onChange={(e) => setCreateForm({ ...createForm, address_line2: e.target.value })}
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
                className={inputClass}
                value={createForm.city}
                onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                State
              </label>
              <input
                type="text"
                className={inputClass}
                value={createForm.state}
                onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Postal Code
              </label>
              <input
                type="text"
                className={inputClass}
                value={createForm.postal_code}
                onChange={(e) => setCreateForm({ ...createForm, postal_code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Country
              </label>
              <select
                className={inputClass}
                value={createForm.country}
                onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
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
          </div>

          {/* VAT Number */}
          <VatNumberInput
            value={createForm.vat_number}
            onChange={(val) => setCreateForm({ ...createForm, vat_number: val })}
            country={createForm.country || undefined}
            placeholder="e.g., DE123456789"
          />

          {/* Comments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Comments
            </label>
            <RichTextEditor
              value={createForm.comments}
              onChange={(html) => setCreateForm({ ...createForm, comments: html })}
              rows={2}
            />
          </div>

          {/* Contact Persons */}
          <ContactPersonList
            contacts={createForm.contact_persons || []}
            newContact={createNewContact}
            setNewContact={setCreateNewContact}
            addContact={addCreateContact}
            removeContact={removeCreateContact}
            updateContact={updateCreateContact}
          />

          {/* Visible checkbox */}
          <div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">Visible</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">(show on website)</span>
              </span>
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={createMutation.isPending || !createForm.name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setCreateForm(EMPTY_CREATE);
                setCreateNewContact({
                  first_name: '',
                  last_name: '',
                  email: '',
                  phone: '',
                  comment: '',
                });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Customers table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
      ) : customers.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  City
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Country
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => setSelected(customer)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {customer.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {customer.city || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {countryName(customer.country)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        customer.is_active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {customer.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            No customers yet. Click &quot;+ Add Customer&quot; to get started.
          </div>
        )
      )}
    </div>
  );
}
