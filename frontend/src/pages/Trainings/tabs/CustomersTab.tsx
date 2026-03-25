/**
 * Customers Tab — CRUD for B2B training customers.
 * Sidebar list + detail form pattern.
 */
import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import { COUNTRY_OPTIONS } from '../../../config/countries';

interface Customer {
  id: string;
  tenant_id: string;
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
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type CustomerForm = Omit<Customer, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>;

const EMPTY_FORM: CustomerForm = {
  name: '',
  contact_person: null,
  email: null,
  phone: null,
  address_line1: null,
  address_line2: null,
  city: null,
  postal_code: null,
  country: null,
  vat_number: null,
  notes: null,
  is_active: true,
};

const QK = ['training-customers'];

export default function CustomersTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery<{ items: Customer[] }>({
    queryKey: [...QK, search],
    queryFn: async () => {
      const params: Record<string, string> = { page_size: '500' };
      if (search) params.search = search;
      const res = await api.get('/trainings/customers', { params });
      return res.data;
    },
  });

  const customers = useMemo(() => data?.items ?? [], [data]);
  const selected = useMemo(
    () => customers.find((c) => c.id === selectedId) ?? null,
    [customers, selectedId]
  );

  const selectCustomer = useCallback((c: Customer) => {
    setSelectedId(c.id);
    setIsCreating(false);
    setForm({
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
      notes: c.notes,
      is_active: c.is_active,
    });
    setIsDirty(false);
    setConfirmDelete(false);
  }, []);

  const startCreate = () => {
    setSelectedId(null);
    setIsCreating(true);
    setForm(EMPTY_FORM);
    setIsDirty(false);
  };

  const updateField = (key: keyof CustomerForm, value: string | boolean | null) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isCreating) {
        return (await api.post('/trainings/customers', form)).data;
      }
      return (await api.put(`/trainings/customers/${selectedId}`, form)).data;
    },
    onSuccess: (data: Customer) => {
      queryClient.invalidateQueries({ queryKey: QK });
      showToast(isCreating ? 'Customer created' : 'Customer updated', 'success');
      setSelectedId(data.id);
      setIsCreating(false);
      setIsDirty(false);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/trainings/customers/${selectedId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      showToast('Customer deleted', 'success');
      setSelectedId(null);
      setConfirmDelete(false);
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      setConfirmDelete(false);
    },
  });

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="flex gap-6 min-h-[500px]">
      {/* Left: customer list */}
      <div className="w-64 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Customers</h3>
          <button
            onClick={startCreate}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium"
          >
            + Add
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className={inputClass + ' mb-3'}
        />
        {isLoading ? (
          <div className="text-center py-4 text-gray-400 text-sm">Loading...</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">No customers found</div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedId === c.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <p className="font-medium truncate">{c.name}</p>
                {c.city && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.city}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: detail form */}
      <div className="flex-1 min-w-0">
        {!selected && !isCreating ? (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
            Select a customer or click + Add
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {isCreating ? 'New Customer' : form.name || 'Customer'}
              </h4>
              <div className="flex gap-2">
                {!isCreating && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-md"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={!isDirty || saveMutation.isPending || !form.name.trim()}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveMutation.isPending ? 'Saving...' : isCreating ? 'Create' : 'Save'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={form.contact_person ?? ''}
                    onChange={(e) => updateField('contact_person', e.target.value || null)}
                    className={inputClass}
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
                    value={form.email ?? ''}
                    onChange={(e) => updateField('email', e.target.value || null)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone ?? ''}
                    onChange={(e) => updateField('phone', e.target.value || null)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Address Line 1
                </label>
                <input
                  type="text"
                  value={form.address_line1 ?? ''}
                  onChange={(e) => updateField('address_line1', e.target.value || null)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={form.address_line2 ?? ''}
                  onChange={(e) => updateField('address_line2', e.target.value || null)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={form.city ?? ''}
                    onChange={(e) => updateField('city', e.target.value || null)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={form.postal_code ?? ''}
                    onChange={(e) => updateField('postal_code', e.target.value || null)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Country
                  </label>
                  <select
                    value={form.country ?? ''}
                    onChange={(e) => updateField('country', e.target.value || null)}
                    className={inputClass}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  VAT Number
                </label>
                <input
                  type="text"
                  value={form.vat_number ?? ''}
                  onChange={(e) => updateField('vat_number', e.target.value || null)}
                  placeholder="e.g. DE123456789"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={(e) => updateField('notes', e.target.value || null)}
                  rows={3}
                  className={inputClass}
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
              This will permanently delete &quot;{selected?.name}&quot;. Customers with linked
              inhouse trainings cannot be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
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
