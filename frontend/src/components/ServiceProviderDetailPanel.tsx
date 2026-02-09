import { useState, useEffect, useRef } from "react";
import AttachmentList from "./AttachmentList";
import ContactPersonList from "./ContactPersonList";
import ConfirmDialog from "./ConfirmDialog";
import RichTextEditor from "./common/RichTextEditor";
import { validatePhone } from "../utils/validators";
import type {
  ServiceProvider,
  ServiceProviderUpdate,
  LocationContactPerson,
} from "../types";

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
  const [activeTab, setActiveTab] = useState<
    "details" | "contacts" | "documents"
  >("details");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formData, setFormData] = useState<ServiceProviderUpdate>({
    company_name: provider.company_name,
    service_description: provider.service_description || "",
    phone: provider.phone || "",
    email: provider.email || "",
    website: provider.website || "",
    address_line1: provider.address_line1 || "",
    address_line2: provider.address_line2 || "",
    city: provider.city || "",
    state: provider.state || "",
    postal_code: provider.postal_code || "",
    country: provider.country || "",
    vat_number: provider.vat_number || "",
    contact_persons: provider.contact_persons || [],
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

  // Handle save status based on props
  useEffect(() => {
    if (isSaving) {
      setSaveStatus("saving");
    } else if (saveSuccess) {
      setSaveStatus("saved");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } else if (saveError) {
      setSaveStatus("error");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [isSaving, saveSuccess, saveError]);

  // Reset form when provider changes
  useEffect(() => {
    setActiveTab("details");
    setFormData({
      company_name: provider.company_name,
      service_description: provider.service_description || "",
      phone: provider.phone || "",
      email: provider.email || "",
      website: provider.website || "",
      address_line1: provider.address_line1 || "",
      address_line2: provider.address_line2 || "",
      city: provider.city || "",
      state: provider.state || "",
      postal_code: provider.postal_code || "",
      country: provider.country || "",
      vat_number: provider.vat_number || "",
      contact_persons: provider.contact_persons || [],
    });
    setNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
    setPhoneError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

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
    onSave(finalData);
  };

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
      {/* Header with provider name */}
      <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {provider.company_name}
          </h3>
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
        <form id="sp-detail-form" onSubmit={handleSubmit}>
          {activeTab === "details" && (
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.company_name}
                  onChange={(e) =>
                    setFormData({ ...formData, company_name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Service Description
                </label>
                <RichTextEditor
                  value={formData.service_description || ""}
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
                  <label className="block text-sm font-medium text-gray-700">
                    Phone
                  </label>
                  <input
                    type="tel"
                    className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${phoneError ? "border-red-300" : "border-gray-300"}`}
                    value={formData.phone || ""}
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
                    Email
                  </label>
                  <input
                    type="email"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.email || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Website
                </label>
                <input
                  type="url"
                  placeholder="https://"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.website || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, website: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.address_line1 || ""}
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
                    value={formData.address_line2 || ""}
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
                    value={formData.city || ""}
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
                    value={formData.state || ""}
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
                    value={formData.postal_code || ""}
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
                    value={formData.country || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, country: e.target.value })
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
                  value={formData.vat_number || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, vat_number: e.target.value })
                  }
                />
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
            <AttachmentList
              entityType="service_provider"
              entityId={provider.id}
            />
          </div>
        )}
      </div>

      {/* Footer with action buttons */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
        {onDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-300 rounded-md transition-colors"
          >
            Delete
          </button>
        )}
        {!onDelete && <div />}
        <button
          type="submit"
          form="sp-detail-form"
          disabled={isSaving || !!phoneError}
          className={`px-4 py-1.5 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50 transition-colors duration-200 ${
            saveStatus === "saved"
              ? "bg-green-600"
              : saveStatus === "error"
                ? "bg-red-600"
                : "bg-primary-600 hover:bg-primary-700"
          }`}
        >
          {saveStatus === "saving" ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          ) : saveStatus === "saved" ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          ) : saveStatus === "error" ? (
            "Save failed"
          ) : (
            "Save Changes"
          )}
        </button>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Service Provider"
        message={`Are you sure you want to delete "${provider.company_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.(provider.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
