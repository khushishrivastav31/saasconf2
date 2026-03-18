import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import UnsavedChangesDialog from '../../../../components/UnsavedChangesDialog';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import { validatePhone, validateEmail } from '../../../../utils/validators';
import { COUNTRIES_BY_CONTINENT } from '../../../../config/countries';
import { parseApiError } from '../../../../utils/apiError';
import { useUnsavedChanges } from '../../../../hooks/useUnsavedChanges';
import { useToast } from '../../../../components/Toast';
import type { Tenant, TenantUpdate, ContactPerson } from '../../../../types';

export default function CompanyInfoTab({
  tenant,
  onUpdate,
  onClose,
}: {
  tenant: Tenant;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const toggleActiveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/admin/tenants/${tenant.id}`, {
        is_active: !tenant.is_active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/admin/tenants/${tenant.id}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
  });

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoStatus, setLogoStatus] = useState<'idle' | 'uploading' | 'deleting' | 'error'>('idle');
  const [logoError, setLogoError] = useState<string | null>(null);

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/admin/tenants/${tenant.id}/logo`, formData, {
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
      await api.delete(`/admin/tenants/${tenant.id}/logo`);
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
      vat_number: tenant.vat_number || '',
      website: tenant.website || '',
      email_domain: tenant.email_domain || '',
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

  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges(isDirty);

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUpdate) => {
      await api.put(`/admin/tenants/${tenant.id}`, data);
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
    // Exclude contact_persons — they're saved explicitly via add/remove/update
    const { contact_persons: _, ...payload } = formData;
    updateMutation.mutate(payload as TenantUpdate);
  }, [formData, updateMutation]);

  const handleDiscard = useCallback(() => {
    setFormData(buildInitialFormData());
    setIsDirty(false);
  }, [buildInitialFormData]);

  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      const newContacts = [...(formData.contact_persons || []), { ...newContact }];
      setFormData({ ...formData, contact_persons: newContacts });
      setNewContact({ first_name: '', last_name: '', email: '', phone: '', role: '' });
      setNewContactPhoneError(null);
      // Save immediately when adding contact
      updateMutation.mutate({ ...formData, contact_persons: newContacts });
    }
  };

  const removeContact = (index: number) => {
    const newContacts = formData.contact_persons?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, contact_persons: newContacts });
    // Save immediately when removing contact
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
  const [portalUrlCopied, setPortalUrlCopied] = useState(false);

  const portalUrl = `${window.location.origin}/${tenant.slug}/portal/user/login`;

  const copyPortalUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setPortalUrlCopied(true);
      setTimeout(() => setPortalUrlCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = portalUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setPortalUrlCopied(true);
      setTimeout(() => setPortalUrlCopied(false), 2000);
    }
  };

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
              VAT Number
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.vat_number}
              onChange={(e) => handleFieldChange('vat_number', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Domain
            </label>
            <input
              type="text"
              placeholder="example.com"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.email_domain}
              onChange={(e) => handleFieldChange('email_domain', e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              When set, outgoing emails will be sent from noreply@[domain].
            </p>
          </div>
        </div>

        {/* Portal URL */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Portal URL</h5>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={portalUrl}
              className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm text-gray-600 dark:text-gray-300 cursor-default"
            />
            <button
              type="button"
              onClick={copyPortalUrl}
              className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                portalUrlCopied
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              title="Copy URL"
            >
              {portalUrlCopied ? (
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              title="Open in new tab"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Open
            </a>
          </div>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Share this URL with applicants to access the speaker portal for this company.
          </p>
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

        {/* Deactivate / Activate */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Company Status
          </h5>
          <div
            className={`rounded-lg p-4 ${tenant.is_active ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={`text-sm font-medium ${tenant.is_active ? 'text-red-900 dark:text-red-300' : 'text-green-900 dark:text-green-300'}`}
                >
                  {tenant.is_active ? 'Deactivate Company' : 'Activate Company'}
                </p>
                <p
                  className={`text-sm mt-1 ${tenant.is_active ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
                >
                  {tenant.is_active
                    ? 'Deactivating will prevent all users of this company from logging in.'
                    : 'Activating will allow users of this company to log in again.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeactivateConfirm(true)}
                disabled={toggleActiveMutation.isPending}
                className={`ml-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                  tenant.is_active
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {toggleActiveMutation.isPending
                  ? 'Saving...'
                  : tenant.is_active
                    ? 'Deactivate'
                    : 'Activate'}
              </button>
            </div>
          </div>
        </div>

        {/* Delete Company (Permanent) */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Danger Zone</h5>
          <div className="rounded-lg p-4 bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-900 dark:text-red-300">
                  Delete Company Permanently
                </p>
                <p className="text-sm mt-1 text-red-700 dark:text-red-400">
                  This will permanently delete the company and all associated data including
                  conferences, CFPs, papers, users, and attachments. This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteMutation.isPending}
                className="ml-4 inline-flex items-center px-4 py-2 border-2 border-red-600 text-sm font-medium rounded-md text-red-600 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Company'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDeactivateConfirm}
        title={tenant.is_active ? 'Deactivate Company' : 'Activate Company'}
        message={
          tenant.is_active
            ? `Are you sure you want to deactivate "${tenant.name}"? All users of this company will be unable to log in.`
            : `Are you sure you want to activate "${tenant.name}"? Users of this company will be able to log in again.`
        }
        confirmLabel={tenant.is_active ? 'Deactivate' : 'Activate'}
        onConfirm={() => {
          toggleActiveMutation.mutate();
          setShowDeactivateConfirm(false);
        }}
        onCancel={() => setShowDeactivateConfirm(false)}
      />

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

      {/* Custom Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmText('');
              }}
            />
            <div className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white dark:bg-gray-800 px-4 pb-4 pt-5 sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg
                      className="h-6 w-6 text-red-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left flex-1">
                    <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-gray-100">
                      Delete Company Permanently
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        This action <strong>cannot be undone</strong>. This will permanently delete
                        the company <strong>&quot;{tenant.name}&quot;</strong> and all associated
                        data including:
                      </p>
                      <ul className="mt-2 text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1">
                        <li>All users and their accounts</li>
                        <li>All conferences and their settings</li>
                        <li>All CFPs, papers, and submissions</li>
                        <li>All applicants and reviewers</li>
                        <li>All attachments and uploaded files</li>
                      </ul>
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Type <strong>{tenant.name}</strong> to confirm:
                        </label>
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                          placeholder="Enter company name"
                          autoFocus
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  disabled={deleteConfirmText !== tenant.name || deleteMutation.isPending}
                  onClick={() => {
                    deleteMutation.mutate();
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete permanently'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </div>
  );
}
