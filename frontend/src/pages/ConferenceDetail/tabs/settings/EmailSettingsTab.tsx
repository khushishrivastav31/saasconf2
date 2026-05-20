import { useState, useCallback, useEffect, useContext } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type { Conference } from '../../../../types';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import { DirtyContext } from '../../DirtyContext';

function EmailSettingsTab({ conference, isAdmin }: { conference: Conference; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const reportDirty = useContext(DirtyContext);

  const emailSendingEnabled = (conference.settings?.email_sending_enabled as boolean) ?? true;
  const savedHeader = (conference.settings?.email_header_html as string) || '';
  const savedFooter = (conference.settings?.email_footer_html as string) || '';

  const [headerHtml, setHeaderHtml] = useState(savedHeader);
  const [footerHtml, setFooterHtml] = useState(savedFooter);
  const [isDirty, setIsDirty] = useState(false);

  // Sync from server when conference data changes (only when not dirty)
  useEffect(() => {
    if (!isDirty) {
      setHeaderHtml(savedHeader);
      setFooterHtml(savedFooter);
    }
  }, [savedHeader, savedFooter, isDirty]);

  // Report dirty state to parent for tab-switch guarding
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  // Toggle stays as immediate action (it's a switch, not a form field)
  const toggleEmailSending = useMutation({
    mutationFn: async () => {
      const newSettings = {
        ...conference.settings,
        email_sending_enabled: !emailSendingEnabled,
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast(
        emailSendingEnabled ? 'Email sending disabled' : 'Email sending enabled',
        'success'
      );
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to update setting'), 'error');
    },
  });

  const saveHeaderFooter = useMutation({
    mutationFn: async (payload: { email_header_html: string; email_footer_html: string }) => {
      const newSettings = {
        ...conference.settings,
        ...payload,
      };
      await api.put(`/conferences/${conference.id}`, { settings: newSettings });
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conferences.detail(conference.id),
      });
      showToast('Email header/footer saved', 'success');
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to save email header/footer'), 'error');
    },
  });

  const handleHeaderChange = useCallback((html: string) => {
    setHeaderHtml(html);
    setIsDirty(true);
  }, []);

  const handleFooterChange = useCallback((html: string) => {
    setFooterHtml(html);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    saveHeaderFooter.mutate({
      email_header_html: headerHtml,
      email_footer_html: footerHtml,
    });
  }, [headerHtml, footerHtml, saveHeaderFooter]);

  const handleDiscard = useCallback(() => {
    setHeaderHtml(savedHeader);
    setFooterHtml(savedFooter);
    setIsDirty(false);
  }, [savedHeader, savedFooter]);

  return (
    <div className="space-y-6">
      {/* Email Sending Toggle */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Email Settings
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Control outgoing email notifications and customize header/footer.
              </p>
            </div>
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
                disabled={!isDirty || saveHeaderFooter.isPending || !isAdmin}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveHeaderFooter.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center h-6">
              <input
                type="checkbox"
                id="email-sending-enabled"
                checked={emailSendingEnabled}
                onChange={() => toggleEmailSending.mutate()}
                disabled={!isAdmin || toggleEmailSending.isPending}
                className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="email-sending-enabled"
                className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Enable email sending
              </label>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                When enabled, the system will send email notifications to recipients via Resend
                (e.g. submission confirmations, co-speaker invitations, message notifications). When
                disabled, all outgoing emails for this conference are suppressed.
              </p>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Note: Account verification and password reset emails are always sent regardless of
                this setting.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Email Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Header</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This content appears at the top of every outgoing email. Use it for branding, logos, or
            conference information.
          </p>
        </div>
        <div className="p-6">
          <RichTextEditor
            value={headerHtml}
            onChange={handleHeaderChange}
            disabled={!isAdmin}
            showHtmlToggle
          />
        </div>
      </div>

      {/* Email Footer */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Footer</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This content appears at the bottom of every outgoing email. Use it for legal
            disclaimers, contact information, or social media links.
          </p>
        </div>
        <div className="p-6">
          <RichTextEditor
            value={footerHtml}
            onChange={handleFooterChange}
            disabled={!isAdmin}
            showHtmlToggle
          />
        </div>
      </div>
    </div>
  );
}

export default EmailSettingsTab;
