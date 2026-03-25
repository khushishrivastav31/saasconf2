/**
 * Email Settings Tab (Training)
 *
 * Manages email sending toggle + header/footer HTML for training emails.
 * Tenant-scoped — shared across all trainings.
 */
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import RichTextEditor from '../../../../components/common/RichTextEditor';

interface EmailSettings {
  email_sending_enabled: boolean;
  email_header_html: string;
  email_footer_html: string;
}

export default function EmailSettingsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: settings, isLoading } = useQuery<EmailSettings>({
    queryKey: queryKeys.trainingEmailSettings,
    queryFn: async () => {
      const res = await api.get('/trainings/email-settings');
      return res.data;
    },
  });

  const emailSendingEnabled = settings?.email_sending_enabled ?? true;
  const savedHeader = settings?.email_header_html || '';
  const savedFooter = settings?.email_footer_html || '';

  const [headerHtml, setHeaderHtml] = useState(savedHeader);
  const [footerHtml, setFooterHtml] = useState(savedFooter);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setHeaderHtml(savedHeader);
      setFooterHtml(savedFooter);
    }
  }, [savedHeader, savedFooter, isDirty]);

  const toggleEmailSending = useMutation({
    mutationFn: async () => {
      await api.put('/trainings/email-settings', {
        email_sending_enabled: !emailSendingEnabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingEmailSettings });
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
      await api.put('/trainings/email-settings', payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingEmailSettings });
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

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
                Control outgoing email notifications and customize header/footer for training
                emails. These settings apply to all trainings.
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
                disabled={!isDirty || saveHeaderFooter.isPending}
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
                disabled={toggleEmailSending.isPending}
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
                When enabled, the system will send email notifications to training registrants (e.g.
                registration confirmations, invoices, payment reminders). When disabled, all
                outgoing training emails are suppressed.
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
            This content appears at the top of every outgoing training email. Use it for branding,
            logos, or training information.
          </p>
        </div>
        <div className="p-6">
          <RichTextEditor value={headerHtml} onChange={handleHeaderChange} />
        </div>
      </div>

      {/* Email Footer */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Footer</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This content appears at the bottom of every outgoing training email. Use it for legal
            disclaimers, contact information, or social media links.
          </p>
        </div>
        <div className="p-6">
          <RichTextEditor value={footerHtml} onChange={handleFooterChange} />
        </div>
      </div>
    </div>
  );
}
