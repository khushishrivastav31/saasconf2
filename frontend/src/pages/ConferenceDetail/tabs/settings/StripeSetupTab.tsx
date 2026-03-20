import { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { useAuth } from '../../../../hooks/useAuth';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { COUNTRIES_BY_CONTINENT, BANK_TRANSFER_COUNTRY_CODES } from '../../../../config/countries';
import type { Conference } from '../../../../types';
import { DirtyContext } from '../../DirtyContext';

interface StripeSettings {
  publishable_key: string | null;
  secret_key: string | null;
  webhook_secret: string | null;
  is_enabled: boolean;
  bank_transfer_countries?: string[];
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
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

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
      setWebhookSecret(settings.webhook_secret || ''); // Masked for non-super-users
      setIsEnabled(settings.is_enabled);
    }
  }, [settings]);

  // Track dirty state for unsaved changes guard
  const isDirty = useMemo(() => {
    if (!settings) return false;
    return (
      publishableKey !== (settings.publishable_key || '') ||
      secretKey !== (settings.secret_key || '') ||
      webhookSecret !== (settings.webhook_secret || '') ||
      isEnabled !== settings.is_enabled
    );
  }, [settings, publishableKey, secretKey, webhookSecret, isEnabled]);

  const reportDirty = useContext(DirtyContext);
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  // Webhook URL for Stripe dashboard
  const webhookUrl = `${window.location.origin}/api/v1/stripe/webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhookUrl(true);
    setTimeout(() => setCopiedWebhookUrl(false), 2000);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        publishable_key: publishableKey || null,
        secret_key: secretKey || null,
        webhook_secret: webhookSecret || null,
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
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Stripe Setup
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          Configure Stripe API keys for payment processing. Only tenant super users can edit these
          settings.
        </p>

        {!canEdit && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Only tenant super users can modify Stripe settings. Secret keys are masked for
              security.
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
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

          {/* Webhook URL (read-only, for copying to Stripe dashboard) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Webhook URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-mono text-sm"
              />
              <button
                type="button"
                onClick={copyWebhookUrl}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
              >
                {copiedWebhookUrl ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Configure this URL in your Stripe Dashboard &rarr; Webhooks
            </p>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Webhook Signing Secret
            </label>
            <div className="relative">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                disabled={!canEdit}
                placeholder={canEdit ? 'whsec_...' : '***'}
                className="w-full px-3 py-2 pr-24 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed font-mono text-sm"
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  {showWebhookSecret ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {canEdit
                ? 'Signing secret from Stripe Dashboard (whsec_...). Used to verify webhook authenticity.'
                : 'Webhook secret is masked for security.'}
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
            How to set up Stripe
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-300 mb-4">
            <li>Log in to your Stripe Dashboard</li>
            <li>Navigate to Developers &rarr; API keys</li>
            <li>Copy your Publishable key and Secret key and paste them above</li>
            <li>Navigate to Developers &rarr; Webhooks</li>
            <li>Click &quot;Add endpoint&quot; and paste the Webhook URL from above</li>
            <li>
              Select these events: payment_intent.succeeded, payment_intent.payment_failed,
              charge.succeeded
            </li>
            <li>
              After creating the webhook, reveal and copy the &quot;Signing secret&quot; (whsec_...)
            </li>
            <li>Paste the signing secret above and save</li>
          </ol>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            For testing, use keys starting with pk_test_ and sk_test_. For production, use pk_live_
            and sk_live_.
          </p>
        </div>
      </div>

      {/* Bank Transfer Countries Section */}
      <BankTransferCountriesSection
        conferenceId={conference.id}
        isAdmin={isAdmin}
        initialCountries={settings?.bank_transfer_countries}
      />
    </div>
  );
}

// ─── Bank Transfer Countries Section ────────────────────────────────

const DEFAULT_BANK_TRANSFER = Array.from(BANK_TRANSFER_COUNTRY_CODES).sort();

function BankTransferCountriesSection({
  conferenceId,
  isAdmin,
  initialCountries,
}: {
  conferenceId: string;
  isAdmin: boolean;
  initialCountries?: string[];
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [countries, setCountries] = useState<string[]>(initialCountries ?? DEFAULT_BANK_TRANSFER);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  useEffect(() => {
    if (initialCountries) {
      setCountries(initialCountries);
    }
  }, [initialCountries]);

  const saveMutation = useMutation({
    mutationFn: async (updatedCountries: string[]) => {
      await api.put(
        `/conferences/${conferenceId}/settings/stripe-settings/bank-transfer-countries`,
        {
          countries: updatedCountries,
        }
      );
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.stripeSettings(conferenceId) });
    },
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const toggleCountry = useCallback(
    (code: string) => {
      const updated = countries.includes(code)
        ? countries.filter((c) => c !== code)
        : [...countries, code].sort();
      setCountries(updated);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveMutation.mutate(updated), 800);
    },
    [countries, saveMutation]
  );

  const resetToDefault = () => {
    setCountries(DEFAULT_BANK_TRANSFER);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveMutation.mutate(DEFAULT_BANK_TRANSFER);
  };

  const countrySet = useMemo(() => new Set(countries), [countries]);
  const totalCountries = useMemo(
    () => COUNTRIES_BY_CONTINENT.reduce((sum, g) => sum + g.countries.length, 0),
    []
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Payment Methods by Country
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            All countries accept credit card (when Stripe is enabled). Check countries where bank
            transfer is also available. If Stripe is disabled, all countries use bank transfer only.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {countries.length} of {totalCountries} with bank transfer
          </span>
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-600 dark:text-red-400">Save failed</span>
          )}
          {isAdmin && (
            <button
              onClick={resetToDefault}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              Reset to defaults
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {COUNTRIES_BY_CONTINENT.map((group) => {
          const enabledCount = group.countries.filter((c) => countrySet.has(c.code)).length;
          return (
            <details
              key={group.continent}
              open={group.continent === 'Europe'}
              className="border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg select-none">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {group.continent}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {enabledCount} / {group.countries.length} bank transfer
                </span>
              </summary>
              <div className="px-4 pb-3 pt-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-0.5">
                  {group.countries.map((c) => (
                    <label
                      key={c.code}
                      className="flex items-center gap-1.5 py-1 px-1.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={countrySet.has(c.code)}
                        onChange={() => toggleCountry(c.code)}
                        disabled={!isAdmin}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="font-mono text-gray-400 dark:text-gray-500">{c.code}</span>
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
