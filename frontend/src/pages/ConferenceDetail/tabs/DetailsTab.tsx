import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../config/api';
import { COUNTRY_OPTIONS } from '../../../config/countries';
import {
  TIMEZONE_OPTIONS,
  resolveTimezoneValue,
  COUNTRY_DEFAULT_TIMEZONE,
} from '../../../config/timezones';
import { useSaveStatus } from '../../../hooks/useSaveStatus';
import type {
  Conference,
  ConferenceUpdate,
  PlatformCurrency,
  PaginatedResponse,
} from '../../../types';
import RichTextEditor from '../../../components/common/RichTextEditor';
import ConferenceLogo from '../../../components/ConferenceLogo';
import { parseApiError } from '../../../utils/apiError';
import { validateEmail, normalizeUrl } from '../../../utils/validators';
import FiscalRepSection from './FiscalRepSection';

function PortalUrlField({ tenantSlug, path }: { tenantSlug: string; path: string }) {
  const [copied, setCopied] = useState(false);

  // Build the full portal URL
  const baseUrl = window.location.origin;
  const portalUrl = `${baseUrl}/${tenantSlug}/portal/${path}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = portalUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={portalUrl}
        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 sm:text-sm cursor-text"
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      <button
        type="button"
        onClick={handleCopy}
        className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          copied
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-primary-600 text-white hover:bg-primary-700'
        }`}
      >
        {copied ? (
          <>
            <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        title="Open in new tab"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    </div>
  );
}

function ConferenceDetailsTab({
  conference,
  onUpdate,
  isAdmin,
}: {
  conference: Conference;
  onUpdate: () => void;
  isAdmin: boolean;
}) {
  const [formData, setFormData] = useState<ConferenceUpdate>({
    name: conference.name,
    abbreviation: conference.abbreviation || '',
    description: conference.description || '',
    website: conference.website || '',
    support_email: conference.support_email || '',
    contact_email: conference.contact_email || '',
    start_date: conference.start_date || '',
    end_date: conference.end_date || '',
    venue_name: conference.venue_name || '',
    venue_address: conference.venue_address || '',
    city: conference.city || '',
    state: conference.state || '',
    postal_code: conference.postal_code || '',
    country: conference.country || '',
    timezone: resolveTimezoneValue(conference.timezone || ''),
    venue_type: conference.venue_type,
    venue_url: conference.venue_url || '',
    virtual_platform_url: conference.virtual_platform_url || '',
    currency: conference.currency || '',
    invoice_currency: conference.invoice_currency || '',
  });

  // Fetch platform currencies for currency selector
  const { data: currencyOptions } = useQuery({
    queryKey: ['platform-currencies'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
  });

  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const [emailErrors, setEmailErrors] = useState<Record<string, string | null>>({});
  const [debounceTimeout, setDebounceTimeout] = useState<ReturnType<typeof setTimeout> | null>(
    null
  );

  const updateMutation = useMutation({
    mutationFn: async (data: ConferenceUpdate) => {
      // Convert empty strings to null for currency fields so they get saved as null
      const payload = {
        ...data,
        currency: data.currency || null,
        invoice_currency: data.invoice_currency || null,
        venue_url: data.venue_url || null,
      };
      await api.put(`/conferences/${conference.id}`, payload);
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      onUpdate();
    },
    onError: () => {
      setSaveError();
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
      const res = await api.post(`/conferences/${conference.id}/logo`, formData, {
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
      await api.delete(`/conferences/${conference.id}/logo`);
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
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFieldChange = (
    field: keyof ConferenceUpdate,
    value: string | boolean | number | undefined
  ) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    // Clear email error on change if the user is fixing it
    if ((field === 'support_email' || field === 'contact_email') && emailErrors[field]) {
      const error = validateEmail(value as string);
      setEmailErrors((prev) => ({ ...prev, [field]: error }));
      if (error) return; // Don't auto-save while email is still invalid
    }

    // Don't auto-save if any email field has a validation error
    const hasEmailError = Object.values(emailErrors).some(Boolean);
    if (hasEmailError) return;

    if (debounceTimeout) clearTimeout(debounceTimeout);

    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setDebounceTimeout(timeout);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Conference Details</h4>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md">
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
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md">
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
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md">
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
        )}
      </div>

      <div className="space-y-4">
        {/* Logo */}
        <div className="border-b pb-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Conference Logo
          </h5>
          <div className="flex items-start gap-4">
            {/* Logo preview - flexible container for various aspect ratios */}
            <div className="min-w-24 max-w-48 h-24 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-2">
              <ConferenceLogo logoUrl={conference.logo_url} />
            </div>

            {/* Upload/Delete controls */}
            {isAdmin && (
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
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-wait'
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
                      {conference.logo_url ? 'Replace Logo' : 'Upload Logo'}
                    </>
                  )}
                </label>

                {conference.logo_url && (
                  <button
                    type="button"
                    onClick={() => deleteLogoMutation.mutate()}
                    disabled={logoStatus === 'deleting'}
                    className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md ${
                      logoStatus === 'deleting'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-wait'
                        : 'bg-white dark:bg-gray-800 text-red-600 border border-red-300 hover:bg-red-50 dark:hover:bg-red-900/30'
                    }`}
                  >
                    {logoStatus === 'deleting' ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4 mr-1.5"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
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
            )}
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Conference Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Abbreviation
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.abbreviation}
              onChange={(e) => handleFieldChange('abbreviation', e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Start Date
            </label>
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.start_date}
              onChange={(e) => {
                const newStart = e.target.value;
                const adjustEnd = formData.end_date && newStart && formData.end_date < newStart;
                const newFormData = {
                  ...formData,
                  start_date: newStart,
                  ...(adjustEnd ? { end_date: newStart } : {}),
                };
                setFormData(newFormData);
                if (debounceTimeout) clearTimeout(debounceTimeout);
                const timeout = setTimeout(() => {
                  updateMutation.mutate(newFormData);
                }, 500);
                setDebounceTimeout(timeout);
              }}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              End Date
            </label>
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.end_date}
              min={formData.start_date}
              onChange={(e) => handleFieldChange('end_date', e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <RichTextEditor
            value={formData.description || ''}
            onChange={(html) => handleFieldChange('description', html)}
            rows={3}
            disabled={!isAdmin}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Website
          </label>
          <input
            type="text"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.website}
            onChange={(e) => handleFieldChange('website', e.target.value)}
            disabled={!isAdmin}
          />
        </div>

        {/* Financial Settings */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Financial Settings
          </h5>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Primary Currency
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.currency}
                  onChange={(e) => handleFieldChange('currency', e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">Select currency...</option>
                  {(currencyOptions || []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Used for all pricing in this conference.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Second Currency
                  <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(optional)</span>
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.invoice_currency}
                  onChange={(e) => handleFieldChange('invoice_currency', e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">Same as primary</option>
                  {(currencyOptions || []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Alternative currency for invoices.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tax & VAT */}
        <FiscalRepSection
          conferenceId={conference.id}
          conferenceCountry={conference.country}
          isAdmin={isAdmin}
        />

        {/* Portal URLs */}
        {conference.tenant_slug && (
          <div className="border-t pt-4">
            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Portal URLs
            </h5>
            <div className="space-y-4">
              {/* General Portal Login */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  General Portal Login
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Share this URL for users to login/register to the portal.
                </p>
                <PortalUrlField tenantSlug={conference.tenant_slug} path="user/login" />
              </div>

              {/* Conference-specific Landing Page */}
              {conference.abbreviation && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Conference Landing Page
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Share this URL for applicants to access the CFP portal for this conference
                    directly.
                  </p>
                  <PortalUrlField
                    tenantSlug={conference.tenant_slug}
                    path={conference.abbreviation}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contact Emails */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Contact Emails
          </h5>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            These emails are used in email templates sent to applicants and attendees.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Support Email
              </label>
              <input
                type="email"
                placeholder="support@example.com"
                className={`mt-1 block w-full border ${emailErrors.support_email ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                value={formData.support_email}
                onChange={(e) => handleFieldChange('support_email', e.target.value)}
                onBlur={(e) =>
                  setEmailErrors((prev) => ({
                    ...prev,
                    support_email: validateEmail(e.target.value),
                  }))
                }
                disabled={!isAdmin}
              />
              {emailErrors.support_email && (
                <p className="mt-1 text-xs text-red-600">{emailErrors.support_email}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contact Email
              </label>
              <input
                type="email"
                placeholder="contact@example.com"
                className={`mt-1 block w-full border ${emailErrors.contact_email ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                value={formData.contact_email}
                onChange={(e) => handleFieldChange('contact_email', e.target.value)}
                onBlur={(e) =>
                  setEmailErrors((prev) => ({
                    ...prev,
                    contact_email: validateEmail(e.target.value),
                  }))
                }
                disabled={!isAdmin}
              />
              {emailErrors.contact_email && (
                <p className="mt-1 text-xs text-red-600">{emailErrors.contact_email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Location</h5>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Venue Name
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.venue_name}
                onChange={(e) => handleFieldChange('venue_name', e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Address
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.venue_address}
                onChange={(e) => handleFieldChange('venue_address', e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Postal Code
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.postal_code}
                  onChange={(e) => handleFieldChange('postal_code', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  City
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.city}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  State / Province
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.state}
                  onChange={(e) => handleFieldChange('state', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Country
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.country}
                  onChange={(e) => {
                    const country = e.target.value;
                    const newFormData = { ...formData, country };
                    // Auto-suggest timezone when country changes and timezone is empty
                    if (country && !formData.timezone) {
                      const defaultTz = COUNTRY_DEFAULT_TIMEZONE[country];
                      if (defaultTz) {
                        newFormData.timezone = defaultTz;
                      }
                    }
                    setFormData(newFormData);
                    if (debounceTimeout) clearTimeout(debounceTimeout);
                    const timeout = setTimeout(() => {
                      updateMutation.mutate(newFormData);
                    }, 500);
                    setDebounceTimeout(timeout);
                  }}
                  disabled={!isAdmin}
                >
                  <option value="">Select a country...</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Timezone
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.timezone}
                  onChange={(e) => handleFieldChange('timezone', e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">Select a timezone...</option>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Event Type
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.venue_type}
                  onChange={(e) => handleFieldChange('venue_type', e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="onsite">Onsite</option>
                  <option value="virtual">Virtual</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Venue URL
                  <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.venue_url}
                  onChange={(e) => handleFieldChange('venue_url', e.target.value)}
                  onBlur={(e) => handleFieldChange('venue_url', normalizeUrl(e.target.value))}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            {(formData.venue_type === 'virtual' || formData.venue_type === 'hybrid') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Streaming Platform URL
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.virtual_platform_url}
                  onChange={(e) => handleFieldChange('virtual_platform_url', e.target.value)}
                  onBlur={(e) =>
                    handleFieldChange('virtual_platform_url', normalizeUrl(e.target.value))
                  }
                  disabled={!isAdmin}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConferenceDetailsTab;
