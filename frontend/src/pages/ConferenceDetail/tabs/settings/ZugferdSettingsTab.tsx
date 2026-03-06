import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useSaveStatus } from '../../../../hooks/useSaveStatus';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type { Conference } from '../../../../types';

interface ZugferdSettingsTabProps {
  conference: Conference;
  isAdmin: boolean;
}

/**
 * ZUGFeRD/Factur-X E-Invoicing Settings
 *
 * All ZUGFeRD parameters are AUTO-DETERMINED from invoice/conference data:
 * - Profile: Always EN16931 (EU standard)
 * - Seller VAT ID: From company settings or fiscal representative
 * - Contact email/phone: From conference email/phone
 * - Payment terms: Always 30 days net
 * - Payment means: Auto-determined from invoice template_type
 * - Tax category: Auto-determined from VAT decision table
 * - Invoice type: Auto-determined from template_type (380=invoice, 381=credit note)
 */
export default function ZugferdSettingsTab({ conference, isAdmin }: ZugferdSettingsTabProps) {
  const queryClient = useQueryClient();
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const { showToast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.invoiceSettings(conference.id),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conference.id}/settings/invoice`);
      return res.data;
    },
  });

  const [enabled, setEnabled] = useState(false);

  // Sync form data when settings load
  useEffect(() => {
    if (settings?.zugferd_settings) {
      setEnabled(settings.zugferd_settings.enabled || false);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (enabledValue: boolean) => {
      const res = await api.put(`/conferences/${conference.id}/settings/invoice`, {
        zugferd_settings: { enabled: enabledValue },
      });
      return res.data;
    },
    onMutate: () => {
      setSaving();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.invoiceSettings(conference.id), data);
      setSaved();
    },
    onError: (error: unknown) => {
      const errorMsg = parseApiError(error);
      setError();
      showToast(errorMsg, 'error');
    },
  });

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    updateMutation.mutate(checked);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading ZUGFeRD settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            ZUGFeRD/Factur-X E-Invoicing
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure hybrid e-invoicing with embedded XML for EU compliance (mandatory in Germany
            2025-2028)
          </p>
        </div>
        {saveStatus && <div className="text-sm text-gray-600 dark:text-gray-400">{saveStatus}</div>}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-start gap-4">
          <div className="flex items-center h-6">
            <input
              type="checkbox"
              id="zugferd-enabled"
              checked={enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              disabled={!isAdmin}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
            />
          </div>
          <div className="flex-1">
            <label
              htmlFor="zugferd-enabled"
              className="block text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              Enable ZUGFeRD/Factur-X
            </label>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              When enabled, invoices will include embedded XML data for automated processing by
              customer accounting systems (DATEV, Lexware, sevDesk, etc.). All settings are
              automatically determined from your invoice and conference data.
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex gap-3">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                Auto-Determined Settings
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-3">
                All ZUGFeRD parameters are automatically calculated from your existing data:
              </p>
              <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1.5 list-disc list-inside">
                <li>
                  <strong>Profile:</strong> EN16931 (EU standard for compliance)
                </li>
                <li>
                  <strong>Seller VAT ID:</strong> From company settings or fiscal representative
                </li>
                <li>
                  <strong>Contact Info:</strong> From conference email/phone
                </li>
                <li>
                  <strong>Payment Terms:</strong> Net 30 days
                </li>
                <li>
                  <strong>Payment Means:</strong> Credit transfer (bank) or payment card
                </li>
                <li>
                  <strong>Tax Category:</strong> Based on VAT decision table (reverse charge,
                  standard rate, exempt, etc.)
                </li>
                <li>
                  <strong>Invoice Type:</strong> Commercial invoice (380) or credit note (381)
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Requirements Box */}
        <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex gap-3">
            <svg
              className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                Data Requirements
              </h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-3">
                For ZUGFeRD to work, invoices must have the following data:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm text-yellow-800 dark:text-yellow-300">
                <div>
                  <strong>Seller (Company):</strong>
                  <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                    <li>Company name</li>
                    <li>VAT ID (tax_id or fiscal rep)</li>
                    <li>Country (ISO code, e.g., DE)</li>
                    <li>Address, city, postal code</li>
                  </ul>
                </div>
                <div>
                  <strong>Buyer (Customer):</strong>
                  <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                    <li>Recipient name</li>
                    <li>Country (ISO code required)</li>
                    <li>Address, city (recommended)</li>
                    <li>VAT ID (for B2B invoices)</li>
                  </ul>
                </div>
                <div className="md:col-span-2">
                  <strong>Invoice:</strong>
                  <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                    <li>Invoice number, issue date, due date</li>
                    <li>Currency code (e.g., EUR, USD)</li>
                    <li>Line items with descriptions, quantities, prices</li>
                    <li>Tax rate and tax amount</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
