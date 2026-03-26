/**
 * CustomerDetailPanel — 5-tab detail panel for training customers.
 * Matches the SponsorDetailPanel pattern.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';
import { COUNTRIES_BY_CONTINENT } from '../../../config/countries';
import VatNumberInput from '../../../components/common/VatNumberInput';
import RichTextEditor from '../../../components/common/RichTextEditor';
import ContactPersonList from '../../../components/ContactPersonList';
import type { LocationContactPerson } from '../../../types';
import { queryKeys } from '../../../config/queryKeys';
import { usePlatformCurrencies } from '../../../hooks/api/usePlatformCurrencies';
import type { CustomerOffer, AvailablePlacement } from '../../../types/training';
import type { Customer } from './CustomersTab';
import OfferDocumentsSection from './OfferDocumentsSection';

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
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });
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
      const res = await api.put(`/trainings/customers/${customer.id}`, payload);
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
            removeContact={(index) => {
              setForm((prev) => ({
                ...prev,
                contact_persons: (prev.contact_persons ?? []).filter((_, i) => i !== index),
              }));
              setIsDirty(true);
            }}
            updateContact={(index, contact) => {
              setForm((prev) => ({
                ...prev,
                contact_persons: (prev.contact_persons ?? []).map((c, i) =>
                  i === index ? (contact as ContactPerson) : c
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
            contactPersons={(form.contact_persons ?? []).map((cp) => ({
              first_name: cp.first_name,
              last_name: cp.last_name,
              email: cp.email ?? '',
              phone: cp.phone ?? undefined,
            }))}
          />
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
}: {
  form: CustomerForm;
  updateField: (key: keyof CustomerForm, value: unknown) => void;
  inputClass: string;
}) {
  return (
    <div className="space-y-5">
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
            Email
          </label>
          <input
            type="email"
            className={inputClass}
            value={form.email ?? ''}
            onChange={(e) => updateField('email', e.target.value || null)}
          />
        </div>
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
            value={form.phone ?? ''}
            onChange={(e) => updateField('phone', e.target.value || null)}
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
            value={form.website ?? ''}
            onChange={(e) => updateField('website', e.target.value || null)}
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

      <div className="grid grid-cols-4 gap-4">
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
            State
          </label>
          <input
            type="text"
            className={inputClass}
            value={form.state ?? ''}
            onChange={(e) => updateField('state', e.target.value || null)}
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

      <VatNumberInput
        value={form.vat_number ?? ''}
        onChange={(val) => updateField('vat_number', val || null)}
        country={form.country || undefined}
        placeholder="e.g., DE123456789"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Comments
        </label>
        <RichTextEditor
          value={form.comments ?? ''}
          onChange={(html) => updateField('comments', html || null)}
          rows={2}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Offers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const PLACEMENT_TYPE_COLORS: Record<string, string> = {
  inhouse: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  hybrid: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  open: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

interface OfferForm {
  attendees: number | null;
  training_price: number | null;
  certification_price: number | null;
  currency: string;
  status: 'draft' | 'sent' | 'rejected' | 'accepted';
  comments: string | null;
  notes: string | null;
}

interface CreateOfferForm {
  placement_ids: string[];
  attendees: number | null;
  training_price: number | null;
  certification_price: number | null;
  currency: string;
  comments: string | null;
  notes: string | null;
}

const OfferRow = React.memo(function OfferRow({
  offer,
  onClick,
}: {
  offer: CustomerOffer;
  onClick: (offer: CustomerOffer) => void;
}) {
  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
      onClick={() => onClick(offer)}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
        {offer.offer_number}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[offer.status] || STATUS_COLORS.draft}`}
        >
          {offer.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {offer.placements.length}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {offer.training_price != null
          ? `${offer.training_price.toLocaleString()} ${offer.currency}`
          : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {offer.certification_price != null
          ? `${offer.certification_price.toLocaleString()} ${offer.currency}`
          : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        {new Date(offer.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
});

function OffersTab({
  customerId,
  customerName,
  contactPersons,
}: {
  customerId: string;
  customerName: string;
  contactPersons: Array<{ first_name: string; last_name: string; email: string; phone?: string }>;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: currencies = [] } = usePlatformCurrencies();

  const [selectedOffer, setSelectedOffer] = useState<CustomerOffer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editForm, setEditForm] = useState<OfferForm | null>(null);
  const [showAddPlacements, setShowAddPlacements] = useState(false);
  const [addPlacementIds, setAddPlacementIds] = useState<string[]>([]);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [confirmDeleteOffer, setConfirmDeleteOffer] = useState(false);

  const [createForm, setCreateForm] = useState<CreateOfferForm>({
    placement_ids: [],
    attendees: null,
    training_price: null,
    certification_price: null,
    currency: 'EUR',
    comments: null,
    notes: null,
  });

  // Fetch offers
  const { data: offersData, isLoading } = useQuery<CustomerOffer[]>({
    queryKey: queryKeys.customerOffers(customerId),
    queryFn: async () => {
      const res = await api.get(`/trainings/offers?customer_id=${customerId}`);
      return res.data;
    },
  });
  const offers = useMemo(() => offersData ?? [], [offersData]);

  // Fetch available placements
  const { data: availableData } = useQuery<AvailablePlacement[]>({
    queryKey: queryKeys.availablePlacements,
    queryFn: async () => {
      const res = await api.get('/trainings/offers/available-placements');
      return res.data;
    },
    enabled: showCreate || showAddPlacements,
  });
  const availablePlacements = useMemo(() => availableData ?? [], [availableData]);

  // Group available placements by year
  const placementsByYear = useMemo(() => {
    const grouped: Record<number, AvailablePlacement[]> = {};
    for (const p of availablePlacements) {
      if (!grouped[p.program_year]) grouped[p.program_year] = [];
      grouped[p.program_year].push(p);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, placements]) => ({ year: Number(year), placements }));
  }, [availablePlacements]);

  const invalidateOffers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customerOffers(customerId) });
  }, [queryClient, customerId]);

  // Select offer and init edit form
  const handleSelectOffer = useCallback((offer: CustomerOffer) => {
    setSelectedOffer(offer);
    setEditForm({
      attendees: offer.attendees,
      training_price: offer.training_price,
      certification_price: offer.certification_price,
      currency: offer.currency,
      status: offer.status,
      comments: offer.comments,
      notes: offer.notes,
    });
    setShowCreate(false);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedOffer(null);
    setEditForm(null);
    setShowAddPlacements(false);
    setRemoveConfirm(null);
    setConfirmDeleteOffer(false);
  }, []);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/trainings/offers', {
        customer_id: customerId,
        placement_ids: createForm.placement_ids,
        attendees: createForm.attendees,
        training_price: createForm.training_price,
        certification_price: createForm.certification_price,
        currency: createForm.currency,
        comments: createForm.comments,
        notes: createForm.notes,
      });
      return res.data as CustomerOffer;
    },
    onSuccess: (newOffer) => {
      invalidateOffers();
      showToast('Offer created', 'success');
      setShowCreate(false);
      setCreateForm({
        placement_ids: [],
        attendees: null,
        training_price: null,
        certification_price: null,
        currency: 'EUR',
        comments: null,
        notes: null,
      });
      handleSelectOffer(newOffer);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOffer || !editForm) return;
      const res = await api.put(`/trainings/offers/${selectedOffer.id}`, editForm);
      return res.data as CustomerOffer;
    },
    onSuccess: (updated) => {
      invalidateOffers();
      showToast('Offer updated', 'success');
      if (updated) handleSelectOffer(updated);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Delete offer mutation
  const deleteOfferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOffer) return;
      await api.delete(`/trainings/offers/${selectedOffer.id}`);
    },
    onSuccess: () => {
      invalidateOffers();
      showToast('Offer deleted', 'success');
      handleBackToList();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Add placements mutation
  const addPlacementsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOffer) return;
      const res = await api.post(`/trainings/offers/${selectedOffer.id}/placements`, {
        placement_ids: addPlacementIds,
      });
      return res.data as CustomerOffer;
    },
    onSuccess: (updated) => {
      invalidateOffers();
      showToast('Trainings added', 'success');
      setShowAddPlacements(false);
      setAddPlacementIds([]);
      if (updated) handleSelectOffer(updated);
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  // Remove placement mutation
  const removePlacementMutation = useMutation({
    mutationFn: async ({
      placementId,
      deleteFromProgram,
    }: {
      placementId: string;
      deleteFromProgram: boolean;
    }) => {
      if (!selectedOffer) return;
      const res = await api.delete(
        `/trainings/offers/${selectedOffer.id}/placements/${placementId}?delete_from_program=${deleteFromProgram}`
      );
      return res.data as CustomerOffer;
    },
    onSuccess: (updated) => {
      invalidateOffers();
      showToast('Training removed from offer', 'success');
      setRemoveConfirm(null);
      if (updated) handleSelectOffer(updated);
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      setRemoveConfirm(null);
    },
  });

  const inputClass =
    'block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100';

  // ---------- CREATE FORM ----------
  if (showCreate) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Create Offer</h4>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>

        {/* Placement selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Trainings (Inhouse/Hybrid placements)
          </label>
          {placementsByYear.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No available placements found.
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-60 overflow-y-auto">
              {placementsByYear.map(({ year, placements }) => (
                <div key={year}>
                  <div className="sticky top-0 px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    {year}
                  </div>
                  {placements.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={createForm.placement_ids.includes(p.id)}
                        onChange={(e) => {
                          setCreateForm((prev) => ({
                            ...prev,
                            placement_ids: e.target.checked
                              ? [...prev.placement_ids, p.id]
                              : prev.placement_ids.filter((id) => id !== p.id),
                          }));
                        }}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {p.training_slug || p.training_name}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(p.start_date).toLocaleDateString()}
                        </span>
                        {p.location_name && (
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                            {p.location_name}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLACEMENT_TYPE_COLORS[p.placement_type] || PLACEMENT_TYPE_COLORS.open}`}
                      >
                        {p.placement_type}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Attendees
            </label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={createForm.attendees ?? ''}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  attendees: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Training Price
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={createForm.training_price ?? ''}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  training_price: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Certification Price
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={createForm.certification_price ?? ''}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  certification_price: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Currency
            </label>
            <select
              className={inputClass}
              value={createForm.currency}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, currency: e.target.value }))}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Comments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Comments
          </label>
          <RichTextEditor
            value={createForm.comments ?? ''}
            onChange={(html) => setCreateForm((prev) => ({ ...prev, comments: html || null }))}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || createForm.placement_ids.length === 0}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Offer'}
          </button>
        </div>
      </div>
    );
  }

  // ---------- DETAIL VIEW ----------
  if (selectedOffer && editForm) {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToList}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              &larr; Back to list
            </button>
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {selectedOffer.offer_number}
            </h4>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedOffer.status] || STATUS_COLORS.draft}`}
            >
              {selectedOffer.status}
            </span>
          </div>
        </div>

        {/* Assigned Placements */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Assigned Trainings ({selectedOffer.placements.length})
            </h5>
            <button
              type="button"
              onClick={() => {
                setShowAddPlacements(true);
                setAddPlacementIds([]);
              }}
              className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              + Add Training
            </button>
          </div>

          {selectedOffer.placements.length > 0 ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Training
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Location
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {selectedOffer.placements.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                        {p.training_slug || p.training_name}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        {new Date(p.start_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        {p.location_name || '-'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLACEMENT_TYPE_COLORS[p.placement_type] || PLACEMENT_TYPE_COLORS.open}`}
                        >
                          {p.placement_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setRemoveConfirm(p.id)}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="Remove from offer"
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              No trainings assigned yet.
            </p>
          )}
        </div>

        {/* Add placements picker */}
        {showAddPlacements && (
          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-900/20">
            <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              Add Trainings to Offer
            </h5>
            {placementsByYear.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No available placements found.
              </p>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-800">
                {placementsByYear.map(({ year, placements }) => {
                  const existingIds = new Set(selectedOffer.placements.map((p) => p.id));
                  const filtered = placements.filter((p) => !existingIds.has(p.id));
                  if (filtered.length === 0) return null;
                  return (
                    <div key={year}>
                      <div className="sticky top-0 px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                        {year}
                      </div>
                      {filtered.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={addPlacementIds.includes(p.id)}
                            onChange={(e) => {
                              setAddPlacementIds((prev) =>
                                e.target.checked
                                  ? [...prev, p.id]
                                  : prev.filter((id) => id !== p.id)
                              );
                            }}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {p.training_slug || p.training_name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(p.start_date).toLocaleDateString()}
                          </span>
                          {p.location_name && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {p.location_name}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLACEMENT_TYPE_COLORS[p.placement_type] || PLACEMENT_TYPE_COLORS.open}`}
                          >
                            {p.placement_type}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddPlacements(false);
                  setAddPlacementIds([]);
                }}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => addPlacementsMutation.mutate()}
                disabled={addPlacementIds.length === 0 || addPlacementsMutation.isPending}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addPlacementsMutation.isPending ? 'Adding...' : `Add (${addPlacementIds.length})`}
              </button>
            </div>
          </div>
        )}

        {/* Documents */}
        <OfferDocumentsSection
          offerId={selectedOffer.id}
          offerNumber={selectedOffer.offer_number}
          customerName={customerName}
          contactPersons={contactPersons}
        />

        {/* Pricing */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pricing</h5>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Attendees
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={editForm.attendees ?? ''}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev
                      ? { ...prev, attendees: e.target.value ? Number(e.target.value) : null }
                      : prev
                  )
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Training Price
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={editForm.training_price ?? ''}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev
                      ? { ...prev, training_price: e.target.value ? Number(e.target.value) : null }
                      : prev
                  )
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Certification Price
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={editForm.certification_price ?? ''}
                onChange={(e) =>
                  setEditForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          certification_price: e.target.value ? Number(e.target.value) : null,
                        }
                      : prev
                  )
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Currency
              </label>
              <select
                className={inputClass}
                value={editForm.currency}
                onChange={(e) =>
                  setEditForm((prev) => (prev ? { ...prev, currency: e.target.value } : prev))
                }
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          <select
            className={inputClass + ' max-w-xs'}
            value={editForm.status}
            onChange={(e) =>
              setEditForm((prev) =>
                prev ? { ...prev, status: e.target.value as OfferForm['status'] } : prev
              )
            }
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="rejected">Rejected</option>
            <option value="accepted">Accepted</option>
          </select>
        </div>

        {/* Comments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Comments
          </label>
          <RichTextEditor
            value={editForm.comments ?? ''}
            onChange={(html) =>
              setEditForm((prev) => (prev ? { ...prev, comments: html || null } : prev))
            }
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setConfirmDeleteOffer(true)}
            className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-md transition-colors"
          >
            Delete Offer
          </button>
          <button
            type="button"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Remove placement confirm dialog */}
        {removeConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Remove from offer?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Also delete this placement from the program?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRemoveConfirm(null)}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    removePlacementMutation.mutate({
                      placementId: removeConfirm,
                      deleteFromProgram: false,
                    })
                  }
                  disabled={removePlacementMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Remove only
                </button>
                <button
                  type="button"
                  onClick={() =>
                    removePlacementMutation.mutate({
                      placementId: removeConfirm,
                      deleteFromProgram: true,
                    })
                  }
                  disabled={removePlacementMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Remove &amp; delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete offer confirm dialog */}
        {confirmDeleteOffer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Delete Offer?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                This will permanently delete offer &quot;{selectedOffer.offer_number}&quot;. This
                action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOffer(false)}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteOfferMutation.mutate()}
                  disabled={deleteOfferMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteOfferMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- LIST VIEW ----------
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Offers</h4>
          {offers.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {offers.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          + Create Offer
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
      ) : offers.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Offer Number
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Trainings
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Training Price
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Cert. Price
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {offers.map((offer) => (
                <OfferRow key={offer.id} offer={offer} onClick={handleSelectOffer} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No offers yet. Create one to get started.
        </div>
      )}
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
      await api.post('/attachments', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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
