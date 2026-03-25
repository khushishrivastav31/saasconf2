import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { COUNTRY_OPTIONS } from '../../../../config/countries';

interface StripeSettings {
  publishable_key: string;
  secret_key: string;
  is_enabled: boolean;
  bank_transfer_countries: string[];
}

const DEFAULTS: StripeSettings = {
  publishable_key: '',
  secret_key: '',
  is_enabled: false,
  bank_transfer_countries: [],
};

export default function StripeSetupTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<StripeSettings>({
    queryKey: [...queryKeys.trainingFinance, 'stripe'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/stripe');
      return res.data;
    },
  });

  const [form, setForm] = useState<StripeSettings>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  }, [data]);

  const updateField = <K extends keyof StripeSettings>(key: K, value: StripeSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const toggleCountry = (code: string) => {
    setForm((prev) => {
      const countries = prev.bank_transfer_countries.includes(code)
        ? prev.bank_transfer_countries.filter((c) => c !== code)
        : [...prev.bank_transfer_countries, code].sort();
      return { ...prev, bank_transfer_countries: countries };
    });
    setIsDirty(true);
  };

  const filteredCountries = useMemo(
    () =>
      countrySearch
        ? COUNTRY_OPTIONS.filter(
            (c) =>
              c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
              c.code.toLowerCase().includes(countrySearch.toLowerCase())
          )
        : COUNTRY_OPTIONS,
    [countrySearch]
  );

  const selectedCountrySet = useMemo(
    () => new Set(form.bank_transfer_countries),
    [form.bank_transfer_countries]
  );

  const mutation = useMutation({
    mutationFn: async (payload: StripeSettings) => {
      await api.put('/trainings/finance/stripe', payload);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Stripe settings saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleDiscard = () => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setIsDirty(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500';
  const sectionClass =
    'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6';

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Stripe Setup</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure Stripe payment processing for training invoices.
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

      {/* API Keys */}
      <div className={sectionClass + ' space-y-4'}>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_enabled}
            onChange={(e) => updateField('is_enabled', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Enable Stripe integration
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Accept credit card payments for training invoices.
            </p>
          </div>
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Publishable Key
          </label>
          <input
            type="text"
            value={form.publishable_key}
            onChange={(e) => updateField('publishable_key', e.target.value)}
            placeholder="pk_test_..."
            className={inputClass + ' font-mono'}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Public key starting with pk_test_ or pk_live_
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Secret Key
          </label>
          <div className="relative">
            <input
              type={showSecretKey ? 'text' : 'password'}
              value={form.secret_key}
              onChange={(e) => updateField('secret_key', e.target.value)}
              placeholder="sk_test_..."
              className={inputClass + ' font-mono pr-16'}
            />
            <button
              type="button"
              onClick={() => setShowSecretKey(!showSecretKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
            >
              {showSecretKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Secret key starting with sk_test_ or sk_live_. Stored encrypted.
          </p>
        </div>
      </div>

      {/* Bank Transfer Countries */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Bank Transfer Countries
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select countries where bank transfer is offered alongside credit card.
            </p>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {form.bank_transfer_countries.length} selected
          </span>
        </div>

        <input
          type="text"
          value={countrySearch}
          onChange={(e) => setCountrySearch(e.target.value)}
          placeholder="Search countries..."
          className={inputClass + ' mb-3'}
        />

        <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-0.5 p-3">
            {filteredCountries.map((c) => (
              <label
                key={c.code}
                className="flex items-center gap-1.5 py-1 px-1.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCountrySet.has(c.code)}
                  onChange={() => toggleCountry(c.code)}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="font-mono text-gray-400 dark:text-gray-500">{c.code}</span>
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
