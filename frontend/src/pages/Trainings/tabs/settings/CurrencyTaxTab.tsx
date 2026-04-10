import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { COUNTRY_OPTIONS } from '../../../../config/countries';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';

// ─── Types ──────────────────────────────────────────────────────────

interface VatRule {
  attendance_type: string;
  customer_type: string;
  customer_location: string;
  charge_vat: boolean;
  vat_rate_source: string;
  reverse_charge: boolean;
  oss: boolean;
  note: string;
}

interface CurrencyTaxSettings {
  currency: string;
  invoice_currency: string;
  invoice_exchange_rate: number | null;
  number_format_preset: string;
  decimal_separator: string;
  thousands_separator: string;
  currency_position: string;
  vat_rules: VatRule[];
  eu_countries: string[];
  vat_rates: Record<string, number>;
}

interface PlatformCurrency {
  code: string;
  name: string;
  symbol: string;
}

// ─── Constants ──────────────────────────────────────────────────────

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

const ATTENDANCE_OPTIONS = [
  { value: 'in_person', label: 'In-Person' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'hybrid_onsite', label: 'Hybrid (On-Site)' },
  { value: 'hybrid_online', label: 'Hybrid (Online)' },
];

const CUSTOMER_TYPE_OPTIONS = [
  { value: 'b2b', label: 'B2B' },
  { value: 'b2c', label: 'B2C' },
];

const LOCATION_OPTIONS = [
  { value: 'domestic', label: 'Domestic' },
  { value: 'eu', label: 'EU' },
  { value: 'non_eu', label: 'Non-EU' },
];

const RATE_SOURCE_OPTIONS = [
  { value: 'training_country', label: 'Training country' },
  { value: 'customer_country', label: "Customer's country" },
  { value: 'none', label: 'None' },
];

const EMPTY_RULE: VatRule = {
  attendance_type: 'in_person',
  customer_type: 'b2b',
  customer_location: 'domestic',
  charge_vat: true,
  vat_rate_source: 'training_country',
  reverse_charge: false,
  oss: false,
  note: '',
};

const DEFAULTS: CurrencyTaxSettings = {
  currency: 'EUR',
  invoice_currency: '',
  invoice_exchange_rate: null,
  number_format_preset: 'us_uk',
  decimal_separator: '.',
  thousands_separator: ',',
  currency_position: 'before',
  vat_rules: [],
  eu_countries: [...DEFAULT_EU_COUNTRIES],
  vat_rates: {},
};

// ─── Shared styles ──────────────────────────────────────────────────

const cardClass =
  'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4';
const selectClass =
  'mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100';
const smallSelectClass =
  'block w-full border border-gray-300 dark:border-gray-600 rounded py-1 px-1.5 text-xs dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500';
const smallInputClass =
  'block w-full border border-gray-300 dark:border-gray-600 rounded py-1 px-1.5 text-xs dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500';

// ─── Main Component ─────────────────────────────────────────────────

export default function CurrencyTaxTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // ── Main data query ──
  const { data, isLoading } = useQuery<CurrencyTaxSettings>({
    queryKey: [...queryKeys.trainingFinance, 'currency-tax'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/currency-tax');
      return res.data;
    },
  });

  // ── Platform currencies ──
  const { data: currenciesData } = useQuery<{ items: PlatformCurrency[] }>({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const res = await api.get('/admin/settings/currencies', {
        params: { page_size: 100, is_active: true },
      });
      return res.data;
    },
  });

  const currencies = useMemo(() => currenciesData?.items || [], [currenciesData]);

  // ── Company data for tax rate display ──
  const { data: companyData } = useQuery<{ company_info: { country: string } }>({
    queryKey: [...queryKeys.trainingFinance, 'company-data'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/company-data');
      return res.data;
    },
  });

  // ── Form state (currency + exchange rate + vat_rates + vat_rules) ──
  const [form, setForm] = useState<CurrencyTaxSettings>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  }, [data]);

  const updateField = useCallback(
    <K extends keyof CurrencyTaxSettings>(key: K, value: CurrencyTaxSettings[K]) => {
      setForm((prev) => {
        const newForm = { ...prev, [key]: value };
        // Clear exchange rate when invoice currency is cleared
        if (key === 'invoice_currency' && !value) {
          newForm.invoice_exchange_rate = null;
        }
        return newForm;
      });
      setIsDirty(true);
    },
    []
  );

  // ── VAT rates table helpers ──
  const vatRateEntries = useMemo(
    () =>
      Object.entries(form.vat_rates).map(([code, rate]) => ({
        code,
        rate,
      })),
    [form.vat_rates]
  );

  const updateVatRate = useCallback((index: number, field: 'code' | 'rate', value: string) => {
    setForm((prev) => {
      const entries = Object.entries(prev.vat_rates);
      if (field === 'code') {
        const [, rate] = entries[index];
        entries[index] = [value, rate];
      } else {
        const [code] = entries[index];
        entries[index] = [code, parseFloat(value) || 0];
      }
      return { ...prev, vat_rates: Object.fromEntries(entries) };
    });
    setIsDirty(true);
  }, []);

  const addVatRate = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      vat_rates: { ...prev.vat_rates, '': 0 },
    }));
    setIsDirty(true);
  }, []);

  const removeVatRate = useCallback((code: string) => {
    setForm((prev) => {
      const newRates = { ...prev.vat_rates };
      delete newRates[code];
      return { ...prev, vat_rates: newRates };
    });
    setIsDirty(true);
  }, []);

  // ── VAT rules helpers ──
  const updateRule = useCallback((index: number, field: keyof VatRule, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      vat_rules: prev.vat_rules.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }));
    setIsDirty(true);
  }, []);

  const addRule = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      vat_rules: [...prev.vat_rules, { ...EMPTY_RULE }],
    }));
    setIsDirty(true);
  }, []);

  const removeRule = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      vat_rules: prev.vat_rules.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  }, []);

  // ── Main save mutation ──
  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<CurrencyTaxSettings>) => {
      await api.put('/trainings/finance/currency-tax', payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Currency & tax settings saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      currency: form.currency,
      invoice_currency: form.invoice_currency,
      invoice_exchange_rate: form.invoice_exchange_rate,
      vat_rates: form.vat_rates,
      vat_rules: form.vat_rules,
    });
  }, [form, saveMutation]);

  const handleDiscard = useCallback(() => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  }, [data]);

  // ── Derived values ──
  const showExchangeRate = form.invoice_currency && form.invoice_currency !== form.currency;

  const companyCountry = companyData?.company_info?.country || '';
  const companyCountryName = useMemo(
    () => COUNTRY_OPTIONS.find((c) => c.code === companyCountry)?.name || companyCountry,
    [companyCountry]
  );
  const currentTaxRate = companyCountry ? form.vat_rates[companyCountry] : undefined;

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header with Save/Discard */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Currency &amp; Tax
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure currencies, tax rates, and VAT rules for training invoicing. These settings
            apply to all trainings.
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
            disabled={!isDirty || saveMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Section 1: Currency */}
      <div className={cardClass}>
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Currencies</h5>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Primary Currency
            </label>
            <select
              value={form.currency}
              onChange={(e) => updateField('currency', e.target.value)}
              className={selectClass}
            >
              <option value="">Select currency...</option>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} &mdash; {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Used for all pricing in this training.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Second Currency
              <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <select
              value={form.invoice_currency}
              onChange={(e) => updateField('invoice_currency', e.target.value)}
              className={selectClass}
            >
              <option value="">Same as primary</option>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} &mdash; {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Alternative currency for invoices.
            </p>
          </div>
        </div>
        {showExchangeRate && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Exchange Rate
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                step="0.0001"
                min={0}
                value={form.invoice_exchange_rate ?? ''}
                onChange={(e) =>
                  updateField(
                    'invoice_exchange_rate',
                    e.target.value ? parseFloat(e.target.value) : null
                  )
                }
                placeholder="e.g. 1.08"
                className="block w-48 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                1 {form.currency || 'EUR'} = {form.invoice_exchange_rate || '?'}{' '}
                {form.invoice_currency}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Number Format (auto-save) */}
      <NumberFormatSection currentPreset={data?.number_format_preset || 'us_uk'} />

      {/* Section 3: Training Tax/VAT Rate */}
      <div className={cardClass}>
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Training Tax/VAT Rate
        </h5>

        {/* Current rate info box */}
        {companyCountry && currentTaxRate !== undefined && (
          <div className="mb-4 p-3 rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-800 dark:text-green-200">
              Current tax rate for <span className="font-medium">{companyCountryName}</span>:{' '}
              <span className="font-semibold">{currentTaxRate}%</span>
            </p>
          </div>
        )}
        {companyCountry && currentTaxRate === undefined && (
          <div className="mb-4 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              No tax rate configured for <span className="font-medium">{companyCountryName}</span> (
              {companyCountry}). Add it in the table below.
            </p>
          </div>
        )}

        {/* VAT rates table */}
        <div className="flex items-center justify-between mb-2">
          <h6 className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
            Country VAT/Tax Rates
          </h6>
          <button
            onClick={addVatRate}
            className="px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            + Add Row
          </button>
        </div>
        {vatRateEntries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No VAT rates configured. Add a row to define country-specific tax rates.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                    Country
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-300">
                    Rate (%)
                  </th>
                  <th className="py-2 px-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {vatRateEntries.map((entry, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-1.5 px-2">
                      <select
                        value={entry.code}
                        onChange={(e) => updateVatRate(index, 'code', e.target.value)}
                        className={smallSelectClass}
                      >
                        <option value="">Select country...</option>
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={entry.rate}
                        onChange={(e) => updateVatRate(index, 'rate', e.target.value)}
                        className={smallInputClass + ' w-24'}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <button
                        onClick={() => removeVatRate(entry.code)}
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        title="Remove"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 4: EU Member States (debounced auto-save) */}
      <EuCountriesSection initialCountries={data?.eu_countries || DEFAULT_EU_COUNTRIES} />

      {/* Section 5: VAT Decision Table */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              VAT Decision Table
            </h5>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Rules for determining VAT treatment based on attendance type, customer type, and
              location.
            </p>
          </div>
          <button
            onClick={addRule}
            className="px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            + Add Rule
          </button>
        </div>

        {form.vat_rules.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No VAT rules configured. Add a rule to define tax behavior.
          </p>
        ) : (
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
                  <th className="py-2 px-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {form.vat_rules.map((rule, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-1.5 px-2">
                      <select
                        value={rule.attendance_type}
                        onChange={(e) => updateRule(index, 'attendance_type', e.target.value)}
                        className={smallSelectClass}
                      >
                        {ATTENDANCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <select
                        value={rule.customer_type}
                        onChange={(e) => updateRule(index, 'customer_type', e.target.value)}
                        className={smallSelectClass}
                      >
                        {CUSTOMER_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <select
                        value={rule.customer_location}
                        onChange={(e) => updateRule(index, 'customer_location', e.target.value)}
                        className={smallSelectClass}
                      >
                        {LOCATION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={rule.charge_vat}
                        onChange={(e) => updateRule(index, 'charge_vat', e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <select
                        value={rule.vat_rate_source}
                        onChange={(e) => updateRule(index, 'vat_rate_source', e.target.value)}
                        className={smallSelectClass}
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
                        onChange={(e) => updateRule(index, 'reverse_charge', e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={rule.oss}
                        onChange={(e) => updateRule(index, 'oss', e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        value={rule.note}
                        onChange={(e) => updateRule(index, 'note', e.target.value)}
                        className={smallInputClass}
                        placeholder="Description..."
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <button
                        onClick={() => removeRule(index)}
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        title="Remove"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Number Format Section (auto-save on change) ─────────────────────

function NumberFormatSection({ currentPreset }: { currentPreset: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState(currentPreset);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  useEffect(() => {
    setSelectedPreset(currentPreset);
  }, [currentPreset]);

  const saveMutation = useMutation({
    mutationFn: async (preset: string) => {
      await api.put('/trainings/finance/currency-tax', {
        number_format_preset: preset,
      });
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
    },
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  const handlePresetChange = useCallback(
    (preset: string) => {
      setSelectedPreset(preset);
      saveMutation.mutate(preset);
    },
    [saveMutation]
  );

  const currentExample =
    NUMBER_FORMAT_PRESETS.find((p) => p.code === selectedPreset)?.example || '1,234,567.89';

  return (
    <div className={cardClass}>
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

// ─── EU Countries Section (debounced auto-save, 800ms) ──────────────

function EuCountriesSection({ initialCountries }: { initialCountries: string[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [countries, setCountries] = useState<string[]>(initialCountries);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  // Sync when server data changes
  useEffect(() => {
    setCountries(initialCountries);
  }, [initialCountries]);

  const saveMutation = useMutation({
    mutationFn: async (updatedCountries: string[]) => {
      await api.put('/trainings/finance/currency-tax', {
        eu_countries: updatedCountries,
      });
    },
    onMutate: () => setSaving(),
    onSuccess: () => {
      setSaved();
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
    },
    onError: (err) => {
      setSaveError();
      showToast(parseApiError(err), 'error');
    },
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

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

  const resetToDefault = useCallback(() => {
    setCountries([...DEFAULT_EU_COUNTRIES]);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveMutation.mutate([...DEFAULT_EU_COUNTRIES]);
  }, [saveMutation]);

  const countrySet = useMemo(() => new Set(countries), [countries]);

  // Display ALL countries sorted by code (like conferences)
  const allCountryOptions = useMemo(
    () => [...COUNTRY_OPTIONS].sort((a, b) => a.code.localeCompare(b.code)),
    []
  );

  return (
    <div className={cardClass}>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            EU Member States
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {countries.length} of {allCountryOptions.length} selected
            </span>
          </h5>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Countries classified as &quot;EU&quot; in the VAT decision table. Adjust if member
            states change.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
          )}
          <button
            onClick={resetToDefault}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            Reset to Default
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {allCountryOptions.map((c) => (
          <label
            key={c.code}
            className="flex items-center gap-1.5 py-1 px-1.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={countrySet.has(c.code)}
              onChange={() => toggleCountry(c.code)}
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
