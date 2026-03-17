import { useState, useEffect, useContext, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import type { Conference } from '../../../../types';
import { DirtyContext } from '../../DirtyContext';

interface MyCompany {
  name: string;
  address: string | null; // Single field
  city: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
}

export default function InvoiceCompanyDataTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Form state (single address field)
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState(''); // Single field
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [footerText, setFooterText] = useState('');
  const [secondCurrency, setSecondCurrency] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch invoice settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/invoice-settings`);
      return res.data;
    },
  });

  // Fetch My Company data for auto-populate
  const { data: myCompany, isLoading: myCompanyLoading } = useQuery<MyCompany>({
    queryKey: ['my-company'],
    queryFn: async () => {
      const res = await api.get('/my-company');
      return res.data;
    },
  });

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      const info = settings.invoice_company_info || {};
      setCompanyName(info.name || '');
      setAddress(info.address || ''); // Single field
      setCity(info.city || '');
      setPostalCode(info.postal_code || '');
      setCountry(info.country || '');
      setTaxId(info.tax_id || '');
      setPhone(info.phone || '');
      setFooterText(info.footer_text || '');
      setSecondCurrency(info.second_currency || '');
      setExchangeRate(info.exchange_rate ? String(info.exchange_rate) : '');
    }
  }, [settings]);

  // Track dirty state for unsaved changes guard
  const isDirty = useMemo(() => {
    if (!settings) return false;
    const info = settings.invoice_company_info || {};
    return (
      companyName !== (info.name || '') ||
      address !== (info.address || '') ||
      city !== (info.city || '') ||
      postalCode !== (info.postal_code || '') ||
      country !== (info.country || '') ||
      taxId !== (info.tax_id || '') ||
      phone !== (info.phone || '') ||
      footerText !== (info.footer_text || '') ||
      secondCurrency !== (info.second_currency || '') ||
      exchangeRate !== (info.exchange_rate ? String(info.exchange_rate) : '')
    );
  }, [
    settings,
    companyName,
    address,
    city,
    postalCode,
    country,
    taxId,
    phone,
    footerText,
    secondCurrency,
    exchangeRate,
  ]);

  const reportDirty = useContext(DirtyContext);
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  // Auto-populate from My Company (FIXED: single address field)
  const handleAutoPopulate = () => {
    if (!myCompany) return;

    setCompanyName(myCompany.name);
    setAddress(myCompany.address || ''); // Direct field mapping
    setCity(myCompany.city || '');
    setPostalCode(myCompany.postal_code || '');
    setCountry(myCompany.country || '');
    setTaxId(myCompany.vat_number || '');

    showToast('Company information populated from My Company', 'success');
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        invoice_company_info: {
          name: companyName,
          address: address, // Single field
          city: city,
          postal_code: postalCode,
          country: country,
          tax_id: taxId,
          phone: phone,
          footer_text: footerText,
          second_currency: secondCurrency || null,
          exchange_rate: exchangeRate ? parseFloat(exchangeRate) : null,
        },
      };

      const res = await api.put(`/conferences/${conference.id}/settings/invoice-settings`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceSettings(conference.id) });
      showToast('Company data saved successfully', 'success');
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

  if (settingsLoading || myCompanyLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Invoice Company Data
        </h2>
        {isAdmin && (
          <button
            onClick={handleAutoPopulate}
            disabled={!myCompany}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Auto-populate from My Company
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="space-y-4">
        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Company Name
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* Address (single field) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Street Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!isAdmin}
            placeholder="e.g., 123 Main Street, Suite 100"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            City
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* Postal Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Postal Code
          </label>
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Country
          </label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* Tax ID / VAT Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tax ID / VAT Number
          </label>
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone Number
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!isAdmin}
            placeholder="e.g., +49 30 1234567"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* Dual Currency Section */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Optional: Dual Currency Display
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Display invoice totals in a second currency alongside the primary currency.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Second Currency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Second Currency
              </label>
              <input
                type="text"
                value={secondCurrency}
                onChange={(e) => setSecondCurrency(e.target.value.toUpperCase())}
                disabled={!isAdmin}
                placeholder="e.g., USD"
                maxLength={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed uppercase"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                ISO 4217 code (3 letters)
              </p>
            </div>

            {/* Exchange Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Exchange Rate
              </label>
              <input
                type="number"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                disabled={!isAdmin}
                placeholder="e.g., 1.08"
                step="0.0001"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Rate from primary to second currency
              </p>
            </div>
          </div>
        </div>

        {/* Footer Text */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Invoice Footer Text
          </label>
          <textarea
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            disabled={!isAdmin}
            rows={3}
            placeholder="Additional text shown at the bottom of invoices"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
        </div>

        {/* Save Button */}
        {isAdmin && (
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
    </div>
  );
}
