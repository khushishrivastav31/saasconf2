import { useState, useEffect } from 'react';
import AttachmentList from './AttachmentList';
import ContactPersonList from './ContactPersonList';
import DetailPanelWrapper from './DetailPanelWrapper';
import RichTextEditor from './common/RichTextEditor';
import SponsorLogoUpload from './SponsorLogoUpload';
import { validatePhone } from '../utils/validators';
import { useSaveStatus } from '../hooks/useSaveStatus';
import type {
  Sponsor,
  SponsorUpdate,
  SponsorPackage,
  PlatformCurrency,
  LocationContactPerson,
} from '../types';

interface SponsorDetailPanelProps {
  sponsor: Sponsor;
  sponsorPackages: SponsorPackage[];
  currencies: PlatformCurrency[];
  defaultCurrency?: string;
  onSave: (data: SponsorUpdate) => Promise<void>;
  onDelete?: (id: string) => void;
}

export default function SponsorDetailPanel({
  sponsor,
  sponsorPackages,
  currencies,
  defaultCurrency,
  onSave,
  onDelete,
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
          <label className="block text-sm font-medium text-gray-700">Company Name *</label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Sponsor Package</label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                <span className="font-medium">Visible</span>
                <span className="text-gray-500 ml-1">(show on website)</span>
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Price</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
            <label className="block text-sm font-medium text-gray-700">Currency</label>
            <div className="mt-1 block w-full border border-gray-200 bg-gray-50 rounded-md py-2 px-3 text-sm text-gray-700">
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
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${phoneError ? 'border-red-300' : 'border-gray-300'}`}
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
            <label className="block text-sm font-medium text-gray-700">Website</label>
            <input
              type="url"
              placeholder="https://"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.website || ''}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Address Line 1</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
            <label className="block text-sm font-medium text-gray-700">Address Line 2</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
            <label className="block text-sm font-medium text-gray-700">City</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.city || ''}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">State</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.state || ''}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Postal Code</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
            <label className="block text-sm font-medium text-gray-700">Country</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.country || ''}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">VAT Number</label>
          <input
            type="text"
            placeholder="e.g., DE123456789"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.vat_number || ''}
            onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Comments</label>
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

  const documentsContent = (
    <div className="px-6 py-5">
      <AttachmentList entityType="sponsor" entityId={sponsor.id} />
    </div>
  );

  const tabs = [
    { id: 'details', label: 'Details', content: detailsContent },
    {
      id: 'contacts',
      label: `Contacts${(formData.contact_persons?.length || 0) > 0 ? ` (${formData.contact_persons?.length})` : ''}`,
      content: contactsContent,
    },
    { id: 'documents', label: 'Documents', content: documentsContent },
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
    />
  );
}
