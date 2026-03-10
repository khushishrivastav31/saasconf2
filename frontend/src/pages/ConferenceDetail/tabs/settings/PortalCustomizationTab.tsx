/**
 * Portal Customization Settings Tab
 *
 * Manages public registration portal settings:
 * - Enable/disable portal
 * - Conference logo
 * - Registration period
 * - Color theme customization
 * - Portal URL display
 */
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import ConferenceLogo from '../../../../components/ConferenceLogo';
import type { Conference } from '../../../../types';

interface PortalCustomizationTabProps {
  conference: Conference;
  isAdmin: boolean;
}

// Default theme colors
const DEFAULT_THEME = {
  primary: '#2563eb', // blue-600
  background: '#f9fafb', // gray-50
  card: '#ffffff', // white
  text: '#111827', // gray-900
  border: '#e5e7eb', // gray-200
  headerBg: '#ffffff', // white
};

function PortalCustomizationTab({ conference, isAdmin }: PortalCustomizationTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Portal settings from conference.settings.public_registration_portal
  const portalSettings =
    (conference.settings?.public_registration_portal as {
      enabled?: boolean;
      registration_start_date?: string | null;
      registration_end_date?: string | null;
      success_message?: string | null;
      theme?: {
        primary?: string;
        background?: string;
        card?: string;
        text?: string;
        border?: string;
        headerBg?: string;
      };
    }) || {};

  const portalEnabled = portalSettings.enabled ?? false;
  const currentTheme = portalSettings.theme || DEFAULT_THEME;

  const [registrationStartDate, setRegistrationStartDate] = useState(
    portalSettings.registration_start_date || ''
  );
  const [registrationEndDate, setRegistrationEndDate] = useState(
    portalSettings.registration_end_date || ''
  );

  // Portal URL construction (must be before defaultSuccessMessage)
  const tenantSlug = conference.tenant_slug || 'demo';
  const conferenceSlug = conference.abbreviation?.toLowerCase() || 'conference';
  const portalUrl = `${window.location.origin}/${tenantSlug}/register/${conferenceSlug}`;

  // Build default success message with portal login link
  const defaultSuccessMessage = `Thank you for registering! Please check your email for next steps.

Each attendee will receive a welcome email with a link to set up their password. Once your password is set, you can log in to the attendee portal at:

${window.location.origin}/${tenantSlug}/portal/user/login

You'll be able to view your registration details, download your ticket, and access conference materials through the portal.`;

  const [successMessage, setSuccessMessage] = useState(
    portalSettings.success_message || defaultSuccessMessage
  );
  const [theme, setTheme] = useState(currentTheme);

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoStatus, setLogoStatus] = useState<'idle' | 'uploading' | 'deleting' | 'error'>('idle');
  const [logoError, setLogoError] = useState<string | null>(null);

  // Toggle portal enabled
  const togglePortal = useMutation({
    mutationFn: async () => {
      const newSettings = {
        ...conference.settings,
        public_registration_portal: {
          ...portalSettings,
          enabled: !portalEnabled,
        },
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast(portalEnabled ? 'Portal disabled' : 'Portal enabled', 'success');
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to update portal settings'), 'error');
    },
  });

  // Save success message
  const saveSuccessMessage = useMutation({
    mutationFn: async () => {
      const newSettings = {
        ...conference.settings,
        public_registration_portal: {
          ...portalSettings,
          success_message: successMessage,
        },
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast('Success message saved', 'success');
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to save success message'), 'error');
    },
  });

  // Save registration dates
  const saveDates = useMutation({
    mutationFn: async () => {
      const newSettings = {
        ...conference.settings,
        public_registration_portal: {
          ...portalSettings,
          registration_start_date: registrationStartDate || null,
          registration_end_date: registrationEndDate || null,
        },
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast('Registration dates saved', 'success');
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to save dates'), 'error');
    },
  });

  // Save theme colors
  const saveTheme = useMutation({
    mutationFn: async () => {
      const newSettings = {
        ...conference.settings,
        public_registration_portal: {
          ...portalSettings,
          theme,
        },
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast('Theme colors saved', 'success');
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to save theme'), 'error');
    },
  });

  // Reset theme to default
  const resetTheme = () => {
    setTheme(DEFAULT_THEME);
  };

  // Logo upload
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast('Logo uploaded successfully', 'success');
    },
    onError: (err) => {
      setLogoStatus('error');
      setLogoError(parseApiError(err));
      showToast(parseApiError(err, 'Failed to upload logo'), 'error');
      setTimeout(() => setLogoStatus('idle'), 3000);
    },
  });

  // Logo delete
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast('Logo deleted successfully', 'success');
    },
    onError: (err) => {
      setLogoStatus('error');
      setLogoError(parseApiError(err));
      showToast(parseApiError(err, 'Failed to delete logo'), 'error');
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

  // Copy portal URL to clipboard
  const copyPortalUrl = () => {
    navigator.clipboard.writeText(portalUrl);
    showToast('Portal URL copied to clipboard', 'success');
  };

  const hasThemeChanges = JSON.stringify(theme) !== JSON.stringify(currentTheme);

  return (
    <div className="space-y-6">
      {/* Portal URL Display */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Registration Portal
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Public registration portal for attendees to register without authentication.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-start gap-4">
            <div className="flex items-center h-6">
              <input
                type="checkbox"
                id="portal-enabled"
                checked={portalEnabled}
                onChange={() => togglePortal.mutate()}
                disabled={!isAdmin || togglePortal.isPending}
                className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="portal-enabled"
                className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Enable public registration portal
              </label>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                When enabled, anyone with the link can register for this conference without logging
                in.
              </p>
            </div>
          </div>

          {/* Portal Logo */}
          {portalEnabled && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Portal Logo
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This logo will appear at the top of the public registration portal, before the
                conference name.
              </p>
              <div className="flex items-start gap-4">
                {/* Logo preview */}
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
                      id="portal-logo-upload"
                    />
                    <label
                      htmlFor="portal-logo-upload"
                      className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
                        logoStatus === 'uploading'
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-wait'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {logoStatus === 'uploading' ? (
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
                          Uploading...
                        </>
                      ) : (
                        <>
                          <svg
                            className="h-4 w-4 mr-1.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
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
                            : 'bg-white dark:bg-gray-800 text-red-600 border border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'
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
                              viewBox="0 0 24 24"
                              stroke="currentColor"
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

                    {logoError && (
                      <p className="text-sm text-red-600 dark:text-red-400">{logoError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Registration Period */}
          {portalEnabled && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                Registration Period
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="registration-start"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Registration Opens
                  </label>
                  <input
                    type="date"
                    id="registration-start"
                    value={registrationStartDate}
                    onChange={(e) => setRegistrationStartDate(e.target.value)}
                    disabled={!isAdmin}
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Leave empty to allow registration immediately
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="registration-end"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Registration Closes
                  </label>
                  <input
                    type="date"
                    id="registration-end"
                    value={registrationEndDate}
                    onChange={(e) => setRegistrationEndDate(e.target.value)}
                    disabled={!isAdmin}
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Leave empty to keep registration open indefinitely
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => saveDates.mutate()}
                  disabled={!isAdmin || saveDates.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {saveDates.isPending ? 'Saving...' : 'Save Dates'}
                </button>
              </div>
            </div>
          )}

          {/* Success Message */}
          {portalEnabled && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Success Message
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This message will be displayed to users after they successfully complete their
                registration.
              </p>
              <textarea
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
                disabled={!isAdmin}
                rows={4}
                className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Enter a custom message to show after successful registration..."
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {successMessage.length} characters
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => saveSuccessMessage.mutate()}
                  disabled={!isAdmin || saveSuccessMessage.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {saveSuccessMessage.isPending ? 'Saving...' : 'Save Message'}
                </button>
              </div>
            </div>
          )}

          {/* Portal URL */}
          {portalEnabled && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Portal URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={portalUrl}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                />
                <button
                  onClick={copyPortalUrl}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Copy
                </button>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                >
                  Open
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Color Theme Customization */}
      {portalEnabled && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Color Theme</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Customize the portal colors to match your brand. Changes apply immediately.
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Primary Color */}
              <div>
                <label
                  htmlFor="color-primary"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Primary Color
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    id="color-primary"
                    value={theme.primary}
                    onChange={(e) => setTheme({ ...theme, primary: e.target.value })}
                    disabled={!isAdmin}
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={theme.primary}
                    onChange={(e) => setTheme({ ...theme, primary: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="#2563eb"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Used for buttons, links, and accents
                </p>
              </div>

              {/* Background Color */}
              <div>
                <label
                  htmlFor="color-background"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Background Color
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    id="color-background"
                    value={theme.background}
                    onChange={(e) => setTheme({ ...theme, background: e.target.value })}
                    disabled={!isAdmin}
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={theme.background}
                    onChange={(e) => setTheme({ ...theme, background: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="#f9fafb"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Main page background
                </p>
              </div>

              {/* Card Background */}
              <div>
                <label
                  htmlFor="color-card"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Card Background
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    id="color-card"
                    value={theme.card}
                    onChange={(e) => setTheme({ ...theme, card: e.target.value })}
                    disabled={!isAdmin}
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={theme.card}
                    onChange={(e) => setTheme({ ...theme, card: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="#ffffff"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Content cards and panels
                </p>
              </div>

              {/* Text Color */}
              <div>
                <label
                  htmlFor="color-text"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Text Color
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    id="color-text"
                    value={theme.text}
                    onChange={(e) => setTheme({ ...theme, text: e.target.value })}
                    disabled={!isAdmin}
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={theme.text}
                    onChange={(e) => setTheme({ ...theme, text: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="#111827"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Primary text color</p>
              </div>

              {/* Border Color */}
              <div>
                <label
                  htmlFor="color-border"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Border Color
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    id="color-border"
                    value={theme.border}
                    onChange={(e) => setTheme({ ...theme, border: e.target.value })}
                    disabled={!isAdmin}
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={theme.border}
                    onChange={(e) => setTheme({ ...theme, border: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="#e5e7eb"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Card borders and dividers
                </p>
              </div>

              {/* Header Background */}
              <div>
                <label
                  htmlFor="color-header"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Header Background
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    id="color-header"
                    value={theme.headerBg}
                    onChange={(e) => setTheme({ ...theme, headerBg: e.target.value })}
                    disabled={!isAdmin}
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={theme.headerBg}
                    onChange={(e) => setTheme({ ...theme, headerBg: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="#ffffff"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Conference header section
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            {isAdmin && (
              <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={resetTheme}
                  disabled={JSON.stringify(theme) === JSON.stringify(DEFAULT_THEME)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 disabled:dark:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  Reset to Default
                </button>
                <button
                  onClick={() => saveTheme.mutate()}
                  disabled={!hasThemeChanges || saveTheme.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {saveTheme.isPending ? 'Saving...' : 'Save Theme'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PortalCustomizationTab;
