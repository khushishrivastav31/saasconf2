import { useState, useEffect } from 'react';
import AttachmentList from './AttachmentList';
import ContactPersonList from './ContactPersonList';
import DetailPanelWrapper from './DetailPanelWrapper';
import RichTextEditor from './common/RichTextEditor';
import { validatePhone, validateEmail } from '../utils/validators';
import { useSaveStatus } from '../hooks/useSaveStatus';
import type { ServiceProvider, ServiceProviderUpdate, LocationContactPerson } from '../types';

interface ServiceProviderDetailPanelProps {
  provider: ServiceProvider;
  onSave: (data: ServiceProviderUpdate) => void;
  onDelete?: (id: string) => void;
  isSaving: boolean;
  saveError?: boolean;
  saveSuccess?: boolean;
}

export default function ServiceProviderDetailPanel({
  provider,
  onSave,
  onDelete,
  isSaving,
  saveError,
  saveSuccess,
}: ServiceProviderDetailPanelProps) {
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const [formData, setFormData] = useState<ServiceProviderUpdate>({
    company_name: provider.company_name,
    service_description: provider.service_description || '',
    phone: provider.phone || '',
    email: provider.email || '',
    website: provider.website || '',
    address_line1: provider.address_line1 || '',
    address_line2: provider.address_line2 || '',
    city: provider.city || '',
    state: provider.state || '',
    postal_code: provider.postal_code || '',
    country: provider.country || '',
    vat_number: provider.vat_number || '',
    contact_persons: provider.contact_persons || [],
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Handle save status based on props
  useEffect(() => {
    if (isSaving) {
      setSaving();
    } else if (saveSuccess) {
      setSaved();
    } else if (saveError) {
      setError();
    }
  }, [isSaving, saveSuccess, saveError, setSaving, setSaved, setError]);

  // Reset form when provider changes
  useEffect(() => {
    setFormData({
      company_name: provider.company_name,
      service_description: provider.service_description || '',
      phone: provider.phone || '',
      email: provider.email || '',
      website: provider.website || '',
      address_line1: provider.address_line1 || '',
      address_line2: provider.address_line2 || '',
      city: provider.city || '',
      state: provider.state || '',
      postal_code: provider.postal_code || '',
      country: provider.country || '',
      vat_number: provider.vat_number || '',
      contact_persons: provider.contact_persons || [],
    });
    setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    setPhoneError(null);
    setEmailError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError || emailError) return;
    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...newContact }];
    }
    onSave(finalData);
  };

  const detailsContent = (
    <form id="sp-detail-form" onSubmit={handleSubmit}>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Company Name *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Service Description
          </label>
          <RichTextEditor
            value={formData.service_description || ''}
            onChange={(html) =>
              setFormData({
                ...formData,
                service_description: html,
              })
            }
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Phone
            </label>
            <input
              type="tel"
              className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${phoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
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
              Email
            </label>
            <input
              type="email"
              className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${emailError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onBlur={(e) => setEmailError(validateEmail(e.target.value))}
            />
            {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Website
          </label>
          <input
            type="url"
            placeholder="https://"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.website || ''}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Address Line 1
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.country || ''}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            VAT Number
          </label>
          <input
            type="text"
            placeholder="e.g., DE123456789"
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.vat_number || ''}
            onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
          />
        </div>
      </div>
    </form>
  );

  const contactsContent = (
    <form id="sp-detail-form" onSubmit={handleSubmit}>
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
      <AttachmentList entityType="service_provider" entityId={provider.id} />
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
      key={provider.id}
      title={provider.company_name}
      saveStatus={saveStatus}
      tabs={tabs}
      formId="sp-detail-form"
      saveDisabled={isSaving || !!phoneError || !!emailError}
      onDelete={onDelete ? () => onDelete(provider.id) : undefined}
      deleteTitle="Delete Service Provider"
      deleteMessage={`Are you sure you want to delete "${provider.company_name}"? This action cannot be undone.`}
    />
  );
}
