import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { useAuth } from '../../../../hooks/useAuth';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../types';

interface StripeSettings {
  publishable_key: string | null;
  secret_key: string | null;
  is_enabled: boolean;
}

export default function StripeSetupTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Only tenant super users can edit Stripe settings
  const canEdit = isAdmin && user?.is_tenant_super_user;

  // Fetch Stripe settings
  const { data: settings, isLoading: settingsLoading } = useQuery<StripeSettings>({
    queryKey: queryKeys.stripeSettings(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/stripe-settings`);
      return res.data;
    },
  });

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      setPublishableKey(settings.publishable_key || '');
      setSecretKey(settings.secret_key || ''); // Masked for non-super-users
      setIsEnabled(settings.is_enabled);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        publishable_key: publishableKey || null,
        secret_key: secretKey || null,
        is_enabled: isEnabled,
      };

      const res = await api.put(`/conferences/${conference.id}/settings/stripe-settings`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stripeSettings(conference.id) });
      showToast('Stripe settings saved successfully', 'success');
      setError(null);
      setIsSaving(false);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
      setIsSaving(false);
    },
  });

  const handleSave = () => {
    setIsSaving(true);
    setError(null);
    saveMutation.mutate();
  };

  if (settingsLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Stripe Setup</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Configure Stripe API keys for payment processing. Only tenant super users can edit these
        settings.
      </p>

      {!canEdit && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Only tenant super users can modify Stripe settings. Secret keys are masked for security.
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <div className="space-y-4">
        {/* Is Enabled Toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="stripe-enabled"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            disabled={!canEdit}
            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label
            htmlFor="stripe-enabled"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Enable Stripe integration
          </label>
        </div>

        {/* Publishable Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Publishable Key
          </label>
          <input
            type="text"
            value={publishableKey}
            onChange={(e) => setPublishableKey(e.target.value)}
            disabled={!canEdit}
            placeholder="pk_test_..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed font-mono text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Public key starting with pk_test_ or pk_live_
          </p>
        </div>

        {/* Secret Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Secret Key
          </label>
          <div className="relative">
            <input
              type={showSecretKey ? 'text' : 'password'}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              disabled={!canEdit}
              placeholder={canEdit ? 'sk_test_...' : '***'}
              className="w-full px-3 py-2 pr-24 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed font-mono text-sm"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                {showSecretKey ? 'Hide' : 'Show'}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {canEdit
              ? 'Secret key starting with sk_test_ or sk_live_'
              : 'Secret key is masked for security. Only tenant super users can view/edit.'}
          </p>
        </div>

        {/* Save Button */}
        {canEdit && (
          <div className="flex justify-end pt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Documentation */}
      <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
          How to get your Stripe API keys
        </h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>Log in to your Stripe Dashboard</li>
          <li>Navigate to Developers → API keys</li>
          <li>Copy your Publishable key and Secret key</li>
          <li>For testing, use keys starting with pk_test_ and sk_test_</li>
          <li>For production, use keys starting with pk_live_ and sk_live_</li>
        </ol>
      </div>
    </div>
  );
}
