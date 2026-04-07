/**
 * Training Registration Portal Settings
 *
 * Admin settings for the public training registration portal:
 * - Enable/disable portal
 * - Languages (available + default)
 * - Registration period
 * - Success message
 * - Portal Texts (admin-editable, grouped by section, per language)
 * - Color theme customization
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useToast } from '../../../../components/Toast';

const DEFAULT_THEME = {
  primary: '#2563eb',
  background: '#f9fafb',
  card: '#ffffff',
  text: '#111827',
  border: '#e5e7eb',
  headerBg: '#ffffff',
};

const LANG_LABELS: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
};

const ALL_LANGUAGES = ['en', 'de', 'fr', 'es', 'it'];

/** Portal text keys grouped by section */
const TEXT_GROUPS: { title: string; keys: { key: string; label: string }[] }[] = [
  {
    title: 'Search Page',
    keys: [
      { key: 'search_title', label: 'Page title' },
      { key: 'search_subtitle', label: 'Page subtitle' },
      { key: 'search_placeholder', label: 'Search placeholder' },
      { key: 'no_results', label: 'No results message' },
      { key: 'no_results_hint', label: 'No results hint' },
      { key: 'showing_results', label: 'Results count ({count}, {total})' },
      { key: 'btn_register', label: 'Register button' },
      { key: 'per_person', label: 'Per person label' },
      { key: 'days', label: 'Days label' },
    ],
  },
  {
    title: 'Filters',
    keys: [
      { key: 'filters', label: 'Filters heading' },
      { key: 'filter_date', label: 'Date range' },
      { key: 'filter_location', label: 'Location' },
      { key: 'filter_language', label: 'Language' },
      { key: 'filter_certification', label: 'Certification' },
      { key: 'filter_theme', label: 'Theme' },
      { key: 'filter_type', label: 'Type' },
      { key: 'filter_clear', label: 'Clear all' },
    ],
  },
  {
    title: 'Registration Form',
    keys: [
      { key: 'section_attendees', label: 'Attendees heading' },
      { key: 'btn_add_attendee', label: 'Add attendee button' },
      { key: 'btn_bulk_add', label: 'Bulk add button' },
      { key: 'label_first_name', label: 'First name' },
      { key: 'label_last_name', label: 'Last name' },
      { key: 'label_email', label: 'Email' },
      { key: 'section_billing', label: 'Billing heading' },
      { key: 'label_company', label: 'Company name' },
      { key: 'label_street', label: 'Street' },
      { key: 'label_postal', label: 'Postal code' },
      { key: 'label_city', label: 'City' },
      { key: 'label_country', label: 'Country' },
      { key: 'label_vat', label: 'VAT number' },
      { key: 'section_contact', label: 'Contact heading' },
      { key: 'label_phone', label: 'Phone' },
      { key: 'copy_from_attendee', label: 'Copy from attendee' },
      { key: 'section_payment', label: 'Payment heading' },
      { key: 'label_bank_transfer', label: 'Bank transfer' },
      { key: 'label_credit_card', label: 'Credit card' },
      { key: 'section_summary', label: 'Summary heading' },
      { key: 'total', label: 'Total' },
      { key: 'section_terms', label: 'Terms checkbox text' },
      { key: 'btn_submit', label: 'Submit button' },
      { key: 'processing', label: 'Processing text' },
    ],
  },
  {
    title: 'Confirmation Page',
    keys: [
      { key: 'confirmation_title', label: 'Title' },
      { key: 'confirmation_message', label: 'Message' },
      { key: 'btn_browse_more', label: 'Browse more button' },
    ],
  },
];

interface PortalSettings {
  enabled: boolean;
  success_message: string;
  default_language: string;
  available_languages: string[];
  portal_texts: Record<string, Record<string, string>>;
  theme: Record<string, string>;
}

export default function RegistrationPortalTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: settings, isLoading } = useQuery<PortalSettings>({
    queryKey: ['training-portal-settings'],
    queryFn: async () => {
      const res = await api.get('/trainings/portal-settings');
      return res.data;
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('en');
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['en', 'de']);
  const [portalTexts, setPortalTexts] = useState<Record<string, Record<string, string>>>({});
  const [activeTextLang, setActiveTextLang] = useState('en');
  const [theme, setTheme] = useState<Record<string, string>>(DEFAULT_THEME);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setSuccessMessage(settings.success_message || '');
      setDefaultLanguage(settings.default_language || 'en');
      setAvailableLanguages(settings.available_languages || ['en', 'de']);
      setPortalTexts(settings.portal_texts || {});
      setTheme({ ...DEFAULT_THEME, ...settings.theme });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<PortalSettings>) => {
      const res = await api.put('/trainings/portal-settings', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-portal-settings'] });
      showToast('Portal settings saved', 'success');
    },
    onError: () => showToast('Failed to save settings', 'error'),
  });

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      enabled,
      success_message: successMessage,
      default_language: defaultLanguage,
      available_languages: availableLanguages,
      portal_texts: portalTexts,
      theme,
    });
  }, [
    enabled,
    successMessage,
    defaultLanguage,
    availableLanguages,
    portalTexts,
    theme,
    saveMutation,
  ]);

  const handleToggle = useCallback(() => {
    const newVal = !enabled;
    setEnabled(newVal);
    saveMutation.mutate({ enabled: newVal });
  }, [enabled, saveMutation]);

  const updateThemeColor = useCallback((key: string, value: string) => {
    setTheme((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetTheme = useCallback(() => setTheme(DEFAULT_THEME), []);

  const toggleLanguage = useCallback(
    (langCode: string) => {
      setAvailableLanguages((prev) => {
        if (prev.includes(langCode)) {
          // Don't remove the last language or the default
          if (prev.length <= 1 || langCode === defaultLanguage) return prev;
          return prev.filter((l) => l !== langCode);
        }
        return [...prev, langCode];
      });
    },
    [defaultLanguage]
  );

  const updatePortalText = useCallback((langCode: string, key: string, value: string) => {
    setPortalTexts((prev) => ({
      ...prev,
      [langCode]: { ...(prev[langCode] || {}), [key]: value },
    }));
  }, []);

  // Inactive language options (available to add)
  const inactiveLanguages = useMemo(
    () => ALL_LANGUAGES.filter((l) => !availableLanguages.includes(l)),
    [availableLanguages]
  );

  // Fetch tenant slug for portal URL
  const { data: tenantData } = useQuery<{ slug: string }>({
    queryKey: ['my-company-slug'],
    queryFn: async () => {
      const res = await api.get('/my-company');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const tenantSlug = tenantData?.slug || 'demo';
  const portalUrl = `${window.location.origin}/${tenantSlug}/trainings/register`;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Enable/Disable */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Public Training Portal
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Allow attendees to browse and register for trainings
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
            <p className="text-sm text-green-700 dark:text-green-300">
              Portal URL:{' '}
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs underline"
              >
                {portalUrl}
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Languages */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Languages</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Available Languages
            </label>
            <div className="flex flex-wrap gap-2">
              {availableLanguages.map((code) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                >
                  {LANG_LABELS[code] || code.toUpperCase()}
                  {code === defaultLanguage && (
                    <span className="text-[10px] bg-primary-600 text-white px-1 rounded">
                      default
                    </span>
                  )}
                  {code !== defaultLanguage && availableLanguages.length > 1 && (
                    <button
                      onClick={() => toggleLanguage(code)}
                      className="ml-0.5 text-primary-500 hover:text-red-500"
                      title="Remove language"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </span>
              ))}
              {inactiveLanguages.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) toggleLanguage(e.target.value);
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="px-3 py-1.5 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                >
                  <option value="">+ Add language</option>
                  {inactiveLanguages.map((code) => (
                    <option key={code} value={code}>
                      {LANG_LABELS[code] || code.toUpperCase()}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Default Language
            </label>
            <select
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
            >
              {availableLanguages.map((code) => (
                <option key={code} value={code}>
                  {LANG_LABELS[code] || code.toUpperCase()}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              The portal opens in this language by default
            </p>
          </div>
        </div>
      </div>

      {/* Portal Texts */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Portal Texts
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Customize all text strings shown on the public portal. Leave empty to use defaults.
        </p>

        {/* Language tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
          {availableLanguages.map((code) => (
            <button
              key={code}
              onClick={() => setActiveTextLang(code)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTextLang === code
                  ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {LANG_LABELS[code] || code.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Grouped text fields */}
        <div className="space-y-6">
          {TEXT_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {group.title}
              </h4>
              <div className="space-y-2">
                {group.keys.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="w-40 shrink-0 text-xs text-gray-500 dark:text-gray-400 text-right">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={portalTexts[activeTextLang]?.[key] || ''}
                      onChange={(e) => updatePortalText(activeTextLang, key, e.target.value)}
                      placeholder={key}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Success Message */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Success Message
        </h3>
        <textarea
          value={successMessage}
          onChange={(e) => setSuccessMessage(e.target.value)}
          rows={3}
          placeholder="Thank you for registering! Please check your email for confirmation details."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400"
        />
      </div>

      {/* Color Theme */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Color Theme</h3>
          <button
            onClick={resetTheme}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Reset to defaults
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'primary', label: 'Primary Color' },
            { key: 'background', label: 'Background' },
            { key: 'card', label: 'Card Background' },
            { key: 'text', label: 'Text Color' },
            { key: 'border', label: 'Border Color' },
            { key: 'headerBg', label: 'Header Background' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme[key] || DEFAULT_THEME[key as keyof typeof DEFAULT_THEME]}
                  onChange={(e) => updateThemeColor(key, e.target.value)}
                  className="h-8 w-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
                <input
                  type="text"
                  value={theme[key] || ''}
                  onChange={(e) => updateThemeColor(key, e.target.value)}
                  className="flex-1 px-2 py-1 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                  placeholder="#000000"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
