import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../config/api';
import ConfirmDialog from '../components/ConfirmDialog';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import RichTextEditor from '../components/common/RichTextEditor';
import { validatePhone, validateEmail } from '../utils/validators';
import { COUNTRIES_BY_CONTINENT } from '../config/countries';
import VatNumberInput from '../components/common/VatNumberInput';
import { parseApiError } from '../utils/apiError';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useToast } from '../components/Toast';
import type { Tenant, TenantUpdate, ContactPerson } from '../types';

const SystemEmailTemplates = lazy(() => import('./SystemEmailTemplates'));

interface EmailFailure {
  id: string;
  recipient_email: string;
  subject: string;
  email_type: string;
  status: string;
  error_message: string | null;
  acknowledged: boolean;
  created_at: string;
}

interface EmailFailureList {
  items: EmailFailure[];
  total: number;
  total_unacknowledged: number;
  page: number;
  page_size: number;
}

type MyCompanyTab = 'company' | 'email';

export default function MyCompany() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MyCompanyTab>('company');

  // Fetch company data
  const {
    data: tenant,
    isLoading,
    error,
  } = useQuery<Tenant>({
    queryKey: ['my-company'],
    queryFn: async () => {
      const res = await api.get('/my-company');
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load company information</p>
      </div>
    );
  }

  const tabs: { key: MyCompanyTab; label: string }[] = [
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email Settings' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Company</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your company information, email settings, and templates
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'company' && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="p-6">
            <CompanyForm
              tenant={tenant}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['my-company'] })}
            />
          </div>
        </div>
      )}

      {activeTab === 'email' && (
        <EmailSettingsTab
          tenant={tenant}
          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['my-company'] })}
        />
      )}
    </div>
  );
}

interface EmailDefaults {
  resend_from_email: string;
  resend_from_name: string;
  resend_api_key_set: boolean;
  tenant_api_key_set: boolean;
}

function CompanyForm({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoStatus, setLogoStatus] = useState<'idle' | 'uploading' | 'deleting' | 'error'>('idle');
  const [logoError, setLogoError] = useState<string | null>(null);

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/my-company/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onMutate: () => {
      setLogoStatus('uploading');
      setLogoError(null);
    },
    onSuccess: () => {
      setLogoStatus('idle');
      onUpdate();
    },
    onError: (err) => {
      setLogoStatus('error');
      setLogoError(parseApiError(err));
      setTimeout(() => setLogoStatus('idle'), 3000);
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/my-company/logo');
    },
    onMutate: () => {
      setLogoStatus('deleting');
      setLogoError(null);
    },
    onSuccess: () => {
      setLogoStatus('idle');
      onUpdate();
    },
    onError: (err) => {
      setLogoStatus('error');
      setLogoError(parseApiError(err));
      setTimeout(() => setLogoStatus('idle'), 3000);
    },
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadLogoMutation.mutate(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const buildInitialFormData = useCallback(
    (): TenantUpdate => ({
      name: tenant.name,
      address: tenant.address || '',
      postal_code: tenant.postal_code || '',
      city: tenant.city || '',
      country: tenant.country || '',
      phone: tenant.phone || '',
      vat_number: tenant.vat_number || '',
      website: tenant.website || '',
      contact_persons: tenant.contact_persons || [],
      comments: tenant.comments || '',
    }),
    [tenant]
  );

  const [formData, setFormData] = useState<TenantUpdate>(buildInitialFormData);
  const [isDirty, setIsDirty] = useState(false);

  const [newContact, setNewContact] = useState<ContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: '',
  });

  const { showToast } = useToast();
  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges(isDirty);

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUpdate) => {
      await api.put('/my-company', data);
    },
    onSuccess: () => {
      setIsDirty(false);
      onUpdate();
      showToast('Company details saved', 'success');
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  const handleFieldChange = (field: keyof TenantUpdate, value: string | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = useCallback(() => {
    // Validate phone before saving
    if (formData.phone) {
      const phoneError = validatePhone(formData.phone);
      if (phoneError) {
        showToast(phoneError, 'error');
        return;
      }
    }

    // Exclude contact_persons from this save — they're saved explicitly via add/remove/update
    const { contact_persons: _, ...payload } = formData;
    updateMutation.mutate(payload as TenantUpdate);
  }, [formData, updateMutation, showToast]);

  const handleDiscard = useCallback(() => {
    setFormData(buildInitialFormData());
    setIsDirty(false);
  }, [buildInitialFormData]);

  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      const newContacts = [...(formData.contact_persons || []), { ...newContact }];
      setFormData({ ...formData, contact_persons: newContacts });
      setNewContact({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role: '',
      });
      setNewContactPhoneError(null);
      updateMutation.mutate({ ...formData, contact_persons: newContacts });
    }
  };

  const removeContact = (index: number) => {
    const newContacts = formData.contact_persons?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, contact_persons: newContacts });
    updateMutation.mutate({ ...formData, contact_persons: newContacts });
  };

  const updateContact = (index: number, contact: ContactPerson) => {
    const newContacts = formData.contact_persons?.map((c, i) => (i === index ? contact : c)) || [];
    setFormData({ ...formData, contact_persons: newContacts });
    updateMutation.mutate({ ...formData, contact_persons: newContacts });
  };

  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null);
  const [deleteContactIndex, setDeleteContactIndex] = useState<number | null>(null);
  const [editContactPhoneError, setEditContactPhoneError] = useState<string | null>(null);
  const [editContactEmailError, setEditContactEmailError] = useState<string | null>(null);
  const [newContactPhoneError, setNewContactPhoneError] = useState<string | null>(null);
  const [newContactEmailError, setNewContactEmailError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Company Details</h4>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Logo */}
        <div className="border-b dark:border-gray-700 pb-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Company Logo
          </h5>
          <div className="flex items-start gap-4">
            {/* Logo preview */}
            <div className="min-w-24 max-w-48 h-24 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-2">
              {tenant.logo_url ? (
                <img
                  src={`${api.defaults.baseURL}${tenant.logo_url}`}
                  alt="Company logo"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <svg
                  className="h-12 w-12 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              )}
            </div>

            {/* Upload/Delete controls */}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
                  logoStatus === 'uploading'
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-wait'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {logoStatus === 'uploading' ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4 mr-1.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {tenant.logo_url ? 'Replace Logo' : 'Upload Logo'}
                  </>
                )}
              </label>

              {tenant.logo_url && (
                <button
                  type="button"
                  onClick={() => deleteLogoMutation.mutate()}
                  disabled={logoStatus === 'deleting'}
                  className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md ${
                    logoStatus === 'deleting'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-wait'
                      : 'bg-white dark:bg-gray-800 text-red-600 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30'
                  }`}
                >
                  {logoStatus === 'deleting' ? (
                    <>
                      <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4 mr-1.5"
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
                      Delete Logo
                    </>
                  )}
                </button>
              )}

              {logoError && <p className="text-sm text-red-600">{logoError}</p>}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                JPEG, PNG, WebP, or GIF. Max 10MB.
              </p>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Company Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Website
            </label>
            <input
              type="text"
              placeholder="www.example.com"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.website}
              onChange={(e) => handleFieldChange('website', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Phone
            </label>
            <input
              type="text"
              placeholder="+49 123 456789"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.phone || ''}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
            />
          </div>
          <VatNumberInput
            value={formData.vat_number || ''}
            onChange={(val) => handleFieldChange('vat_number', val)}
            country={formData.country || undefined}
          />
        </div>

        {/* Address */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</h5>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Street Address"
              className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.address}
              onChange={(e) => handleFieldChange('address', e.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Postal Code"
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.postal_code}
                onChange={(e) => handleFieldChange('postal_code', e.target.value)}
              />
              <input
                type="text"
                placeholder="City"
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
              />
              <select
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.country}
                onChange={(e) => handleFieldChange('country', e.target.value)}
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
        </div>

        {/* Contact Persons */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Contact Persons
          </h5>

          {formData.contact_persons && formData.contact_persons.length > 0 && (
            <div className="mb-4 space-y-2">
              {formData.contact_persons.map((contact, index) => (
                <div
                  key={index}
                  className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                >
                  {editingContactIndex === index ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                            First Name *
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                            value={contact.first_name}
                            onChange={(e) =>
                              updateContact(index, {
                                ...contact,
                                first_name: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                            value={contact.last_name}
                            onChange={(e) =>
                              updateContact(index, {
                                ...contact,
                                last_name: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Role
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                            value={contact.role || ''}
                            onChange={(e) =>
                              updateContact(index, {
                                ...contact,
                                role: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            className={`w-full border ${editContactEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100`}
                            value={contact.email || ''}
                            onChange={(e) =>
                              updateContact(index, {
                                ...contact,
                                email: e.target.value,
                              })
                            }
                            onBlur={(e) => setEditContactEmailError(validateEmail(e.target.value))}
                          />
                          {editContactEmailError && (
                            <p className="mt-1 text-xs text-red-600">{editContactEmailError}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Phone
                          </label>
                          <input
                            type="tel"
                            placeholder="+491234545 or 00491234566"
                            className={`w-full border ${editContactPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100`}
                            value={contact.phone || ''}
                            onChange={(e) => {
                              updateContact(index, { ...contact, phone: e.target.value });
                              if (editContactPhoneError) setEditContactPhoneError(null);
                            }}
                            onBlur={(e) => setEditContactPhoneError(validatePhone(e.target.value))}
                          />
                          {editContactPhoneError && (
                            <p className="mt-1 text-xs text-red-600">{editContactPhoneError}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContactIndex(null);
                            setEditContactPhoneError(null);
                            setEditContactEmailError(null);
                          }}
                          disabled={!!editContactPhoneError || !!editContactEmailError}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {`${contact.first_name} ${contact.last_name}`.trim()}
                          </span>
                          {contact.role && (
                            <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                              {contact.role}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 space-x-3">
                          {contact.email && <span>{contact.email}</span>}
                          {contact.phone && <span>{contact.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContactIndex(index);
                            setEditContactPhoneError(null);
                            setEditContactEmailError(null);
                          }}
                          className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                          title="Edit"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteContactIndex(index)}
                          className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                          title="Delete"
                        >
                          <svg
                            className="w-4 h-4"
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new contact */}
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h6 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3">
              Add New Contact
            </h6>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  placeholder="First name"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                  value={newContact.first_name}
                  onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  placeholder="Last name"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                  value={newContact.last_name}
                  onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Role
                </label>
                <input
                  type="text"
                  placeholder="e.g., Manager, Technical"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                  value={newContact.role}
                  onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  className={`w-full border ${newContactEmailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100`}
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  onBlur={(e) => setNewContactEmailError(validateEmail(e.target.value))}
                />
                {newContactEmailError && (
                  <p className="mt-1 text-xs text-red-600">{newContactEmailError}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  placeholder="+491234545 or 00491234566"
                  className={`w-full border ${newContactPhoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100`}
                  value={newContact.phone}
                  onChange={(e) => {
                    setNewContact({ ...newContact, phone: e.target.value });
                    if (newContactPhoneError) setNewContactPhoneError(null);
                  }}
                  onBlur={(e) => setNewContactPhoneError(validatePhone(e.target.value))}
                />
                {newContactPhoneError && (
                  <p className="mt-1 text-xs text-red-600">{newContactPhoneError}</p>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={addContact}
                disabled={
                  !newContact.first_name.trim() ||
                  !newContact.last_name.trim() ||
                  !!newContactPhoneError ||
                  !!newContactEmailError
                }
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4 mr-1.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Contact
              </button>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="border-t dark:border-gray-700 pt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Comments / Notes
          </label>
          <RichTextEditor
            value={formData.comments}
            onChange={(html) => handleFieldChange('comments', html)}
            rows={3}
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteContactIndex !== null}
        title="Delete Contact"
        message={`Are you sure you want to delete "${deleteContactIndex !== null ? `${formData.contact_persons?.[deleteContactIndex]?.first_name ?? ''} ${formData.contact_persons?.[deleteContactIndex]?.last_name ?? ''}`.trim() : ''}"?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteContactIndex !== null) removeContact(deleteContactIndex);
          setDeleteContactIndex(null);
        }}
        onCancel={() => setDeleteContactIndex(null)}
      />

      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </div>
  );
}

function EmailSettingsTab({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const { showToast } = useToast();

  const { data: emailDefaults } = useQuery<EmailDefaults>({
    queryKey: ['my-company-email-defaults'],
    queryFn: async () => {
      const res = await api.get('/my-company/email-defaults');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const [resendApiKey, setResendApiKey] = useState(tenant.resend_api_key || '');
  const [resendFromEmail, setResendFromEmail] = useState(tenant.resend_from_email || '');
  const [resendFromName, setResendFromName] = useState(tenant.resend_from_name || '');
  const [isDirty, setIsDirty] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put('/my-company', {
        resend_api_key: resendApiKey,
        resend_from_email: resendFromEmail,
        resend_from_name: resendFromName,
      });
    },
    onSuccess: () => {
      setIsDirty(false);
      onUpdate();
      showToast('Email settings saved', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  return (
    <div className="space-y-6">
      {/* Resend Configuration */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Email Delivery (Resend)
            </h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Configure your Resend API credentials for sending emails. Leave fields empty to use
              platform defaults.
            </p>
          </div>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Warning banner when no API key is configured */}
        {emailDefaults &&
          !emailDefaults.tenant_api_key_set &&
          !emailDefaults.resend_api_key_set && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md">
              <div className="flex">
                <svg
                  className="h-5 w-5 text-amber-400 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Email sending is not configured. Enter your Resend API key below to enable email
                    delivery.
                  </p>
                </div>
              </div>
            </div>
          )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Resend API Key
            </label>
            <input
              type="password"
              placeholder={
                emailDefaults?.resend_api_key_set
                  ? 'Platform default key is configured'
                  : 'No API key configured'
              }
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={resendApiKey}
              onChange={(e) => {
                setResendApiKey(e.target.value);
                setIsDirty(true);
              }}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Your own Resend API key. Leave empty to use the platform default.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              From Email
            </label>
            <input
              type="email"
              placeholder={emailDefaults?.resend_from_email || 'noreply@example.com'}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={resendFromEmail}
              onChange={(e) => {
                setResendFromEmail(e.target.value);
                setIsDirty(true);
              }}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Sender address for outgoing emails.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              From Name
            </label>
            <input
              type="text"
              placeholder={emailDefaults?.resend_from_name || 'My Company'}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={resendFromName}
              onChange={(e) => {
                setResendFromName(e.target.value);
                setIsDirty(true);
              }}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Display name for outgoing emails.
            </p>
          </div>
        </div>
      </div>

      {/* Email Templates */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <Suspense
          fallback={
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            </div>
          }
        >
          <SystemEmailTemplates embedded />
        </Suspense>
      </div>

      {/* Email Delivery Failures */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <EmailFailuresSection />
      </div>
    </div>
  );
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  general: 'General',
  verification: 'Email Verification',
  submission_confirmation: 'Submission Confirmation',
  cospeaker_invitation: 'Co-Speaker Invitation',
  password_reset: 'Password Reset',
  tenant_welcome: 'Tenant Welcome',
  team_invitation: 'Team Invitation',
  deadline_reminder: 'Deadline Reminder',
  direct_message: 'Direct Message',
  message_notification: 'Message Notification',
  registration_invoice: 'Registration Invoice',
  attendee_welcome: 'Attendee Welcome',
  invoice: 'Invoice',
  cancellation: 'Cancellation',
  payment_reminder: 'Payment Reminder',
  admin_notification: 'Admin Notification',
  sponsor_contract: 'Sponsor Contract',
  registration_replacement: 'Registration Replacement',
};

function EmailFailuresSection() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);

  const { data: failures, isLoading } = useQuery<EmailFailureList>({
    queryKey: ['email-failures', page],
    queryFn: async () => {
      const res = await api.get('/my-company/email-failures', {
        params: { page, page_size: 10, acknowledged: false },
      });
      return res.data;
    },
    refetchInterval: 60000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/my-company/email-failures/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-failures'] });
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      await api.post('/my-company/email-failures/acknowledge-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-failures'] });
      showToast('All failures acknowledged', 'success');
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  if (isLoading) return null;
  if (!failures || failures.total_unacknowledged === 0) return null;

  const totalPages = Math.ceil(failures.total / failures.page_size);

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Email Delivery Failures
          </h5>
          <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
            {failures.total_unacknowledged}
          </span>
        </div>
        {failures.total_unacknowledged > 1 && (
          <button
            onClick={() => acknowledgeAllMutation.mutate()}
            disabled={acknowledgeAllMutation.isPending}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Acknowledge All
          </button>
        )}
      </div>

      <div className="space-y-2">
        {failures.items.map((failure) => (
          <div
            key={failure.id}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
                    {failure.status === 'not_configured' ? 'Not Configured' : 'Failed'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {EMAIL_TYPE_LABELS[failure.email_type] || failure.email_type}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(failure.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100 truncate">
                  To: {failure.recipient_email}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                  Subject: {failure.subject}
                </p>
                {failure.error_message && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {failure.error_message}
                  </p>
                )}
              </div>
              <button
                onClick={() => acknowledgeMutation.mutate(failure.id)}
                disabled={acknowledgeMutation.isPending}
                className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                title="Acknowledge"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
