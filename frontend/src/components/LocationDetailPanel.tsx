import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import { queryKeys } from '../config/queryKeys';
import AttachmentList from './AttachmentList';
import ContactPersonList from './ContactPersonList';
import DetailPanelWrapper from './DetailPanelWrapper';
import RichTextEditor from './common/RichTextEditor';
import { validatePhone, normalizeUrl } from '../utils/validators';
import { COUNTRIES_BY_CONTINENT } from '../config/countries';
import { useSaveStatus } from '../hooks/useSaveStatus';
import type { Location, LocationContactPerson, TenantLocationType } from '../types';

export interface LocationUpdateData {
  name?: string;
  code?: string;
  location_type?: string;
  description?: string;
  capacity?: number | null;
  parent_id?: string | null;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  building?: string;
  floor?: string;
  phone?: string;
  website?: string;
  vat_number?: string;
  virtual_url?: string;
  virtual_platform?: string;
  contact_persons?: LocationContactPerson[];
  is_active?: boolean;
}

interface LocationDetailPanelProps {
  location: Location;
  onSave?: (data: LocationUpdateData) => Promise<void>;
  onDelete?: (id: string) => void;
  locationTypes?: TenantLocationType[];
  allLocations?: Location[];
}

export default function LocationDetailPanel({
  location,
  onSave,
  onDelete,
  locationTypes: propLocationTypes,
  allLocations,
}: LocationDetailPanelProps) {
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const [formData, setFormData] = useState<LocationUpdateData>({
    name: location.name,
    code: location.code || '',
    location_type: location.location_type,
    description: location.description || '',
    capacity: location.capacity,
    parent_id: location.parent_id,
    address_line1: location.address_line1 || '',
    address_line2: location.address_line2 || '',
    city: location.city || '',
    state: location.state || '',
    postal_code: location.postal_code || '',
    country: location.country || '',
    building: location.building || '',
    floor: location.floor || '',
    phone: location.phone || '',
    website: location.website || '',
    vat_number: location.vat_number || '',
    virtual_url: location.virtual_url || '',
    virtual_platform: location.virtual_platform || '',
    contact_persons: location.contact_persons || [],
    is_active: location.is_active,
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Reset form when location changes
  useEffect(() => {
    setFormData({
      name: location.name,
      code: location.code || '',
      location_type: location.location_type,
      description: location.description || '',
      capacity: location.capacity,
      parent_id: location.parent_id,
      address_line1: location.address_line1 || '',
      address_line2: location.address_line2 || '',
      city: location.city || '',
      state: location.state || '',
      postal_code: location.postal_code || '',
      country: location.country || '',
      building: location.building || '',
      floor: location.floor || '',
      phone: location.phone || '',
      website: location.website || '',
      vat_number: location.vat_number || '',
      virtual_url: location.virtual_url || '',
      virtual_platform: location.virtual_platform || '',
      contact_persons: location.contact_persons || [],
      is_active: location.is_active,
    });
    setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    setPhoneError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.id]);

  const hasConference = !!location.conference_ids?.length;

  const { data: locationTypesData } = useQuery({
    queryKey: hasConference
      ? queryKeys.locations.types(location.conference_ids![0])
      : ['tenant-location-types'],
    queryFn: async () => {
      if (hasConference) {
        const response = await api.get<{
          items: TenantLocationType[];
          total: number;
        }>(`/conferences/${location.conference_ids![0]}/settings/location-types`);
        return response.data;
      }
      // Fallback: fetch tenant-level location types (for training locations)
      const response = await api.get<{ items: TenantLocationType[]; total: number }>(
        '/trainings/location-types'
      );
      return response.data;
    },
    enabled: !propLocationTypes,
  });

  const locationTypes = propLocationTypes || locationTypesData?.items || [];

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
    // Normalize empty phone/email to undefined so backend receives null
    if (finalData.contact_persons) {
      finalData.contact_persons = finalData.contact_persons.map((cp) => ({
        ...cp,
        phone: cp.phone?.trim() || undefined,
        email: cp.email?.trim() || undefined,
      }));
    }
    setSaving();
    try {
      await onSave?.(finalData);
      setSaved();
    } catch {
      setError();
    }
  };

  const isVirtual = formData.location_type === 'virtual';

  const detailsContent = (
    <form id="location-detail-form" onSubmit={handleSubmit}>
      <div className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Code
            </label>
            <input
              type="text"
              placeholder="e.g., ROOM-A1"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Type *
            </label>
            <select
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.location_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  location_type: e.target.value,
                })
              }
            >
              {locationTypes
                .filter((t) => t.is_active)
                .map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Parent Location
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.parent_id || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  parent_id: e.target.value || null,
                })
              }
            >
              <option value="">None (top-level venue)</option>
              {allLocations
                ?.filter((loc) => !loc.parent_id && loc.id !== location.id)
                .map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Capacity
            </label>
            <input
              type="number"
              min="0"
              placeholder="Max attendees"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.capacity ?? ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  capacity: e.target.value ? parseInt(e.target.value) : null,
                })
              }
            />
          </div>
        </div>

        {isVirtual ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Platform
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.virtual_platform}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    virtual_platform: e.target.value,
                  })
                }
              >
                <option value="">Select platform</option>
                <option value="zoom">Zoom</option>
                <option value="teams">Microsoft Teams</option>
                <option value="meet">Google Meet</option>
                <option value="webex">Webex</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                URL
              </label>
              <input
                type="text"
                placeholder="example.com"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.virtual_url}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    virtual_url: e.target.value,
                  })
                }
                onBlur={(e) =>
                  setFormData({
                    ...formData,
                    virtual_url: normalizeUrl(e.target.value),
                  })
                }
              />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Address Line 1
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.address_line1}
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
                  value={formData.address_line2}
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
                  value={formData.city}
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
                  value={formData.state}
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
                  value={formData.postal_code}
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
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                >
                  <option value="">Select a country</option>
                  {COUNTRIES_BY_CONTINENT.map((group) => (
                    <optgroup key={group.continent} label={group.continent}>
                      {group.countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Building
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Floor
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone
                </label>
                <input
                  type="tel"
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100 ${phoneError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`}
                  value={formData.phone}
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
                  Website
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  onBlur={(e) =>
                    setFormData({ ...formData, website: normalizeUrl(e.target.value) })
                  }
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
                value={formData.vat_number}
                onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <RichTextEditor
            value={formData.description}
            onChange={(html) => setFormData({ ...formData, description: html })}
            rows={3}
          />
        </div>

        <div className="flex items-center">
          <input
            id="detail-panel-active-toggle"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          <label
            htmlFor="detail-panel-active-toggle"
            className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
          >
            Active
          </label>
        </div>
      </div>
    </form>
  );

  const contactsContent = (
    <form id="location-detail-form" onSubmit={handleSubmit}>
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
      <AttachmentList entityType="location" entityId={location.id} />
    </div>
  );

  const tabs = [
    {
      id: 'details',
      label: 'Details',
      content: detailsContent,
    },
    {
      id: 'contacts',
      label: `Contacts${(formData.contact_persons?.length || 0) > 0 ? ` (${formData.contact_persons?.length})` : ''}`,
      content: contactsContent,
    },
    {
      id: 'documents',
      label: 'Documents',
      content: documentsContent,
    },
  ];

  return (
    <DetailPanelWrapper
      key={location.id}
      title={location.name}
      subtitle={location.code || undefined}
      saveStatus={saveStatus}
      tabs={tabs}
      formId="location-detail-form"
      showSave={!!onSave}
      saveDisabled={!!phoneError}
      onDelete={onDelete ? () => onDelete(location.id) : undefined}
      deleteTitle="Delete Location"
      deleteMessage={`Are you sure you want to delete "${location.name}"? This action cannot be undone.`}
    />
  );
}
