import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { COUNTRY_OPTIONS } from '../../../config/countries';
import { parseApiError } from '../../../utils/apiError';
import type {
  FiscalRepresentative,
  FiscalRepresentativeUpsert,
  ConferenceVatRate,
  ConferenceVatRateCreate,
  TaxInfo,
  LocationContactPerson,
} from '../../../types';

interface FiscalRepSectionProps {
  conferenceId: string;
  conferenceCountry: string | null;
  isAdmin: boolean;
}

const emptyFiscalRep: FiscalRepresentativeUpsert = {
  company_name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
  phone: '',
  email: '',
  website: '',
  vat_number: '',
  conference_vat_number: '',
  contact_persons: [],
  is_active: true,
};

const emptyVatRate: ConferenceVatRateCreate = {
  rate: 0,
  start_date: '',
  end_date: '',
  description: '',
};

function FiscalRepSection({ conferenceId, conferenceCountry, isAdmin }: FiscalRepSectionProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Data queries ---
  const { data: taxInfo, isLoading: taxInfoLoading } = useQuery({
    queryKey: ['tax-info', conferenceId, conferenceCountry],
    queryFn: async () => {
      const res = await api.get<TaxInfo>(`/conferences/${conferenceId}/tax-info`);
      return res.data;
    },
  });

  const { data: fiscalRep } = useQuery({
    queryKey: ['fiscal-representative', conferenceId],
    queryFn: async () => {
      try {
        const res = await api.get<FiscalRepresentative>(
          `/conferences/${conferenceId}/fiscal-representative`
        );
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const { data: vatRatesData } = useQuery({
    queryKey: ['vat-rates', conferenceId],
    queryFn: async () => {
      const res = await api.get<{ items: ConferenceVatRate[]; total: number }>(
        `/conferences/${conferenceId}/vat-rates`
      );
      return res.data;
    },
  });

  const vatRates = vatRatesData?.items || [];

  // --- Fiscal Rep Form State ---
  const [formData, setFormData] = useState<FiscalRepresentativeUpsert | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Initialize form when data loads
  const initForm = useCallback(() => {
    if (fiscalRep) {
      setFormData({
        company_name: fiscalRep.company_name,
        address_line1: fiscalRep.address_line1 || '',
        address_line2: fiscalRep.address_line2 || '',
        city: fiscalRep.city || '',
        state: fiscalRep.state || '',
        postal_code: fiscalRep.postal_code || '',
        country: fiscalRep.country || '',
        phone: fiscalRep.phone || '',
        email: fiscalRep.email || '',
        website: fiscalRep.website || '',
        vat_number: fiscalRep.vat_number || '',
        conference_vat_number: fiscalRep.conference_vat_number || '',
        contact_persons: fiscalRep.contact_persons || [],
        is_active: fiscalRep.is_active,
      });
    } else {
      setFormData({ ...emptyFiscalRep });
    }
    setShowForm(true);
  }, [fiscalRep]);

  // --- Mutations ---
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['tax-info', conferenceId] });
    queryClient.invalidateQueries({ queryKey: ['fiscal-representative', conferenceId] });
    queryClient.invalidateQueries({ queryKey: ['vat-rates', conferenceId] });
  };

  const upsertFiscalRep = useMutation({
    mutationFn: async (data: FiscalRepresentativeUpsert) => {
      await api.put(`/conferences/${conferenceId}/fiscal-representative`, data);
    },
    onMutate: () => {
      setSaving(true);
      setError(null);
    },
    onSuccess: () => {
      setSaving(false);
      invalidateAll();
    },
    onError: (err) => {
      setSaving(false);
      setError(parseApiError(err));
    },
  });

  const deleteFiscalRep = useMutation({
    mutationFn: async () => {
      await api.delete(`/conferences/${conferenceId}/fiscal-representative`);
    },
    onSuccess: () => {
      setShowForm(false);
      setFormData(null);
      invalidateAll();
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleSaveFiscalRep = () => {
    if (!formData || !formData.company_name.trim()) {
      setError('Company name is required');
      return;
    }
    upsertFiscalRep.mutate(formData);
  };

  // --- VAT Rate State ---
  const [vatRateForm, setVatRateForm] = useState<ConferenceVatRateCreate | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);

  const createVatRate = useMutation({
    mutationFn: async (data: ConferenceVatRateCreate) => {
      await api.post(`/conferences/${conferenceId}/vat-rates`, data);
    },
    onSuccess: () => {
      setVatRateForm(null);
      invalidateAll();
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const updateVatRate = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConferenceVatRateCreate> }) => {
      await api.put(`/conferences/${conferenceId}/vat-rates/${id}`, data);
    },
    onSuccess: () => {
      setEditingRateId(null);
      setVatRateForm(null);
      invalidateAll();
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteVatRate = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conferenceId}/vat-rates/${id}`);
    },
    onSuccess: () => invalidateAll(),
    onError: (err) => setError(parseApiError(err)),
  });

  const handleSaveVatRate = () => {
    if (!vatRateForm) return;
    if (!vatRateForm.start_date || !vatRateForm.end_date) {
      setError('Start and end dates are required');
      return;
    }
    if (vatRateForm.end_date < vatRateForm.start_date) {
      setError('End date cannot be before start date');
      return;
    }
    setError(null);

    if (editingRateId) {
      updateVatRate.mutate({ id: editingRateId, data: vatRateForm });
    } else {
      createVatRate.mutate(vatRateForm);
    }
  };

  const startEditRate = (rate: ConferenceVatRate) => {
    setEditingRateId(rate.id);
    setVatRateForm({
      rate: rate.rate,
      start_date: rate.start_date,
      end_date: rate.end_date,
      description: rate.description || '',
    });
  };

  // --- Contact person helpers ---
  const addContactPerson = () => {
    if (!formData) return;
    setFormData({
      ...formData,
      contact_persons: [
        ...(formData.contact_persons || []),
        { first_name: '', last_name: '', email: '', phone: '', comment: '' },
      ],
    });
  };

  const updateContactPerson = (
    index: number,
    field: keyof LocationContactPerson,
    value: string
  ) => {
    if (!formData) return;
    const updated = [...(formData.contact_persons || [])];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, contact_persons: updated });
  };

  const removeContactPerson = (index: number) => {
    if (!formData) return;
    const updated = [...(formData.contact_persons || [])];
    updated.splice(index, 1);
    setFormData({ ...formData, contact_persons: updated });
  };

  // --- Check if current rate ---
  const isCurrentRate = (rate: ConferenceVatRate) => {
    const today = new Date().toISOString().split('T')[0];
    return rate.start_date <= today && today <= rate.end_date;
  };

  if (taxInfoLoading) {
    return (
      <div className="border-t pt-4">
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tax & VAT</h5>
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const isSelfRepresented = taxInfo?.representation_type === 'self';
  const hasFiscalRep = !!fiscalRep;

  return (
    <div className="border-t pt-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tax & VAT</h5>

      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Tax Representation Status */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-gray-600 dark:text-gray-400">Tax Representation:</span>
          {isSelfRepresented ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              Self-represented
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              {hasFiscalRep ? 'Fiscal representative' : 'Fiscal representative needed'}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isSelfRepresented
            ? `Conference is in the same country as the tenant (${taxInfo?.tenant_country || 'N/A'}). The tenant's VAT number is used on invoices.`
            : conferenceCountry
              ? `Conference is in ${conferenceCountry}, which differs from the tenant's country (${taxInfo?.tenant_country || 'N/A'}). A fiscal representative is required for VAT purposes.`
              : 'Set the conference country to determine tax representation.'}
        </p>
        {taxInfo?.effective_vat_number && (
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
            Effective VAT number:{' '}
            <span className="font-mono font-medium">{taxInfo.effective_vat_number}</span>
          </p>
        )}
      </div>

      {/* Fiscal Representative Section */}
      {!isSelfRepresented && (
        <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Fiscal Representative
            </h6>
            {isAdmin && !showForm && (
              <button
                type="button"
                onClick={initForm}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {hasFiscalRep ? 'Edit' : 'Add Fiscal Representative'}
              </button>
            )}
          </div>

          {hasFiscalRep && !showForm && (
            <div className="text-sm space-y-1">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {fiscalRep.company_name}
              </p>
              {fiscalRep.address_line1 && (
                <p className="text-gray-600 dark:text-gray-400">{fiscalRep.address_line1}</p>
              )}
              {fiscalRep.city && (
                <p className="text-gray-600 dark:text-gray-400">
                  {[fiscalRep.postal_code, fiscalRep.city, fiscalRep.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {fiscalRep.vat_number && (
                <p className="text-gray-600 dark:text-gray-400">
                  VAT: <span className="font-mono">{fiscalRep.vat_number}</span>
                </p>
              )}
              {fiscalRep.conference_vat_number && (
                <p className="text-gray-600 dark:text-gray-400">
                  Conference VAT:{' '}
                  <span className="font-mono font-medium">{fiscalRep.conference_vat_number}</span>
                </p>
              )}
              {fiscalRep.contact_persons && fiscalRep.contact_persons.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Contact Persons:
                  </p>
                  {fiscalRep.contact_persons.map((cp, i) => (
                    <p key={i} className="text-gray-600 dark:text-gray-400">
                      {cp.first_name} {cp.last_name}
                      {cp.email && <span className="ml-2 text-gray-500">({cp.email})</span>}
                    </p>
                  ))}
                </div>
              )}
              {!fiscalRep.is_active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 mt-1">
                  Inactive
                </span>
              )}
            </div>
          )}

          {!hasFiscalRep && !showForm && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No fiscal representative defined.
            </p>
          )}

          {showForm && formData && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.address_line1}
                    onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.address_line2}
                    onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    City
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    State / Province
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Country
                  </label>
                  <select
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  >
                    <option value="">Select a country...</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Phone
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Website
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Fiscal Rep VAT Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. NL123456789B01"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm font-mono focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.vat_number}
                    onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Conference VAT Number
                    <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                      (for invoices)
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="VAT number for this conference"
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm font-mono focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={formData.conference_vat_number}
                    onChange={(e) =>
                      setFormData({ ...formData, conference_vat_number: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="fiscal-rep-active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 text-primary-600 rounded border-gray-300"
                />
                <label
                  htmlFor="fiscal-rep-active"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  Active
                </label>
              </div>

              {/* Contact Persons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Contact Persons
                  </label>
                  <button
                    type="button"
                    onClick={addContactPerson}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    + Add Person
                  </button>
                </div>
                {(formData.contact_persons || []).map((cp, index) => (
                  <div key={index} className="flex gap-2 mb-2 items-start">
                    <input
                      type="text"
                      placeholder="First name"
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={cp.first_name}
                      onChange={(e) => updateContactPerson(index, 'first_name', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={cp.last_name || ''}
                      onChange={(e) => updateContactPerson(index, 'last_name', e.target.value)}
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={cp.email || ''}
                      onChange={(e) => updateContactPerson(index, 'email', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Phone"
                      className="w-32 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={cp.phone || ''}
                      onChange={(e) => updateContactPerson(index, 'phone', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeContactPerson(index)}
                      className="text-red-500 hover:text-red-700 p-1.5"
                      title="Remove"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveFiscalRep}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
                >
                  {saving ? 'Saving...' : hasFiscalRep ? 'Update' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData(null);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md"
                >
                  Cancel
                </button>
                {hasFiscalRep && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Remove the fiscal representative?')) {
                        deleteFiscalRep.mutate();
                      }
                    }}
                    className="ml-auto px-3 py-1.5 text-sm font-medium text-red-600 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VAT Rates Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300">VAT Rates</h6>
          {isAdmin && !vatRateForm && (
            <button
              type="button"
              onClick={() => {
                setVatRateForm({ ...emptyVatRate });
                setEditingRateId(null);
              }}
              className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              + Add VAT Rate
            </button>
          )}
        </div>

        {taxInfo?.current_vat_rate !== null && taxInfo?.current_vat_rate !== undefined && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Current rate:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {taxInfo.current_vat_rate}%
            </span>
          </p>
        )}

        {vatRates.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-1.5 pr-3">Rate</th>
                <th className="py-1.5 pr-3">Start Date</th>
                <th className="py-1.5 pr-3">End Date</th>
                <th className="py-1.5 pr-3">Description</th>
                {isAdmin && <th className="py-1.5 w-20">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {vatRates.map((rate) => (
                <tr
                  key={rate.id}
                  className={`border-b border-gray-100 dark:border-gray-800 ${
                    isCurrentRate(rate) ? 'bg-green-50 dark:bg-green-900/10' : ''
                  }`}
                >
                  <td className="py-1.5 pr-3 font-medium">
                    {rate.rate}%
                    {isCurrentRate(rate) && (
                      <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">
                        current
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">
                    {rate.start_date}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{rate.end_date}</td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">
                    {rate.description || '—'}
                  </td>
                  {isAdmin && (
                    <td className="py-1.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEditRate(rate)}
                          className="text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                          title="Edit"
                        >
                          <svg
                            className="h-4 w-4"
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
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Delete this VAT rate?')) {
                              deleteVatRate.mutate(rate.id);
                            }
                          }}
                          className="text-gray-500 hover:text-red-600"
                          title="Delete"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !vatRateForm && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No VAT rates defined.</p>
          )
        )}

        {/* VAT Rate Form (Add/Edit) */}
        {vatRateForm && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md space-y-3">
            <h6 className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {editingRateId ? 'Edit VAT Rate' : 'New VAT Rate'}
            </h6>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400">Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={vatRateForm.rate}
                  onChange={(e) =>
                    setVatRateForm({ ...vatRateForm, rate: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400">Start Date</label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={vatRateForm.start_date}
                  onChange={(e) => setVatRateForm({ ...vatRateForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400">End Date</label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={vatRateForm.end_date}
                  min={vatRateForm.start_date}
                  onChange={(e) => setVatRateForm({ ...vatRateForm, end_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Standard rate 2026"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={vatRateForm.description}
                  onChange={(e) => setVatRateForm({ ...vatRateForm, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveVatRate}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
              >
                {editingRateId ? 'Update' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setVatRateForm(null);
                  setEditingRateId(null);
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FiscalRepSection;
