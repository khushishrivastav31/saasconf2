import { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../../config/api';
import { COUNTRIES_BY_CONTINENT } from '../../../config/countries';
import {
  TIMEZONE_OPTIONS,
  resolveTimezoneValue,
  COUNTRY_DEFAULT_TIMEZONE,
} from '../../../config/timezones';
import type { Conference, ConferenceUpdate } from '../../../types';
import RichTextEditor from '../../../components/common/RichTextEditor';
import ConferenceLogo from '../../../components/ConferenceLogo';
import { parseApiError } from '../../../utils/apiError';
import { validateEmail, validatePhone, normalizeUrl } from '../../../utils/validators';
import { useToast } from '../../../components/Toast';
import { DirtyContext } from '../DirtyContext';

function buildFormData(conference: Conference): ConferenceUpdate {
  return {
    name: conference.name,
    abbreviation: conference.abbreviation || '',
    description: conference.description || '',
    website: conference.website || '',
    support_email: conference.support_email || '',
    contact_email: conference.contact_email || '',
    phone: conference.phone || '',
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
  };
}

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
  const reportDirty = useContext(DirtyContext);
  const [formData, setFormData] = useState<ConferenceUpdate>(buildFormData(conference));
  const [isDirty, setIsDirty] = useState(false);

  const { showToast } = useToast();
  const [emailErrors, setEmailErrors] = useState<Record<string, string | null>>({});

  // Sync from server when conference changes (only when not dirty)
  useEffect(() => {
    if (!isDirty) {
      setFormData(buildFormData(conference));
    }
  }, [conference, isDirty]);

  // Report dirty state to parent for tab-switch guarding
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  const updateMutation = useMutation({
    mutationFn: async (data: ConferenceUpdate) => {
      const payload = {
        ...data,
        venue_url: data.venue_url || null,
      };
      await api.put(`/conferences/${conference.id}`, payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      onUpdate();
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoStatus, setLogoStatus] = useState<'idle' | 'uploading' | 'deleting' | 'error'>('idle');
  const [logoError, setLogoError] = useState<string | null>(null);

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/conferences/${conference.id}/logo`, fd, {
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFieldChange = useCallback(
    (field: keyof ConferenceUpdate, value: string | boolean | number | undefined) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);

      // Clear validation error on change if the user is fixing it
      if ((field === 'support_email' || field === 'contact_email') && emailErrors[field]) {
        setEmailErrors((prev) => ({ ...prev, [field]: validateEmail(value as string) }));
      }
      if (field === 'phone' && emailErrors.phone) {
        setEmailErrors((prev) => ({ ...prev, phone: null }));
      }
    },
    [emailErrors]
  );

  const handleCountryChange = useCallback((country: string) => {
    setFormData((prev) => {
      const updated = { ...prev, country };
      // Auto-suggest timezone when country changes and timezone is empty
      if (country && !prev.timezone) {
        const defaultTz = COUNTRY_DEFAULT_TIMEZONE[country];
        if (defaultTz) {
          updated.timezone = defaultTz;
        }
      }
      return updated;
    });
    setIsDirty(true);
  }, []);

  const handleStartDateChange = useCallback((newStart: string) => {
    setFormData((prev) => {
      const adjustEnd = prev.end_date && newStart && prev.end_date < newStart;
      return {
        ...prev,
        start_date: newStart,
        ...(adjustEnd ? { end_date: newStart } : {}),
      };
    });
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    // Validate emails before saving
    const supportError = formData.support_email
      ? validateEmail(formData.support_email as string)
      : null;
    const contactError = formData.contact_email
      ? validateEmail(formData.contact_email as string)
      : null;
    const phoneError = formData.phone ? validatePhone(formData.phone as string) : null;

    if (supportError || contactError || phoneError) {
      setEmailErrors({
        support_email: supportError,
        contact_email: contactError,
        phone: phoneError,
      });
      showToast('Please fix validation errors before saving', 'error');
      return;
    }

    // Normalize URLs before saving
    const normalized = {
      ...formData,
      venue_url: formData.venue_url ? normalizeUrl(formData.venue_url as string) : '',
      virtual_platform_url: formData.virtual_platform_url
        ? normalizeUrl(formData.virtual_platform_url as string)
        : '',
    };
    setFormData(normalized);
    updateMutation.mutate(normalized);
  }, [formData, updateMutation, showToast]);

  const handleDiscard = useCallback(() => {
    setFormData(buildFormData(conference));
    setIsDirty(false);
    setEmailErrors({});
  }, [conference]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Conference Details</h4>
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
            disabled={!isDirty || updateMutation.isPending || !isAdmin}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
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
              placeholder="e.g., ICML_2026"
              value={formData.abbreviation}
              onChange={(e) => handleFieldChange('abbreviation', e.target.value.replace(/\s/g, ''))}
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
              onChange={(e) => handleStartDateChange(e.target.value)}
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

        {/* Contact Information */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Contact Information
          </h5>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Used in email templates and invoice placeholders ([CONTACT_EMAIL], [PHONE]).
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Support Email
              </label>
              <input
                type="email"
                placeholder="support@example.com"
                className={`mt-1 block w-full border ${emailErrors.support_email ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100`}
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
              {emailErrors.support_email ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {emailErrors.support_email}
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Message notifications from speakers will be sent to this address.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contact Email
              </label>
              <input
                type="email"
                placeholder="contact@example.com"
                className={`mt-1 block w-full border ${emailErrors.contact_email ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100`}
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
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {emailErrors.contact_email}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Phone
              </label>
              <input
                type="text"
                placeholder="+49 123 456789"
                className={`mt-1 block w-full border ${emailErrors.phone ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100`}
                value={formData.phone || ''}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                onBlur={(e) => {
                  const phoneError = validatePhone(e.target.value);
                  setEmailErrors((prev) => ({ ...prev, phone: phoneError }));
                }}
                disabled={!isAdmin}
              />
              {emailErrors.phone && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailErrors.phone}</p>
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
                  onChange={(e) => handleCountryChange(e.target.value)}
                  disabled={!isAdmin}
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
