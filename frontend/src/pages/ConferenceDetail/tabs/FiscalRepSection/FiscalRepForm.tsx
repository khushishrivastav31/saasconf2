import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../../../config/api';
import { COUNTRIES_BY_CONTINENT } from '../../../../config/countries';
import { parseApiError } from '../../../../utils/apiError';
import { validateEmail, validatePhone, validateWebsite } from '../../../../utils/validators';
import VatNumberInput from '../../../../components/common/VatNumberInput';
import type {
  FiscalRepresentative,
  FiscalRepresentativeUpsert,
  LocationContactPerson,
} from '../../../../types';

interface FieldErrors {
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  conference_vat_number?: string | null;
  [key: string]: string | null | undefined;
}

interface FiscalRepFormProps {
  conferenceId: string;
  fiscalRep: FiscalRepresentative | null | undefined;
  isAdmin: boolean;
  setError: (error: string | null) => void;
  invalidateAll: () => void;
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

function FiscalRepForm({
  conferenceId,
  fiscalRep,
  isAdmin,
  setError,
  invalidateAll,
}: FiscalRepFormProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FiscalRepresentativeUpsert | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [contactErrors, setContactErrors] = useState<
    Record<number, { email?: string | null; phone?: string | null }>
  >({});

  const hasFiscalRep = !!fiscalRep;

  const validateField = useCallback(
    (field: string, value: string | null | undefined): string | null => {
      switch (field) {
        case 'email':
          return validateEmail(value);
        case 'website':
          return validateWebsite(value);
        case 'phone':
          return validatePhone(value);
        default:
          return null;
      }
    },
    []
  );

  const handleFieldBlur = useCallback(
    (field: string, value: string | null | undefined) => {
      const err = validateField(field, value);
      setFieldErrors((prev) => ({ ...prev, [field]: err }));
    },
    [validateField]
  );

  const validateAllFields = useCallback((): boolean => {
    if (!formData) return false;
    const errors: FieldErrors = {
      email: validateField('email', formData.email),
      website: validateField('website', formData.website),
      phone: validateField('phone', formData.phone),
      vat_number: validateField('vat_number', formData.vat_number),
      conference_vat_number: validateField('conference_vat_number', formData.conference_vat_number),
    };
    setFieldErrors(errors);
    return !Object.values(errors).some(Boolean);
  }, [formData, validateField]);

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
    setFieldErrors({});
  }, [fiscalRep]);

  // --- Mutations ---
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
    if (!validateAllFields()) {
      setError('Please fix the validation errors below before saving.');
      return;
    }
    upsertFiscalRep.mutate(formData);
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

  return (
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
          <p className="font-medium text-gray-900 dark:text-gray-100">{fiscalRep.company_name}</p>
          {fiscalRep.address_line1 && (
            <p className="text-gray-600 dark:text-gray-300">{fiscalRep.address_line1}</p>
          )}
          {fiscalRep.city && (
            <p className="text-gray-600 dark:text-gray-300">
              {[fiscalRep.postal_code, fiscalRep.city, fiscalRep.country]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          {fiscalRep.vat_number && (
            <p className="text-gray-600 dark:text-gray-300">
              VAT: <span className="font-mono">{fiscalRep.vat_number}</span>
            </p>
          )}
          {fiscalRep.conference_vat_number && (
            <p className="text-gray-600 dark:text-gray-300">
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
                <p key={i} className="text-gray-600 dark:text-gray-300">
                  {cp.first_name} {cp.last_name}
                  {cp.email && <span className="ml-2 text-gray-500">({cp.email})</span>}
                </p>
              ))}
            </div>
          )}
          {!fiscalRep.is_active && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 mt-1">
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
                {COUNTRIES_BY_CONTINENT.map((group) => (
                  <optgroup key={group.continent} label={group.continent}>
                    {group.countries.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
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
                placeholder="+49123456789"
                className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                  fieldErrors.phone
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: null }));
                }}
                onBlur={(e) => handleFieldBlur('phone', e.target.value)}
              />
              {fieldErrors.phone && (
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.phone}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                placeholder="email@example.com"
                className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                  fieldErrors.email
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
                }}
                onBlur={(e) => handleFieldBlur('email', e.target.value)}
              />
              {fieldErrors.email && (
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Website
              </label>
              <input
                type="text"
                placeholder="example.com"
                className={`mt-1 block w-full border rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                  fieldErrors.website
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                value={formData.website}
                onChange={(e) => {
                  setFormData({ ...formData, website: e.target.value });
                  if (fieldErrors.website) setFieldErrors((prev) => ({ ...prev, website: null }));
                }}
                onBlur={(e) => handleFieldBlur('website', e.target.value)}
              />
              {fieldErrors.website && (
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.website}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VatNumberInput
              id="fiscal_rep_vat_number"
              label="Fiscal Rep VAT Number"
              placeholder="e.g. NL123456789B01"
              value={formData.vat_number || ''}
              onChange={(val) => setFormData({ ...formData, vat_number: val })}
            />
            <VatNumberInput
              id="conference_vat_number"
              label="Conference VAT Number"
              placeholder="e.g. DE123456789"
              value={formData.conference_vat_number || ''}
              onChange={(val) => setFormData({ ...formData, conference_vat_number: val })}
            />
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
            <label htmlFor="fiscal-rep-active" className="text-sm text-gray-700 dark:text-gray-300">
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
              <div key={index} className="mb-2">
                <div className="flex gap-2 items-start">
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
                  <div className="flex-1">
                    <input
                      type="email"
                      placeholder="Email"
                      className={`w-full border ${contactErrors[index]?.email ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500`}
                      value={cp.email || ''}
                      onChange={(e) => {
                        updateContactPerson(index, 'email', e.target.value);
                        if (contactErrors[index]?.email)
                          setContactErrors((prev) => ({
                            ...prev,
                            [index]: { ...prev[index], email: null },
                          }));
                      }}
                      onBlur={(e) => {
                        const err = validateEmail(e.target.value);
                        setContactErrors((prev) => ({
                          ...prev,
                          [index]: { ...prev[index], email: err },
                        }));
                      }}
                    />
                    {contactErrors[index]?.email && (
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {contactErrors[index].email}
                      </p>
                    )}
                  </div>
                  <div className="w-32">
                    <input
                      type="text"
                      placeholder="Phone"
                      className={`w-full border ${contactErrors[index]?.phone ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-1.5 px-2.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500`}
                      value={cp.phone || ''}
                      onChange={(e) => {
                        updateContactPerson(index, 'phone', e.target.value);
                        if (contactErrors[index]?.phone)
                          setContactErrors((prev) => ({
                            ...prev,
                            [index]: { ...prev[index], phone: null },
                          }));
                      }}
                      onBlur={(e) => {
                        const err = validatePhone(e.target.value);
                        setContactErrors((prev) => ({
                          ...prev,
                          [index]: { ...prev[index], phone: err },
                        }));
                      }}
                    />
                    {contactErrors[index]?.phone && (
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {contactErrors[index].phone}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeContactPerson(index)}
                    className="text-red-500 hover:text-red-700 p-1.5"
                    title="Remove"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
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
  );
}

export default FiscalRepForm;
