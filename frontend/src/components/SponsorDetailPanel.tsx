import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import api from '../config/api';
import { queryKeys } from '../config/queryKeys';
import AttachmentList from './AttachmentList';
import ContactPersonList from './ContactPersonList';
import DetailPanelWrapper from './DetailPanelWrapper';
import SponsorContractTab from './SponsorContractTab';
import RichTextEditor from './common/RichTextEditor';
import SponsorLogoUpload from './SponsorLogoUpload';
import { LoadingSpinner } from './common/LoadingSpinner';
import { validatePhone, normalizeUrl } from '../utils/validators';
import { COUNTRY_OPTIONS } from '../config/countries';
import VatNumberInput from './common/VatNumberInput';
import { useSaveStatus } from '../hooks/useSaveStatus';
import { useSelection } from '../pages/ConferenceDetail/SelectionContext';
import { useToast } from './Toast';
import { parseApiError } from '../utils/apiError';
import type {
  Sponsor,
  SponsorUpdate,
  SponsorPackage,
  PlatformCurrency,
  LocationContactPerson,
  Invoice,
} from '../types';

interface SponsorDetailPanelProps {
  sponsor: Sponsor;
  sponsorPackages: SponsorPackage[];
  currencies: PlatformCurrency[];
  defaultCurrency?: string;
  conferenceId: string;
  onSave: (data: SponsorUpdate) => Promise<void>;
  onDelete?: (id: string) => void;
  onDeactivate?: () => void;
}

export default function SponsorDetailPanel({
  sponsor,
  sponsorPackages,
  currencies,
  defaultCurrency,
  conferenceId,
  onSave,
  onDelete,
  onDeactivate,
}: SponsorDetailPanelProps) {
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const [formData, setFormData] = useState<SponsorUpdate>({
    company_name: sponsor.company_name,
    sponsor_package_id: sponsor.sponsor_package_id,
    price: sponsor.price ?? undefined,
    currency: sponsor.currency || defaultCurrency || '',
    phone: sponsor.phone || '',
    website: sponsor.website || '',
    address_line1: sponsor.address_line1 || '',
    address_line2: sponsor.address_line2 || '',
    city: sponsor.city || '',
    state: sponsor.state || '',
    postal_code: sponsor.postal_code || '',
    country: sponsor.country || '',
    vat_number: sponsor.vat_number || '',
    comments: sponsor.comments || '',
    contact_persons: sponsor.contact_persons || [],
    is_active: sponsor.is_active,
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Reset form when sponsor changes
  useEffect(() => {
    setFormData({
      company_name: sponsor.company_name,
      sponsor_package_id: sponsor.sponsor_package_id,
      price: sponsor.price ?? undefined,
      currency: sponsor.currency || defaultCurrency || '',
      phone: sponsor.phone || '',
      website: sponsor.website || '',
      address_line1: sponsor.address_line1 || '',
      address_line2: sponsor.address_line2 || '',
      city: sponsor.city || '',
      state: sponsor.state || '',
      postal_code: sponsor.postal_code || '',
      country: sponsor.country || '',
      vat_number: sponsor.vat_number || '',
      comments: sponsor.comments || '',
      contact_persons: sponsor.contact_persons || [],
      is_active: sponsor.is_active,
    });
    setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    setPhoneError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sponsor.id, defaultCurrency]);

  const handlePackageChange = (packageId: string) => {
    if (!packageId) {
      // No package selected - use conference default currency
      setFormData({ ...formData, sponsor_package_id: null, currency: defaultCurrency || '' });
      return;
    }
    const pkg = sponsorPackages.find((p) => p.id === packageId);
    if (pkg) {
      const updates: Partial<SponsorUpdate> = {
        sponsor_package_id: pkg.id,
        // Always use package currency (or fall back to default)
        currency: pkg.currency || defaultCurrency || '',
      };
      // Auto-fill price from package if field is currently empty
      if (!formData.price && pkg.price != null) {
        updates.price = pkg.price;
      }
      setFormData({ ...formData, ...updates });
    }
  };

  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setFormData({
        ...formData,
        contact_persons: [...(formData.contact_persons || []), { ...newContact }],
      });
      setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    }
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      contact_persons: formData.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateContact = (index: number, contact: LocationContactPerson) => {
    setFormData({
      ...formData,
      contact_persons: formData.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError) return;
    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...newContact }];
    }
    // Derive currency from package (or use default)
    const pkg = sponsorPackages.find((p) => p.id === finalData.sponsor_package_id);
    finalData.currency = pkg?.currency || defaultCurrency || '';
    setSaving();
    try {
      await onSave(finalData);
      setSaved();
    } catch {
      setError();
    }
  };

  const detailsContent = (
    <form id="sponsor-detail-form" onSubmit={handleSubmit}>
      <div className="px-6 py-5 space-y-4">
        {/* Logo Upload */}
        <SponsorLogoUpload sponsorId={sponsor.id} />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Company Name *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sponsor Package
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.sponsor_package_id || ''}
              onChange={(e) => handlePackageChange(e.target.value)}
            >
              <option value="">-- No Package --</option>
              {sponsorPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    is_active: e.target.checked,
                  })
                }
                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">Visible</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">(show on website)</span>
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Price
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.price ?? ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  price: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Currency
            </label>
            <div className="mt-1 block w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-md py-2 px-3 text-sm text-gray-700 dark:text-gray-300">
              {(() => {
                const pkg = sponsorPackages.find((p) => p.id === formData.sponsor_package_id);
                const currencyCode = pkg?.currency || defaultCurrency;
                if (!currencyCode) return '—';
                const currency = currencies.find((c) => c.code === currencyCode);
                return currency ? `${currency.code} - ${currency.name}` : currencyCode;
              })()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Phone
            </label>
            <input
              type="tel"
              className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm ${phoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
              value={formData.phone || ''}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, phone: value });
                setPhoneError(validatePhone(value));
              }}
              placeholder="+491234545 or 00491234566"
            />
            {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Website
            </label>
            <input
              type="text"
              placeholder="example.com"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.website || ''}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              onBlur={(e) => setFormData({ ...formData, website: normalizeUrl(e.target.value) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Address Line 1
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.address_line1 || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  address_line1: e.target.value,
                })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Address Line 2
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.address_line2 || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  address_line2: e.target.value,
                })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              City
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.city || ''}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              State
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.state || ''}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Postal Code
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.postal_code || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  postal_code: e.target.value,
                })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Country
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.country || ''}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            >
              <option value="">Select a country</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <VatNumberInput
          value={formData.vat_number || ''}
          onChange={(val) => setFormData({ ...formData, vat_number: val })}
          country={formData.country || undefined}
          placeholder="e.g., DE123456789"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Comments
          </label>
          <RichTextEditor
            value={formData.comments || ''}
            onChange={(html) => setFormData({ ...formData, comments: html })}
            rows={3}
          />
        </div>
      </div>
    </form>
  );

  const contactsContent = (
    <form id="sponsor-detail-form" onSubmit={handleSubmit}>
      <div className="px-6 py-5">
        <ContactPersonList
          contacts={formData.contact_persons || []}
          newContact={newContact}
          setNewContact={setNewContact}
          addContact={addContact}
          removeContact={removeContact}
          updateContact={updateContact}
        />
      </div>
    </form>
  );

  const contractContent = (
    <div className="px-6 py-5">
      <SponsorContractTab sponsor={sponsor} conferenceId={conferenceId} />
    </div>
  );

  const documentsContent = (
    <div className="px-6 py-5">
      <AttachmentList entityType="sponsor" entityId={sponsor.id} />
    </div>
  );

  const invoicesContent = (
    <SponsorInvoicesContent conferenceId={conferenceId} sponsorId={sponsor.id} />
  );

  const tabs = [
    { id: 'details', label: 'Details', content: detailsContent },
    {
      id: 'contacts',
      label: `Contacts${(formData.contact_persons?.length || 0) > 0 ? ` (${formData.contact_persons?.length})` : ''}`,
      content: contactsContent,
    },
    { id: 'contract', label: 'Contract', content: contractContent },
    { id: 'documents', label: 'Documents', content: documentsContent },
    { id: 'invoices', label: 'Invoices', content: invoicesContent },
  ];

  return (
    <DetailPanelWrapper
      key={sponsor.id}
      title={sponsor.company_name}
      subtitle={sponsor.sponsor_package_name || undefined}
      saveStatus={saveStatus}
      tabs={tabs}
      formId="sponsor-detail-form"
      saveDisabled={!!phoneError}
      onDelete={onDelete ? () => onDelete(sponsor.id) : undefined}
      deleteTitle="Delete Sponsor"
      deleteMessage={`Are you sure you want to delete "${sponsor.company_name}"? This action cannot be undone.`}
      headerActions={
        onDeactivate ? (
          <button
            type="button"
            onClick={onDeactivate}
            className="px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-900/30 border border-amber-300 dark:border-amber-600 rounded-md transition-colors"
          >
            Deactivate
          </button>
        ) : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Sponsor Invoices sub-component
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  cancelled: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

function SponsorInvoicesContent({
  conferenceId,
  sponsorId,
}: {
  conferenceId: string;
  sponsorId: string;
}) {
  const { setSelectedInvoiceId } = useSelection();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  const pdfFile = useMemo(() => (pdfBytes ? { data: new Uint8Array(pdfBytes) } : null), [pdfBytes]);

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.invoices.byConference(conferenceId), 'sponsor', sponsorId],
    queryFn: async () => {
      const response = await api.get<{ items: Invoice[]; total: number }>(
        `/conferences/${conferenceId}/invoices`,
        {
          params: {
            recipient_source_type: 'sponsor',
            recipient_source_id: sponsorId,
            page_size: 100,
          },
        }
      );
      return response.data;
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await api.post<Invoice>(
        `/conferences/${conferenceId}/invoices/${invoiceId}/send`
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.byConference(conferenceId),
      });
      setError(null);
      showToast(`Invoice ${result.invoice_number} sent to ${result.recipient_email}`, 'success');
    },
    onError: (err: unknown) => {
      showToast(parseApiError(err, 'Failed to send invoice'), 'error');
    },
  });

  const viewPDF = async (invoiceId: string) => {
    if (previewInvoiceId === invoiceId) {
      setPdfBytes(null);
      setPreviewInvoiceId(null);
      return;
    }
    try {
      const res = await api.get(`/conferences/${conferenceId}/invoices/${invoiceId}/pdf`, {
        responseType: 'arraybuffer',
      });
      setPdfBytes(new Uint8Array(res.data));
      setPreviewInvoiceId(invoiceId);
    } catch (err) {
      setError(parseApiError(err, 'Failed to load PDF'));
    }
  };

  const downloadPDF = async (invoiceId: string, invoiceNumber: string | null) => {
    try {
      const res = await api.get(`/conferences/${conferenceId}/invoices/${invoiceId}/pdf`, {
        responseType: 'arraybuffer',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${invoiceNumber || 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(parseApiError(err, 'Failed to download PDF'));
    }
  };

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Invoices linked to this sponsor.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : data?.items && data.items.length > 0 ? (
        <>
          <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Issue Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data.items.map((invoice) => (
                  <tr
                    key={invoice.id}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-primary-600 dark:text-primary-400">
                      {invoice.invoice_number || (
                        <span className="text-gray-400 dark:text-gray-500 italic">DRAFT</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {invoice.issue_date || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          STATUS_COLORS[invoice.status] ||
                          'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
                      {invoice.total != null
                        ? `${Number(invoice.total).toFixed(2)}${invoice.currency ? ` ${invoice.currency}` : ''}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => viewPDF(invoice.id)}
                          className={`p-1 rounded transition-colors ${
                            previewInvoiceId === invoice.id
                              ? 'text-primary-600'
                              : 'text-gray-400 dark:text-gray-500 hover:text-primary-600'
                          }`}
                          title={previewInvoiceId === invoice.id ? 'Close Preview' : 'Preview PDF'}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPDF(invoice.id, invoice.invoice_number)}
                          className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors"
                          title="Download PDF"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>
                        {(invoice.status === 'sent' || invoice.status === 'overdue') &&
                          invoice.recipient_email && (
                            <button
                              type="button"
                              onClick={() => sendMutation.mutate(invoice.id)}
                              disabled={sendMutation.isPending}
                              className="text-gray-400 dark:text-gray-500 hover:text-blue-600 p-1 rounded transition-colors disabled:opacity-50"
                              title="Resend"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inline PDF preview */}
          {pdfBytes && (
            <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-900 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  PDF Preview
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPdfBytes(null);
                    setPreviewInvoiceId(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="bg-gray-200 dark:bg-gray-800 p-4 max-h-[600px] overflow-y-auto">
                <Document
                  file={pdfFile}
                  onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                  loading={<LoadingSpinner />}
                >
                  {Array.from({ length: pdfNumPages }, (_, i) => (
                    <Page key={i + 1} pageNumber={i + 1} width={600} className="mx-auto mb-2" />
                  ))}
                </Document>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No invoices linked to this sponsor yet.
        </div>
      )}
    </div>
  );
}
