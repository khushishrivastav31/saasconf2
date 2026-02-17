import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../config/api';
import ConfirmDialog from '../components/ConfirmDialog';
import RichTextEditor from '../components/common/RichTextEditor';
import { validatePhone } from '../utils/validators';
import { parseApiError } from '../utils/apiError';
import { useSaveStatus } from '../hooks/useSaveStatus';
import type { Tenant, TenantUpdate, ContactPerson } from '../types';

export default function MyCompany() {
  const queryClient = useQueryClient();

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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Company</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your company information and contact details
        </p>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="p-6">
          <CompanyForm
            tenant={tenant}
            onUpdate={() => queryClient.invalidateQueries({ queryKey: ['my-company'] })}
          />
        </div>
      </div>
    </div>
  );
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

  const [formData, setFormData] = useState<TenantUpdate>({
    name: tenant.name,
    address: tenant.address || '',
    postal_code: tenant.postal_code || '',
    city: tenant.city || '',
    country: tenant.country || '',
    vat_number: tenant.vat_number || '',
    website: tenant.website || '',
    contact_persons: tenant.contact_persons || [],
    comments: tenant.comments || '',
  });

  const [newContact, setNewContact] = useState<ContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: '',
  });

  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUpdate) => {
      await api.put('/my-company', data);
    },
    onMutate: () => {
      setSaving();
    },
    onSuccess: () => {
      setSaved();
      onUpdate();
    },
    onError: () => {
      setError();
    },
  });

  // Auto-save when form data changes (with debounce)
  const [debounceTimeout, setDebounceTimeout] = useState<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleFieldChange = (field: keyof TenantUpdate, value: string | undefined) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setDebounceTimeout(timeout);
  };

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
  const [newContactPhoneError, setNewContactPhoneError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">Company Details</h4>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-md">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Save failed
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Logo */}
        <div className="border-b pb-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Company Logo</h5>
          <div className="flex items-start gap-4">
            {/* Logo preview */}
            <div className="min-w-24 max-w-48 h-24 border border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center p-2">
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
                    ? 'bg-gray-100 text-gray-400 cursor-wait'
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
                      ? 'bg-gray-100 text-gray-400 cursor-wait'
                      : 'bg-white text-red-600 border border-red-300 hover:bg-red-50'
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

              <p className="text-xs text-gray-500">JPEG, PNG, WebP, or GIF. Max 10MB.</p>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Name</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Website</label>
            <input
              type="text"
              placeholder="www.example.com"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.website}
              onChange={(e) => handleFieldChange('website', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">VAT Number</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.vat_number}
              onChange={(e) => handleFieldChange('vat_number', e.target.value)}
            />
          </div>
        </div>

        {/* Address */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-2">Address</h5>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Street Address"
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.address}
              onChange={(e) => handleFieldChange('address', e.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Postal Code"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.postal_code}
                onChange={(e) => handleFieldChange('postal_code', e.target.value)}
              />
              <input
                type="text"
                placeholder="City"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
              />
              <input
                type="text"
                placeholder="Country"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.country}
                onChange={(e) => handleFieldChange('country', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Contact Persons */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-2">Contact Persons</h5>

          {formData.contact_persons && formData.contact_persons.length > 0 && (
            <div className="mb-4 space-y-2">
              {formData.contact_persons.map((contact, index) => (
                <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  {editingContactIndex === index ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            First Name *
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Role
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                            value={contact.email || ''}
                            onChange={(e) =>
                              updateContact(index, {
                                ...contact,
                                email: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Phone
                          </label>
                          <input
                            type="tel"
                            placeholder="+491234545 or 00491234566"
                            className={`w-full border ${editContactPhoneError ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                            value={contact.phone || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              updateContact(index, { ...contact, phone: value });
                              setEditContactPhoneError(validatePhone(value));
                            }}
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
                          }}
                          disabled={!!editContactPhoneError}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {`${contact.first_name} ${contact.last_name}`.trim()}
                          </span>
                          {contact.role && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                              {contact.role}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-500 space-x-3">
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h6 className="text-sm font-medium text-blue-900 mb-3">Add New Contact</h6>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                <input
                  type="text"
                  placeholder="First name"
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={newContact.first_name}
                  onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                <input
                  type="text"
                  placeholder="Last name"
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={newContact.last_name}
                  onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <input
                  type="text"
                  placeholder="e.g., Manager, Technical"
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={newContact.role}
                  onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input
                  type="tel"
                  placeholder="+491234545 or 00491234566"
                  className={`w-full border ${newContactPhoneError ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                  value={newContact.phone}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewContact({ ...newContact, phone: value });
                    setNewContactPhoneError(validatePhone(value));
                  }}
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
                  !!newContactPhoneError
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
        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Comments / Notes</label>
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
    </div>
  );
}
