import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../config/api";
import AttachmentList from "./AttachmentList";
import ContactPersonList from "./ContactPersonList";
import ConfirmDialog from "./ConfirmDialog";
import RichTextEditor from "./common/RichTextEditor";
import { validatePhone } from "../utils/validators";
import type {
  Location,
  LocationContactPerson,
  TenantLocationType,
} from "../types";

export interface LocationUpdateData {
  name?: string;
  code?: string;
  location_type?: string;
  description?: string;
  capacity?: number | null;
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
  onSave?: (data: LocationUpdateData) => void;
  onDelete?: (id: string) => void;
  isSaving: boolean;
  locationTypes?: TenantLocationType[];
}

export default function LocationDetailPanel({
  location,
  onSave,
  onDelete,
  isSaving,
  locationTypes: propLocationTypes,
}: LocationDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<
    "details" | "contacts" | "documents"
  >("details");
  const [formData, setFormData] = useState<LocationUpdateData>({
    name: location.name,
    code: location.code || "",
    location_type: location.location_type,
    description: location.description || "",
    capacity: location.capacity,
    address_line1: location.address_line1 || "",
    address_line2: location.address_line2 || "",
    city: location.city || "",
    state: location.state || "",
    postal_code: location.postal_code || "",
    country: location.country || "",
    building: location.building || "",
    floor: location.floor || "",
    phone: location.phone || "",
    website: location.website || "",
    vat_number: location.vat_number || "",
    virtual_url: location.virtual_url || "",
    virtual_platform: location.virtual_platform || "",
    contact_persons: location.contact_persons || [],
    is_active: location.is_active,
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    comment: "",
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset form when location changes
  useEffect(() => {
    setActiveTab("details");
    setFormData({
      name: location.name,
      code: location.code || "",
      location_type: location.location_type,
      description: location.description || "",
      capacity: location.capacity,
      address_line1: location.address_line1 || "",
      address_line2: location.address_line2 || "",
      city: location.city || "",
      state: location.state || "",
      postal_code: location.postal_code || "",
      country: location.country || "",
      building: location.building || "",
      floor: location.floor || "",
      phone: location.phone || "",
      website: location.website || "",
      vat_number: location.vat_number || "",
      virtual_url: location.virtual_url || "",
      virtual_platform: location.virtual_platform || "",
      contact_persons: location.contact_persons || [],
      is_active: location.is_active,
    });
    setNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
    setPhoneError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.id]);

  const { data: locationTypesData } = useQuery({
    queryKey: ["location-types", location.conference_ids?.[0]],
    queryFn: async () => {
      const response = await api.get<{
        items: TenantLocationType[];
        total: number;
      }>(`/conferences/${location.conference_ids[0]}/settings/location-types`);
      return response.data;
    },
    enabled: !propLocationTypes && !!location.conference_ids?.length,
  });

  const locationTypes = propLocationTypes || locationTypesData?.items || [];

  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setFormData({
        ...formData,
        contact_persons: [
          ...(formData.contact_persons || []),
          { ...newContact },
        ],
      });
      setNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      contact_persons:
        formData.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateContact = (index: number, contact: LocationContactPerson) => {
    setFormData({
      ...formData,
      contact_persons:
        formData.contact_persons?.map((c, i) => (i === index ? contact : c)) ||
        [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError) return;
    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...newContact },
      ];
    }
    onSave?.(finalData);
  };

  const isVirtual = formData.location_type === "virtual";

  const tabs = [
    { id: "details" as const, label: "Details" },
    {
      id: "contacts" as const,
      label: `Contacts${(formData.contact_persons?.length || 0) > 0 ? ` (${formData.contact_persons?.length})` : ""}`,
    },
    { id: "documents" as const, label: "Documents" },
  ];

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      {/* Header with location name + action buttons */}
      <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              {location.name}
            </h3>
            {location.code && (
              <p className="text-sm text-gray-500">{location.code}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Delete location"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
            {onSave && (
              <button
                type="submit"
                form="location-detail-form"
                disabled={isSaving || !!phoneError}
                className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 -mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary-600 text-primary-600 bg-primary-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <form id="location-detail-form" onSubmit={handleSubmit}>
          {activeTab === "details" && (
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., ROOM-A1"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Type *
                  </label>
                  <select
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                  <label className="block text-sm font-medium text-gray-700">
                    Capacity
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.capacity ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        capacity: e.target.value
                          ? parseInt(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
              </div>

              {isVirtual ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Platform
                    </label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                    <label className="block text-sm font-medium text-gray-700">
                      URL
                    </label>
                    <input
                      type="url"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={formData.virtual_url}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          virtual_url: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Address Line 1
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                      <label className="block text-sm font-medium text-gray-700">
                        Address Line 2
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                      <label className="block text-sm font-medium text-gray-700">
                        City
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.city}
                        onChange={(e) =>
                          setFormData({ ...formData, city: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        State
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.state}
                        onChange={(e) =>
                          setFormData({ ...formData, state: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Postal Code
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                      <label className="block text-sm font-medium text-gray-700">
                        Country
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.country}
                        onChange={(e) =>
                          setFormData({ ...formData, country: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Building
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.building}
                        onChange={(e) =>
                          setFormData({ ...formData, building: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Floor
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.floor}
                        onChange={(e) =>
                          setFormData({ ...formData, floor: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Phone
                      </label>
                      <input
                        type="tel"
                        className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${phoneError ? "border-red-300" : "border-gray-300"}`}
                        value={formData.phone}
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
                      <label className="block text-sm font-medium text-gray-700">
                        Website
                      </label>
                      <input
                        type="url"
                        placeholder="https://"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                        value={formData.website}
                        onChange={(e) =>
                          setFormData({ ...formData, website: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      VAT Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., DE123456789"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={formData.vat_number}
                      onChange={(e) =>
                        setFormData({ ...formData, vat_number: e.target.value })
                      }
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <RichTextEditor
                  value={formData.description}
                  onChange={(html) =>
                    setFormData({ ...formData, description: html })
                  }
                  rows={3}
                />
              </div>

              <div className="flex items-center">
                <input
                  id="detail-panel-active-toggle"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.checked })
                  }
                />
                <label
                  htmlFor="detail-panel-active-toggle"
                  className="ml-2 block text-sm text-gray-900"
                >
                  Active
                </label>
              </div>
            </div>
          )}

          {activeTab === "contacts" && (
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
          )}
        </form>

        {activeTab === "documents" && (
          <div className="px-6 py-5">
            <AttachmentList entityType="location" entityId={location.id} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Location"
        message={`Are you sure you want to delete "${location.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.(location.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
