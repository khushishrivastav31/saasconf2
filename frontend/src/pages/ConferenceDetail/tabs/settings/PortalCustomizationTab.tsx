/**
 * Portal Customization Settings Tab
 *
 * Manages public registration portal settings:
 * - Enable/disable portal
 * - Custom CSS (file upload or inline editor)
 * - Portal URL display
 */
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type { Conference } from '../../../../types';

interface PortalCustomizationTabProps {
  conference: Conference;
  isAdmin: boolean;
}

type CSSMode = 'file' | 'inline';

function PortalCustomizationTab({ conference, isAdmin }: PortalCustomizationTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Portal settings from conference.settings.public_registration_portal
  const portalSettings =
    (conference.settings?.public_registration_portal as {
      enabled?: boolean;
      custom_css_attachment_id?: string | null;
      inline_css?: string | null;
      use_inline_css?: boolean;
    }) || {};

  const portalEnabled = portalSettings.enabled ?? false;
  const useInlineCSS = portalSettings.use_inline_css ?? false;
  const inlineCSS = portalSettings.inline_css || '';

  const [cssMode, setCSSMode] = useState<CSSMode>(useInlineCSS ? 'inline' : 'file');
  const [cssContent, setCSSContent] = useState(inlineCSS);
  const [uploading, setUploading] = useState(false);
  const [loadingDefaultCSS, setLoadingDefaultCSS] = useState(false);

  // Fetch default CSS template on mount if no custom CSS exists
  useEffect(() => {
    if (!inlineCSS && cssMode === 'inline') {
      setLoadingDefaultCSS(true);
      fetch('/api/v1/portal-templates/default-registration-portal.css')
        .then((res) => res.text())
        .then((css) => {
          setCSSContent(css);
        })
        .catch((error) => {
          console.error('Failed to load default CSS template:', error);
        })
        .finally(() => {
          setLoadingDefaultCSS(false);
        });
    }
  }, [inlineCSS, cssMode]);

  // Portal URL construction
  const tenantSlug = conference.tenant_slug || 'demo';
  const conferenceSlug = conference.abbreviation?.toLowerCase() || 'conference';
  const portalUrl = `${window.location.origin}/${tenantSlug}/register/${conferenceSlug}`;

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

  // Save inline CSS
  const saveInlineCSS = useMutation({
    mutationFn: async () => {
      const newSettings = {
        ...conference.settings,
        public_registration_portal: {
          ...portalSettings,
          inline_css: cssContent,
          use_inline_css: true,
        },
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast('Custom CSS saved', 'success');
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to save CSS'), 'error');
    },
  });

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.css')) {
      showToast('Please upload a CSS file', 'error');
      return;
    }

    if (file.size > 100 * 1024) {
      // 100KB limit
      showToast('CSS file must be less than 100KB', 'error');
      return;
    }

    setUploading(true);
    try {
      // TODO: Implement file upload to attachments API
      // For now, read and save as inline CSS
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const newSettings = {
          ...conference.settings,
          public_registration_portal: {
            ...portalSettings,
            inline_css: content,
            use_inline_css: false, // Indicate it was uploaded as file
          },
        };
        await api.put(`/conferences/${conference.id}`, { settings: newSettings });
        queryClient.invalidateQueries({
          queryKey: queryKeys.conferences.detail(conference.id),
        });
        showToast('CSS file uploaded', 'success');
        setUploading(false);
      };
      reader.onerror = () => {
        showToast('Failed to read file', 'error');
        setUploading(false);
      };
      reader.readAsText(file);
    } catch (error) {
      showToast(parseApiError(error, 'Failed to upload file'), 'error');
      setUploading(false);
    }
  };

  // Download default template
  const downloadDefaultTemplate = () => {
    // Fetch from backend endpoint
    fetch('/api/v1/portal-templates/default-registration-portal.css')
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'default-registration-portal.css';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((error) => {
        showToast('Failed to download template', 'error');
        console.error('Failed to download default template:', error);
      });
  };

  // Copy portal URL to clipboard
  const copyPortalUrl = () => {
    navigator.clipboard.writeText(portalUrl);
    showToast('Portal URL copied to clipboard', 'success');
  };

  const charCount = cssContent.length;
  const maxChars = 100 * 1024; // 100KB
  const isNearLimit = charCount > maxChars * 0.9;
  const isOverLimit = charCount > maxChars;

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

        <div className="p-6 space-y-4">
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

          {/* Portal URL */}
          {portalEnabled && (
            <div>
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

      {/* Custom CSS Settings */}
      {portalEnabled && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custom CSS</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Customize the portal appearance with your own CSS.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* CSS Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                CSS Source
              </label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="css-mode"
                    value="file"
                    checked={cssMode === 'file'}
                    onChange={() => setCSSMode('file')}
                    disabled={!isAdmin}
                    className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Upload CSS File
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="css-mode"
                    value="inline"
                    checked={cssMode === 'inline'}
                    onChange={() => setCSSMode('inline')}
                    disabled={!isAdmin}
                    className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Inline Editor
                  </span>
                </label>
              </div>
            </div>

            {/* File Upload Mode */}
            {cssMode === 'file' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Upload CSS File (max 100KB)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept=".css"
                      onChange={handleFileUpload}
                      disabled={!isAdmin || uploading}
                      className="flex-1 text-sm text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400 dark:hover:file:bg-blue-900/50"
                    />
                    <button
                      onClick={downloadDefaultTemplate}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium whitespace-nowrap"
                    >
                      Download Template
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Download the default template as a starting point for your custom CSS.
                  </p>
                </div>
              </div>
            )}

            {/* Inline Editor Mode */}
            {cssMode === 'inline' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                      CSS Code
                    </label>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs ${
                          isOverLimit
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : isNearLimit
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {charCount.toLocaleString()} / {maxChars.toLocaleString()} characters
                      </span>
                      <button
                        onClick={downloadDefaultTemplate}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Download Template
                      </button>
                    </div>
                  </div>
                  {loadingDefaultCSS ? (
                    <div className="flex justify-center items-center py-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <textarea
                      value={cssContent}
                      onChange={(e) => setCSSContent(e.target.value)}
                      disabled={!isAdmin}
                      rows={20}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="/* Enter your custom CSS here */"
                    />
                  )}
                  {isOverLimit && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                      CSS content exceeds the 100KB limit. Please reduce the size.
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => saveInlineCSS.mutate()}
                    disabled={!isAdmin || saveInlineCSS.isPending || isOverLimit}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {saveInlineCSS.isPending ? 'Saving...' : 'Save CSS'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PortalCustomizationTab;
