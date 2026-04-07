/**
 * Training Registration Portal Settings
 *
 * Admin settings for the public training registration portal:
 * - Enable/disable portal
 * - Registration period
 * - Success message
 * - Color theme customization
 * - Portal URL display
 */
import { useState, useEffect, useCallback } from 'react';
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

interface PortalSettings {
  enabled: boolean;
  registration_start_date: string | null;
  registration_end_date: string | null;
  success_message: string;
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [theme, setTheme] = useState<Record<string, string>>(DEFAULT_THEME);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setStartDate(settings.registration_start_date || '');
      setEndDate(settings.registration_end_date || '');
      setSuccessMessage(settings.success_message || '');
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
      registration_start_date: startDate || null,
      registration_end_date: endDate || null,
      success_message: successMessage,
      theme,
    });
  }, [enabled, startDate, endDate, successMessage, theme, saveMutation]);

  const handleToggle = useCallback(() => {
    const newVal = !enabled;
    setEnabled(newVal);
    saveMutation.mutate({ enabled: newVal });
  }, [enabled, saveMutation]);

  const updateThemeColor = useCallback((key: string, value: string) => {
    setTheme((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetTheme = useCallback(() => {
    setTheme(DEFAULT_THEME);
  }, []);

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

      {/* Registration Period */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Registration Period
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Leave empty for no start restriction
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Leave empty for no end restriction
            </p>
          </div>
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
          rows={4}
          placeholder="Thank you for registering! Please check your email for confirmation details."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Shown to attendees after successful registration
        </p>
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
