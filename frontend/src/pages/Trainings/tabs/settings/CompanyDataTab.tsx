import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import { COUNTRY_OPTIONS } from '../../../../config/countries';
import VatNumberInput from '../../../../components/common/VatNumberInput';

interface CompanyInfo {
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  country: string;
  vat_number: string;
  tax_id: string;
  phone: string;
  email: string;
  footer_text: string;
}

interface CompanyDataResponse {
  company_info: CompanyInfo;
}

const EMPTY: CompanyInfo = {
  name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  postal_code: '',
  country: '',
  vat_number: '',
  tax_id: '',
  phone: '',
  email: '',
  footer_text: '',
};

export default function CompanyDataTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery<CompanyDataResponse>({
    queryKey: [...queryKeys.trainingFinance, 'company-data'],
    queryFn: async () => {
      const res = await api.get('/trainings/finance/company-data');
      return res.data;
    },
  });

  const { data: myCompany } = useQuery<{
    name: string;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    vat_number: string | null;
    email: string | null;
    phone: string | null;
  }>({
    queryKey: queryKeys.myCompany,
    queryFn: async () => {
      const res = await api.get('/my-company');
      return res.data;
    },
  });

  const [form, setForm] = useState<CompanyInfo>(EMPTY);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ ...EMPTY, ...data.company_info });
      setIsDirty(false);
    }
  }, [data]);

  const update = (key: keyof CompanyInfo, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const mutation = useMutation({
    mutationFn: async (payload: CompanyInfo) => {
      await api.put('/trainings/finance/company-data', { company_info: payload });
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingFinance });
      showToast('Company data saved', 'success');
    },
    onError: (err: unknown) => showToast(parseApiError(err), 'error'),
  });

  const handleAutoPopulate = () => {
    if (!myCompany) return;
    setForm((prev) => ({
      ...prev,
      name: myCompany.name || prev.name,
      address_line1: myCompany.address || prev.address_line1,
      city: myCompany.city || prev.city,
      postal_code: myCompany.postal_code || prev.postal_code,
      country: myCompany.country || prev.country,
      vat_number: myCompany.vat_number || prev.vat_number,
      email: myCompany.email || prev.email,
      phone: myCompany.phone || prev.phone,
    }));
    setIsDirty(true);
    showToast('Company info populated from My Company', 'success');
  };

  const handleDiscard = () => {
    if (data) {
      setForm({ ...EMPTY, ...data.company_info });
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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Company Data</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Company information used on training invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoPopulate}
            disabled={!myCompany}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Auto-populate from My Company
          </button>
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

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Company Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address Line 1
          </label>
          <input
            type="text"
            value={form.address_line1}
            onChange={(e) => update('address_line1', e.target.value)}
            placeholder="Street address"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address Line 2
          </label>
          <input
            type="text"
            value={form.address_line2}
            onChange={(e) => update('address_line2', e.target.value)}
            placeholder="Suite, unit, etc."
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              City
            </label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Postal Code
            </label>
            <input
              type="text"
              value={form.postal_code}
              onChange={(e) => update('postal_code', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Country
            </label>
            <select
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              className={inputClass}
            >
              <option value="">Select country</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <VatNumberInput
              value={form.vat_number}
              onChange={(val) => update('vat_number', val)}
              country={form.country}
              label="VAT Number"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tax ID
            </label>
            <input
              type="text"
              value={form.tax_id}
              onChange={(e) => update('tax_id', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phone
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+49 30 1234567"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Invoice Footer Text
          </label>
          <textarea
            value={form.footer_text}
            onChange={(e) => update('footer_text', e.target.value)}
            rows={3}
            placeholder="Additional text shown at the bottom of invoices"
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
