import { useState, useEffect } from 'react';
import AttachmentList from './AttachmentList';
import ContactPersonList from './ContactPersonList';
import DetailPanelWrapper from './DetailPanelWrapper';
import RichTextEditor from './common/RichTextEditor';
import VatNumberInput from './common/VatNumberInput';
import { validatePhone, validateEmail, validateWebsite } from '../utils/validators';
import { useSaveStatus } from '../hooks/useSaveStatus';
import { COUNTRY_OPTIONS } from '../config/countries';
import type {
  CertificationBody,
  CertificationBodyUpdate,
  CertificationBodyContact,
} from '../types/training';
import type { LocationContactPerson } from '../types/common';

interface CertificationBodyDetailPanelProps {
  body: CertificationBody;
  onSave: (data: CertificationBodyUpdate) => void;
  onDelete?: (id: string) => void;
  isSaving: boolean;
  saveError?: boolean;
  saveSuccess?: boolean;
}

export default function CertificationBodyDetailPanel({
  body,
  onSave,
  onDelete,
  isSaving,
  saveError,
  saveSuccess,
}: CertificationBodyDetailPanelProps) {
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const [formData, setFormData] = useState<CertificationBodyUpdate>({
    company_name: body.company_name,
    service_description: body.service_description || '',
    phone: body.phone || '',
    email: body.email || '',
    website: body.website || '',
    address_line1: body.address_line1 || '',
    address_line2: body.address_line2 || '',
    city: body.city || '',
    state: body.state || '',
    postal_code: body.postal_code || '',
    country: body.country || '',
    vat_number: body.vat_number || '',
    contact_persons: body.contact_persons || [],
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
  const [websiteError, setWebsiteError] = useState<string | null>(null);

  useEffect(() => {
    if (isSaving) {
      setSaving();
    } else if (saveSuccess) {
      setSaved();
    } else if (saveError) {
      setError();
    }
  }, [isSaving, saveSuccess, saveError, setSaving, setSaved, setError]);

  // Reset form when body changes
  useEffect(() => {
    setFormData({
      company_name: body.company_name,
      service_description: body.service_description || '',
      phone: body.phone || '',
      email: body.email || '',
      website: body.website || '',
      address_line1: body.address_line1 || '',
      address_line2: body.address_line2 || '',
      city: body.city || '',
      state: body.state || '',
      postal_code: body.postal_code || '',
      country: body.country || '',
      vat_number: body.vat_number || '',
      contact_persons: body.contact_persons || [],
    });
    setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    setPhoneError(null);
    setEmailError(null);
    setWebsiteError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.id]);

  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setFormData({
        ...formData,
        contact_persons: [
          ...(formData.contact_persons || []),
          { ...newContact } as CertificationBodyContact,
        ],
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
      contact_persons:
        formData.contact_persons?.map((c, i) =>
          i === index ? (contact as CertificationBodyContact) : c
        ) || [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError || emailError || websiteError) return;
    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...newContact } as CertificationBodyContact,
      ];
    }
    onSave(finalData);
  };

  const detailsContent = (
    <form id="cb-detail-form" onSubmit={handleSubmit}>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Company Name *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.company_name || ''}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Service Description
          </label>
          <RichTextEditor
            value={formData.service_description || ''}
            onChange={(html) => setFormData({ ...formData, service_description: html })}
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
                setFormData({ ...formData, phone: e.target.value });
                if (phoneError) setPhoneError(null);
              }}
              onBlur={(e) => setPhoneError(validatePhone(e.target.value))}
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
            className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${websiteError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
            value={formData.website || ''}
            onChange={(e) => {
              setFormData({ ...formData, website: e.target.value });
              if (websiteError) setWebsiteError(null);
            }}
            onBlur={(e) => setWebsiteError(validateWebsite(e.target.value))}
          />
          {websiteError && <p className="mt-1 text-xs text-red-600">{websiteError}</p>}
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
              onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Country
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.country || ''}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
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

        <VatNumberInput
          value={formData.vat_number || ''}
          onChange={(val) => setFormData({ ...formData, vat_number: val })}
          country={formData.country || undefined}
        />
      </div>
    </form>
  );

  const contactsContent = (
    <form id="cb-detail-form" onSubmit={handleSubmit}>
      <div className="px-6 py-5">
        <ContactPersonList
          contacts={(formData.contact_persons || []) as LocationContactPerson[]}
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
      <AttachmentList entityType="certification_body" entityId={body.id} />
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
      key={body.id}
      title={body.company_name}
      saveStatus={saveStatus}
      tabs={tabs}
      formId="cb-detail-form"
      saveDisabled={isSaving || !!phoneError || !!emailError || !!websiteError}
      onDelete={onDelete ? () => onDelete(body.id) : undefined}
      deleteTitle="Delete Certification Body"
      deleteMessage={`Are you sure you want to delete "${body.company_name}"? This action cannot be undone.`}
    />
  );
}
