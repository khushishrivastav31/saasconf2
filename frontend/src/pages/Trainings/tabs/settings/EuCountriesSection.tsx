import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { COUNTRY_OPTIONS } from '../../../../config/countries';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { DEFAULT_EU_COUNTRIES, cardClass } from './CurrencyTaxTab';

export default function EuCountriesSection({ initialCountries }: { initialCountries: string[] }) {
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
