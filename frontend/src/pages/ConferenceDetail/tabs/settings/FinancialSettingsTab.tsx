import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { COUNTRY_OPTIONS } from '../../../../config/countries';
import type {
  Conference,
  ConferenceUpdate,
  PlatformCurrency,
  PaginatedResponse,
} from '../../../../types';
import FiscalRepSection from '../FiscalRepSection';
import { DirtyContext } from '../../DirtyContext';

interface VatRule {
  attendance_type: string;
  customer_type: string;
  customer_location: string;
  charge_vat: boolean;
  vat_rate_source: string;
  reverse_charge: boolean;
  oss_applicable: boolean;
  note: string;
}

const NUMBER_FORMAT_PRESETS = [
  { code: 'us_uk', label: 'US/UK (1,234.56)', example: '1,234,567.89' },
  { code: 'european', label: 'European (1.234,56)', example: '1.234.567,89' },
  { code: 'swiss', label: "Swiss (1'234.56)", example: "1'234'567.89" },
  { code: 'french', label: 'French (1 234,56)', example: '1 234 567,89' },
  { code: 'indian', label: 'Indian (1,23,456.78)', example: '1,23,45,67.89' },
  { code: 'no_separator', label: 'No separator (1234.56)', example: '1234567.89' },
];

const DEFAULT_EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
];

const ATTENDANCE_LABELS: Record<string, string> = {
  in_person: 'In-Person',
  virtual: 'Virtual',
  hybrid_onsite: 'Hybrid (On-Site)',
  hybrid_online: 'Hybrid (Online)',
};
const CUSTOMER_TYPE_LABELS: Record<string, string> = { b2b: 'B2B', b2c: 'B2C' };
const LOCATION_LABELS: Record<string, string> = {
  domestic: 'Domestic',
  eu: 'EU',
  non_eu: 'Non-EU',
};
const RATE_SOURCE_OPTIONS = [
  { value: 'conference', label: 'Conference country' },
  { value: 'customer', label: "Customer's country" },
  { value: 'none', label: 'None' },
];

function FinancialSettingsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const reportDirty = useContext(DirtyContext);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    currency: conference.currency || '',
    invoice_currency: conference.invoice_currency || '',
    exchange_rate: conference.settings?.invoice_exchange_rate
      ? String(conference.settings.invoice_exchange_rate)
      : '',
  });
  const [isDirty, setIsDirty] = useState(false);

  // Sync from server when not dirty
  useEffect(() => {
    if (!isDirty) {
      setFormData({
        currency: conference.currency || '',
        invoice_currency: conference.invoice_currency || '',
        exchange_rate: conference.settings?.invoice_exchange_rate
          ? String(conference.settings.invoice_exchange_rate)
          : '',
      });
    }
  }, [
    conference.currency,
    conference.invoice_currency,
    conference.settings?.invoice_exchange_rate,
    isDirty,
  ]);

  // Track VAT dirty state from sub-component
  const [vatDirty, setVatDirty] = useState(false);
  const combinedDirty = isDirty || vatDirty;

  // Report dirty state to parent
  useEffect(() => {
    reportDirty(combinedDirty);
    return () => reportDirty(false);
  }, [combinedDirty, reportDirty]);

  const { data: currencyOptions } = useQuery({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        '/admin/settings/currencies',
        { params: { page_size: 100, is_active: true } }
      );
      return response.data.items;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const exchangeVal = data.exchange_rate ? parseFloat(data.exchange_rate) : null;
      const payload: ConferenceUpdate = {
        currency: data.currency || undefined,
        invoice_currency: data.invoice_currency || null,
        settings: {
          ...(conference.settings || {}),
          invoice_exchange_rate: exchangeVal,
        },
      };
      const response = await api.put(`/conferences/${conference.id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conferences.detail(conference.id) });
      setIsDirty(false);
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  const handleFieldChange = useCallback(
    (field: 'currency' | 'invoice_currency' | 'exchange_rate', value: string) => {
      setFormData((prev) => {
        let newData = { ...prev, [field]: value };
        // Clear exchange rate when second currency is removed
        if (field === 'invoice_currency' && !value) {
          newData = { ...newData, exchange_rate: '' };
        }
        return newData;
      });
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(() => {
    updateMutation.mutate(formData);
  }, [formData, updateMutation]);

  const handleDiscard = useCallback(() => {
    setFormData({
      currency: conference.currency || '',
      invoice_currency: conference.invoice_currency || '',
      exchange_rate: conference.settings?.invoice_exchange_rate
        ? String(conference.settings.invoice_exchange_rate)
        : '',
    });
    setIsDirty(false);
  }, [conference]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Currency & Tax</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Configure currencies and tax representation for this conference.
          </p>
        </div>
        {isAdmin && (
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
              disabled={!isDirty || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Currency Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Currencies</h5>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Primary Currency
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.currency}
                onChange={(e) => handleFieldChange('currency', e.target.value)}
                disabled={!isAdmin}
              >
                <option value="">Select currency...</option>
                {(currencyOptions || []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used for all pricing in this conference.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Second Currency
                <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(optional)</span>
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.invoice_currency}
                onChange={(e) => handleFieldChange('invoice_currency', e.target.value)}
                disabled={!isAdmin}
              >
                <option value="">Same as primary</option>
                {(currencyOptions || []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Alternative currency for invoices.
              </p>
            </div>
          </div>
          {formData.invoice_currency && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Exchange Rate
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  className="block w-48 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                  value={formData.exchange_rate}
                  onChange={(e) => handleFieldChange('exchange_rate', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="e.g. 1.08"
                  step="0.0001"
                  min="0"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  1 {formData.currency || 'EUR'} = {formData.exchange_rate || '?'}{' '}
                  {formData.invoice_currency}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used for [SECOND_TOTAL] and [SECOND_SUBTOTAL] placeholders in invoice templates.
              </p>
            </div>
          )}
        </div>

        {/* Tax & VAT */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <FiscalRepSection
            conferenceId={conference.id}
            conferenceCountry={conference.country}
            isAdmin={isAdmin}
          />
        </div>

        {/* VAT Decision Rules */}
        <VatRulesTable conferenceId={conference.id} isAdmin={isAdmin} onDirtyChange={setVatDirty} />

        {/* EU Member States */}
        <EuCountriesSection conferenceId={conference.id} isAdmin={isAdmin} />

        {/* Number Format */}
        <NumberFormatSection conferenceId={conference.id} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

// ─── VAT Rules Table ─────────────────────────────────────────────────

function VatRulesTable({
  conferenceId,
  isAdmin,
  onDirtyChange,
}: {
  conferenceId: string;
  isAdmin: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [rules, setRules] = useState<VatRule[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const {
    data: invoiceSettings,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.invoiceSettings(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/settings/invoice-settings`);
      return res.data;
    },
  });

  // Sync from server when not dirty
  useEffect(() => {
    if (invoiceSettings?.vat_rules && !isDirty) {
      setRules(invoiceSettings.vat_rules);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceSettings]);

  // Report dirty to parent
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: async (updatedRules: VatRule[]) => {
      await api.put(`/conferences/${conferenceId}/settings/invoice-settings`, {
        vat_rules: updatedRules,
      });
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conferenceId) });
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
    },
  });

  const updateRule = useCallback((index: number, field: keyof VatRule, value: string | boolean) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    setIsDirty(true);
  }, []);

  const handleSaveVat = useCallback(() => {
    saveMutation.mutate(rules);
  }, [rules, saveMutation]);

  const handleDiscardVat = useCallback(() => {
    if (invoiceSettings?.vat_rules) {
      setRules(invoiceSettings.vat_rules);
      setIsDirty(false);
    }
  }, [invoiceSettings]);

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400 text-sm">Loading VAT rules...</div>;
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-red-500 dark:text-red-400">
        Failed to load data. Please try again.
      </div>
    );
  }

  // Group rules by attendance type for visual sections
  const attendanceTypes = ['in_person', 'virtual', 'hybrid_onsite', 'hybrid_online'];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            VAT Decision Table
          </h5>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Defines VAT treatment per attendance type, customer type (B2B/B2C), and customer
            location.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleDiscardVat}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSaveVat}
            disabled={!isDirty || saveMutation.isPending || !isAdmin}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save VAT Rules'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                Attendance
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                Customer
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                Location
              </th>
              <th className="text-center py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                Charge VAT
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                VAT Rate From
              </th>
              <th className="text-center py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                Reverse Charge
              </th>
              <th className="text-center py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                OSS
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {attendanceTypes.map((att) => {
              const groupRules = rules
                .map((r, idx) => ({ ...r, _idx: idx }))
                .filter((r) => r.attendance_type === att);
              if (groupRules.length === 0) return null;

              return groupRules.map((rule, groupIdx) => (
                <tr
                  key={`${rule.attendance_type}-${rule.customer_type}-${rule.customer_location}`}
                  className={`border-b border-gray-100 dark:border-gray-700/50 ${
                    groupIdx === 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''
                  }`}
                >
                  <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">
                    {groupIdx === 0 ? (
                      <span className="font-medium">{ATTENDANCE_LABELS[att] || att}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">
                    {CUSTOMER_TYPE_LABELS[rule.customer_type] || rule.customer_type}
                  </td>
                  <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">
                    {LOCATION_LABELS[rule.customer_location] || rule.customer_location}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={rule.charge_vat}
                      onChange={(e) => updateRule(rule._idx, 'charge_vat', e.target.checked)}
                      disabled={!isAdmin}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={rule.vat_rate_source}
                      onChange={(e) => updateRule(rule._idx, 'vat_rate_source', e.target.value)}
                      disabled={!isAdmin}
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded py-1 px-1.5 text-xs dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500"
                    >
                      {RATE_SOURCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={rule.reverse_charge}
                      onChange={(e) => updateRule(rule._idx, 'reverse_charge', e.target.checked)}
                      disabled={!isAdmin}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={rule.oss_applicable}
                      onChange={(e) => updateRule(rule._idx, 'oss_applicable', e.target.checked)}
                      disabled={!isAdmin}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={rule.note}
                      onChange={(e) => updateRule(rule._idx, 'note', e.target.value)}
                      disabled={!isAdmin}
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded py-1 px-1.5 text-xs dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500"
                      placeholder="Description..."
                    />
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Number Format Section ──────────────────────────────────────────

function NumberFormatSection({
  conferenceId,
  isAdmin,
}: {
  conferenceId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState('us_uk');
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  const { data: invoiceSettings, isLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/settings/invoice-settings`);
      return res.data;
    },
  });

  useEffect(() => {
    if (invoiceSettings?.number_format_preset) {
      setSelectedPreset(invoiceSettings.number_format_preset);
    }
  }, [invoiceSettings]);

  const saveMutation = useMutation({
    mutationFn: async (preset: string) => {
      await api.put(`/conferences/${conferenceId}/settings/invoice-settings`, {
        number_format_preset: preset,
      });
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conferenceId) });
    },
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    saveMutation.mutate(preset);
  };

  const currentExample =
    NUMBER_FORMAT_PRESETS.find((p) => p.code === selectedPreset)?.example || '1,234,567.89';

  if (isLoading) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Number Format</h5>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Controls how amounts appear on invoices and in the admin interface.
          </p>
        </div>
        {saveStatus === 'saving' && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <select
          className="block w-64 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          disabled={!isAdmin}
        >
          {NUMBER_FORMAT_PRESETS.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Example: <span className="font-mono font-medium">{currentExample}</span>
        </span>
      </div>
    </div>
  );
}

// ─── EU Countries Section ───────────────────────────────────────────

function EuCountriesSection({ conferenceId, isAdmin }: { conferenceId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [countries, setCountries] = useState<string[]>(DEFAULT_EU_COUNTRIES);
  const [saveTimeout, setSaveTimeoutState] = useState<ReturnType<typeof setTimeout> | null>(null);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  const { data: invoiceSettings, isLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/settings/invoice-settings`);
      return res.data;
    },
  });

  useEffect(() => {
    if (invoiceSettings?.eu_countries) {
      setCountries(invoiceSettings.eu_countries);
    }
  }, [invoiceSettings]);

  const saveMutation = useMutation({
    mutationFn: async (updatedCountries: string[]) => {
      await api.put(`/conferences/${conferenceId}/settings/invoice-settings`, {
        eu_countries: updatedCountries,
      });
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conferenceId) });
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

      if (saveTimeout) clearTimeout(saveTimeout);
      const timeout = setTimeout(() => saveMutation.mutate(updated), 800);
      setSaveTimeoutState(timeout);
    },
    [countries, saveTimeout, saveMutation]
  );

  const resetToDefault = () => {
    setCountries(DEFAULT_EU_COUNTRIES);
    saveMutation.mutate(DEFAULT_EU_COUNTRIES);
  };

  const countrySet = useMemo(() => new Set(countries), [countries]);

  if (isLoading) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            EU Member States
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {countries.length} of {COUNTRY_OPTIONS.length} selected
            </span>
          </h5>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Countries classified as "EU" in the VAT decision table. Adjust if member states change.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
          )}
          {isAdmin && (
            <button
              onClick={resetToDefault}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1">
        {COUNTRY_OPTIONS.map((c) => (
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
  );
}

export default FinancialSettingsTab;
