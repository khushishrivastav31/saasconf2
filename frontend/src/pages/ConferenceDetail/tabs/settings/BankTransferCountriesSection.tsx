import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { parseApiError } from '../../../../utils/apiError';
import { COUNTRIES_BY_CONTINENT, BANK_TRANSFER_COUNTRY_CODES } from '../../../../config/countries';

const DEFAULT_BANK_TRANSFER = Array.from(BANK_TRANSFER_COUNTRY_CODES).sort();

export default function BankTransferCountriesSection({
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
