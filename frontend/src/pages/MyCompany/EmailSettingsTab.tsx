import { useState, lazy, Suspense } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../config/api';
import { parseApiError } from '../../utils/apiError';
import { useToast } from '../../components/Toast';
import EmailFailuresSection from './EmailFailuresSection';
import type { Tenant } from '../../types';
import type { EmailDefaults } from './types';

const SystemEmailTemplates = lazy(() => import('../SystemEmailTemplates'));

export default function EmailSettingsTab({
  tenant,
  onUpdate,
}: {
  tenant: Tenant;
  onUpdate: () => void;
}) {
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
