import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  const [formData, setFormData] = useState({
    currency: conference.currency || '',
    invoice_currency: conference.invoice_currency || '',
    exchange_rate: conference.settings?.invoice_exchange_rate
      ? String(conference.settings.invoice_exchange_rate)
      : '',
  });

  // Track previous conference values to sync formData when server data changes
  const prevConferenceRef = useRef({
    currency: conference.currency,
    invoice_currency: conference.invoice_currency,
    exchange_rate: conference.settings?.invoice_exchange_rate,
  });

  // Sync formData with conference prop when conference data changes from server
  useEffect(() => {
    const prev = prevConferenceRef.current;
    const curr = {
      currency: conference.currency,
      invoice_currency: conference.invoice_currency,
      exchange_rate: conference.settings?.invoice_exchange_rate,
    };

    // Only update if conference values actually changed
    if (
      prev.currency !== curr.currency ||
      prev.invoice_currency !== curr.invoice_currency ||
      prev.exchange_rate !== curr.exchange_rate
    ) {
      setFormData({
        currency: curr.currency || '',
        invoice_currency: curr.invoice_currency || '',
        exchange_rate: curr.exchange_rate ? String(curr.exchange_rate) : '',
      });
      prevConferenceRef.current = curr;
    }
  }, [
    conference.currency,
    conference.invoice_currency,
    conference.settings?.invoice_exchange_rate,
  ]);

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

  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();
  const [debounceTimeout, setDebounceTimeout] = useState<ReturnType<typeof setTimeout> | null>(
    null
  );

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const exchangeVal = data.exchange_rate ? parseFloat(data.exchange_rate) : null;
      const payload: ConferenceUpdate = {
        currency: data.currency || undefined,
        invoice_currency: data.invoice_currency || null, // Send null to clear field
        settings: {
          ...(conference.settings || {}),
          invoice_exchange_rate: exchangeVal,
        },
      };
      const response = await api.put(`/conferences/${conference.id}`, payload);
      return response.data;
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conferences.detail(conference.id) });
      setSaved();
    },
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const handleFieldChange = (
    field: 'currency' | 'invoice_currency' | 'exchange_rate',
    value: string
  ) => {
    let newFormData = { ...formData, [field]: value };
    // Clear exchange rate when second currency is removed
    if (field === 'invoice_currency' && !value) {
      newFormData = { ...newFormData, exchange_rate: '' };
    }
    setFormData(newFormData);

    if (debounceTimeout) clearTimeout(debounceTimeout);

    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setDebounceTimeout(timeout);
  };

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
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Save failed
              </span>
            )}
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
        <VatRulesTable conferenceId={conference.id} isAdmin={isAdmin} />

        {/* EU Member States */}
        <EuCountriesSection conferenceId={conference.id} isAdmin={isAdmin} />

        {/* Number Format */}
        <NumberFormatSection conferenceId={conference.id} isAdmin={isAdmin} />

        {/* ZUGFeRD/Factur-X E-Invoicing */}
        <ZugferdSection conferenceId={conference.id} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

// ─── VAT Rules Table ─────────────────────────────────────────────────

function VatRulesTable({ conferenceId, isAdmin }: { conferenceId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [rules, setRules] = useState<VatRule[]>([]);
  const [vatSaveTimeout, setVatSaveTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const {
    saveStatus: vatSaveStatus,
    setSaving: setVatSaving,
    setSaved: setVatSaved,
    setError: setVatSaveError,
  } = useSaveStatus();

  const { data: invoiceSettings, isLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/settings/invoice-settings`);
      return res.data;
    },
  });

  useEffect(() => {
    if (invoiceSettings?.vat_rules) {
      setRules(invoiceSettings.vat_rules);
    }
  }, [invoiceSettings]);

  const saveMutation = useMutation({
    mutationFn: async (updatedRules: VatRule[]) => {
      await api.put(`/conferences/${conferenceId}/settings/invoice-settings`, {
        vat_rules: updatedRules,
      });
    },
    onMutate: () => setVatSaving(),
    onSuccess: () => {
      setVatSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conferenceId) });
    },
    onError: (err) => {
      setVatSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const updateRule = useCallback(
    (index: number, field: keyof VatRule, value: string | boolean) => {
      const updated = rules.map((r, i) => (i === index ? { ...r, [field]: value } : r));
      setRules(updated);

      if (vatSaveTimeout) clearTimeout(vatSaveTimeout);
      const timeout = setTimeout(() => saveMutation.mutate(updated), 800);
      setVatSaveTimeout(timeout);
    },
    [rules, vatSaveTimeout, saveMutation]
  );

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400 text-sm">Loading VAT rules...</div>;
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
        {vatSaveStatus === 'saving' && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
        )}
        {vatSaveStatus === 'saved' && (
          <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
                Attendance
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
                Customer
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
                Location
              </th>
              <th className="text-center py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
                Charge VAT
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
                VAT Rate From
              </th>
              <th className="text-center py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
                Reverse Charge
              </th>
              <th className="text-center py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
                OSS
              </th>
              <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
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

// ─── ZUGFeRD/Factur-X Section ───────────────────────────────────────

function ZugferdSection({ conferenceId, isAdmin }: { conferenceId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  const { data: invoiceSettings, isLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/settings/invoice-settings`);
      return res.data;
    },
  });

  const [formData, setFormData] = useState({
    enabled: false,
    profile: 'EN16931',
    seller_vat_id: '',
    seller_contact_email: '',
    seller_contact_phone: '',
    payment_terms_code: '30',
    payment_means_code: '30',
    tax_category_code: 'S',
    invoice_type_code: '380',
  });

  useEffect(() => {
    if (invoiceSettings?.zugferd_settings) {
      setFormData({
        enabled: invoiceSettings.zugferd_settings.enabled || false,
        profile: invoiceSettings.zugferd_settings.profile || 'EN16931',
        seller_vat_id: invoiceSettings.zugferd_settings.seller_vat_id || '',
        seller_contact_email: invoiceSettings.zugferd_settings.seller_contact_email || '',
        seller_contact_phone: invoiceSettings.zugferd_settings.seller_contact_phone || '',
        payment_terms_code: invoiceSettings.zugferd_settings.payment_terms_code || '30',
        payment_means_code: invoiceSettings.zugferd_settings.payment_means_code || '30',
        tax_category_code: invoiceSettings.zugferd_settings.tax_category_code || 'S',
        invoice_type_code: invoiceSettings.zugferd_settings.invoice_type_code || '380',
      });
    }
  }, [invoiceSettings]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await api.put(`/conferences/${conferenceId}/settings/invoice-settings`, {
        zugferd_settings: data,
      });
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conferenceId) });
      showToast('ZUGFeRD settings saved successfully', 'success');
    },
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            ZUGFeRD/Factur-X E-Invoicing
          </h5>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Embed machine-readable XML in invoice PDFs for German/French B2B compliance (mandatory
            2025-2028)
          </p>
        </div>
        {saveStatus === 'saving' && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Enable Toggle */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            disabled={!isAdmin}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Enable ZUGFeRD</span>
        </label>

        {formData.enabled && (
          <>
            {/* Profile */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Profile
              </label>
              <select
                value={formData.profile}
                onChange={(e) => handleChange('profile', e.target.value)}
                disabled={!isAdmin}
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="MINIMUM">MINIMUM - Basic invoice data</option>
                <option value="BASIC_WL">BASIC_WL - With line items</option>
                <option value="BASIC">BASIC - Standard invoice</option>
                <option value="EN16931">EN16931 - EU standard (recommended)</option>
                <option value="EXTENDED">EXTENDED - Full data set</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                EN16931 (COMFORT) recommended for EU compliance and public sector contracts
              </p>
            </div>

            {/* Seller VAT ID */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Seller VAT ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.seller_vat_id}
                onChange={(e) => handleChange('seller_vat_id', e.target.value)}
                disabled={!isAdmin}
                placeholder="e.g., DE123456789"
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Required when ZUGFeRD is enabled (e.g., DE123456789, FR12345678901)
              </p>
            </div>

            {/* Optional Contact Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.seller_contact_email}
                  onChange={(e) => handleChange('seller_contact_email', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="billing@company.com"
                  className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.seller_contact_phone}
                  onChange={(e) => handleChange('seller_contact_phone', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="+49 30 12345678"
                  className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Advanced Settings (collapsible) */}
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-700 dark:text-gray-300 font-medium">
                Advanced Settings
              </summary>
              <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Payment Terms Code
                    </label>
                    <input
                      type="text"
                      value={formData.payment_terms_code}
                      onChange={(e) => handleChange('payment_terms_code', e.target.value)}
                      disabled={!isAdmin}
                      placeholder="30"
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Net payment days (default: 30)
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Payment Means Code
                    </label>
                    <select
                      value={formData.payment_means_code}
                      onChange={(e) => handleChange('payment_means_code', e.target.value)}
                      disabled={!isAdmin}
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="1">1 - Cash</option>
                      <option value="30">30 - Credit transfer</option>
                      <option value="48">48 - Card</option>
                      <option value="49">49 - Direct debit</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tax Category Code
                    </label>
                    <select
                      value={formData.tax_category_code}
                      onChange={(e) => handleChange('tax_category_code', e.target.value)}
                      disabled={!isAdmin}
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="S">S - Standard rate</option>
                      <option value="Z">Z - Zero rated</option>
                      <option value="E">E - Exempt</option>
                      <option value="AE">AE - Reverse charge</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Invoice Type Code
                    </label>
                    <select
                      value={formData.invoice_type_code}
                      onChange={(e) => handleChange('invoice_type_code', e.target.value)}
                      disabled={!isAdmin}
                      className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="380">380 - Commercial invoice</option>
                      <option value="381">381 - Credit note</option>
                      <option value="384">384 - Corrected invoice</option>
                    </select>
                  </div>
                </div>
              </div>
            </details>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={!isAdmin || saveMutation.isPending}
              className="mt-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save ZUGFeRD Settings'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default FinancialSettingsTab;
