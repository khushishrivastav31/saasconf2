import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';

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
  number_format: string;
  vat_rules: VatRule[];
  eu_countries: string[];
}

interface PlatformCurrency {
  code: string;
  name: string;
  symbol: string;
}

const NUMBER_FORMAT_PRESETS = [
  { value: 'us', label: 'US/UK', example: '1,234.56' },
  { value: 'eu', label: 'European', example: '1.234,56' },
  { value: 'ch', label: 'Swiss', example: "1'234.56" },
  { value: 'fr', label: 'French', example: '1 234,56' },
  { value: 'in', label: 'Indian', example: '1,23,456.78' },
  { value: 'none', label: 'No separator', example: '1234.56' },
];

const EMPTY_RULE: VatRule = {
  attendance_type: '',
  customer_type: '',
  customer_location: '',
  charge_vat: true,
  vat_rate_source: '',
  reverse_charge: false,
  oss: false,
  note: '',
};

const DEFAULTS: CurrencyTaxSettings = {
  currency: 'EUR',
  invoice_currency: 'EUR',
  invoice_exchange_rate: null,
  number_format: 'eu',
  vat_rules: [],
  eu_countries: [],
};

export default function CurrencyTaxTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<CurrencyTaxSettings>({
    queryKey: [...queryKeys.trainingFinance, 'currency-tax'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/currency-tax');
      return res.data;
    },
  });

  const { data: currenciesData } = useQuery<{ items: PlatformCurrency[] }>({
    queryKey: queryKeys.settings.platformCurrencies,
    queryFn: async () => {
      const res = await api.get('/admin/settings/currencies');
      return res.data;
    },
  });

  const currencies = useMemo(() => currenciesData?.items || [], [currenciesData]);

  const [form, setForm] = useState<CurrencyTaxSettings>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  }, [data]);

  const updateField = <K extends keyof CurrencyTaxSettings>(
    key: K,
    value: CurrencyTaxSettings[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const updateRule = (index: number, key: keyof VatRule, value: string | boolean) => {
    setForm((prev) => {
      const rules = [...prev.vat_rules];
      rules[index] = { ...rules[index], [key]: value };
      return { ...prev, vat_rules: rules };
    });
    setIsDirty(true);
  };

  const addRule = () => {
    setForm((prev) => ({
      ...prev,
      vat_rules: [...prev.vat_rules, { ...EMPTY_RULE }],
    }));
    setIsDirty(true);
  };

  const removeRule = (index: number) => {
    setForm((prev) => ({
      ...prev,
      vat_rules: prev.vat_rules.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  };

  const mutation = useMutation({
    mutationFn: async (payload: CurrencyTaxSettings) => {
      await api.put('/trainings/finance/currency-tax', payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Currency & tax settings saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleDiscard = () => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  };

  const showExchangeRate = form.currency !== form.invoice_currency;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-primary-500 focus:border-primary-500';
  const sectionClass =
    'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6';
  const thClass =
    'px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider';
  const tdClass = 'px-3 py-2';
  const smallInputClass =
    'w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-primary-500';

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Currency &amp; Tax
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure currencies, number formatting, and VAT rules for training invoices.
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
            onClick={() => mutation.mutate(form)}
            disabled={!isDirty || mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Currency Settings */}
      <div className={sectionClass}>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Currency</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Training Currency
            </label>
            <select
              value={form.currency}
              onChange={(e) => updateField('currency', e.target.value)}
              className={inputClass}
            >
              <option value="">Select currency</option>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Invoice Currency
            </label>
            <select
              value={form.invoice_currency}
              onChange={(e) => updateField('invoice_currency', e.target.value)}
              className={inputClass}
            >
              <option value="">Select currency</option>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>
        {showExchangeRate && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Exchange Rate ({form.currency} to {form.invoice_currency})
            </label>
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
              placeholder="e.g., 1.08"
              className="w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        )}
      </div>

      {/* Number Format */}
      <div className={sectionClass}>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Number Format
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {NUMBER_FORMAT_PRESETS.map((preset) => (
            <label
              key={preset.value}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                form.number_format === preset.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <input
                type="radio"
                name="number_format"
                value={preset.value}
                checked={form.number_format === preset.value}
                onChange={(e) => updateField('number_format', e.target.value)}
                className="text-primary-600 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {preset.label}
                </span>
                <span className="block text-xs font-mono text-gray-500 dark:text-gray-400">
                  {preset.example}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* VAT Rules */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">VAT Rules</h4>
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
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className={thClass}>Attendance Type</th>
                  <th className={thClass}>Customer Type</th>
                  <th className={thClass}>Customer Location</th>
                  <th className={thClass}>Charge VAT</th>
                  <th className={thClass}>VAT Rate Source</th>
                  <th className={thClass}>Rev. Charge</th>
                  <th className={thClass}>OSS</th>
                  <th className={thClass}>Note</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {form.vat_rules.map((rule, index) => (
                  <tr key={index}>
                    <td className={tdClass}>
                      <input
                        type="text"
                        value={rule.attendance_type}
                        onChange={(e) => updateRule(index, 'attendance_type', e.target.value)}
                        placeholder="e.g., in-person"
                        className={smallInputClass}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="text"
                        value={rule.customer_type}
                        onChange={(e) => updateRule(index, 'customer_type', e.target.value)}
                        placeholder="e.g., B2B"
                        className={smallInputClass}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="text"
                        value={rule.customer_location}
                        onChange={(e) => updateRule(index, 'customer_location', e.target.value)}
                        placeholder="e.g., EU"
                        className={smallInputClass}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        checked={rule.charge_vat}
                        onChange={(e) => updateRule(index, 'charge_vat', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="text"
                        value={rule.vat_rate_source}
                        onChange={(e) => updateRule(index, 'vat_rate_source', e.target.value)}
                        placeholder="e.g., seller"
                        className={smallInputClass}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        checked={rule.reverse_charge}
                        onChange={(e) => updateRule(index, 'reverse_charge', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        checked={rule.oss}
                        onChange={(e) => updateRule(index, 'oss', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="text"
                        value={rule.note}
                        onChange={(e) => updateRule(index, 'note', e.target.value)}
                        className={smallInputClass}
                      />
                    </td>
                    <td className={tdClass}>
                      <button
                        onClick={() => removeRule(index)}
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs"
                      >
                        Remove
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
