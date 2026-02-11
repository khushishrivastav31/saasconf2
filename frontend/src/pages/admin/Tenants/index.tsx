import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../config/api";
import ConfirmDialog from "../../../components/ConfirmDialog";
import Modal from "../../../components/Modal";
import RichTextEditor from "../../../components/common/RichTextEditor";
import type {
  Tenant,
  TenantCreate,
  ContactPerson,
  PaginatedResponse,
} from "../../../types";
import TenantDetailModal from "./TenantDetailModal";
import { validatePhone } from "../../../utils/validators";

export default function Tenants() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const response =
        await api.get<PaginatedResponse<Tenant>>("/admin/tenants");
      return response.data;
    },
  });

  // Sync selectedTenant with latest data when query refetches
  useEffect(() => {
    if (selectedTenant && data?.items) {
      const updatedTenant = data.items.find((t) => t.id === selectedTenant.id);
      if (updatedTenant && updatedTenant.super_user_id !== selectedTenant.super_user_id) {
        setSelectedTenant(updatedTenant);
      }
    }
  }, [data, selectedTenant]);

  const createMutation = useMutation({
    mutationFn: async (data: TenantCreate) => {
      const response = await api.post<Tenant>("/admin/tenants", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setIsCreateModalOpen(false);
    },
  });

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage tenant companies and their module access
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          Add Company
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Users
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Modules
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.items.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {tenant.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{tenant.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {tenant.user_count}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {tenant.module_count}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        tenant.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {tenant.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setSelectedTenant(tenant)}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <CreateTenantModal
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => {
            setSelectedTenant(null);
            queryClient.invalidateQueries({ queryKey: ["tenants"] });
          }}
        />
      )}
    </div>
  );
}

function CreateTenantModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: TenantCreate) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<TenantCreate>({
    name: "",
    slug: "",
    address: "",
    postal_code: "",
    city: "",
    country: "",
    vat_number: "",
    website: "",
    contact_persons: [],
    comments: "",
    admin_email: "",
    admin_password: "",
    admin_first_name: "",
    admin_last_name: "",
  });

  const [newContact, setNewContact] = useState<ContactPerson>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "",
  });


  const addContact = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setFormData({
        ...formData,
        contact_persons: [
          ...(formData.contact_persons || []),
          { ...newContact },
        ],
      });
      setNewContact({ first_name: "", last_name: "", email: "", phone: "", role: "" });
      setNewContactPhoneError(null);
    }
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      contact_persons:
        formData.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateContact = (index: number, contact: ContactPerson) => {
    setFormData({
      ...formData,
      contact_persons:
        formData.contact_persons?.map((c, i) => (i === index ? contact : c)) ||
        [],
    });
  };

  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(
    null,
  );
  const [deleteContactIndex, setDeleteContactIndex] = useState<number | null>(
    null,
  );
  const [editContactPhoneError, setEditContactPhoneError] = useState<
    string | null
  >(null);
  const [newContactPhoneError, setNewContactPhoneError] = useState<
    string | null
  >(null);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Company name is required";
    }

    if (!formData.slug.trim()) {
      newErrors.slug = "Slug is required";
    } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(formData.slug)) {
      newErrors.slug = "Slug must contain only lowercase letters, numbers, and hyphens";
    }

    // Admin user validation - required for creating a functional company
    if (!formData.admin_email?.trim()) {
      newErrors.admin_email = "Admin email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) {
      newErrors.admin_email = "Please enter a valid email address";
    }

    if (!formData.admin_password?.trim()) {
      newErrors.admin_password = "Admin password is required";
    } else if (formData.admin_password.length < 8) {
      newErrors.admin_password = "Password must be at least 8 characters";
    }

    if (!formData.admin_first_name?.trim()) {
      newErrors.admin_first_name = "Admin first name is required";
    }

    if (!formData.admin_last_name?.trim()) {
      newErrors.admin_last_name = "Admin last name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Create Company">
      <form onSubmit={handleFormSubmit} noValidate>
        <div className="px-6 py-4 space-y-4">
          {/* Error Alert */}
          {showErrors && Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Please fix the following errors:
                  </h3>
                  <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                    {Object.values(errors).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${
                  showErrors && errors.name
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (showErrors && errors.name && e.target.value.trim()) {
                    setErrors((prev) => {
                      const { name, ...rest } = prev;
                      return rest;
                    });
                  }
                }}
              />
              {showErrors && errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Slug <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${
                  showErrors && errors.slug
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
                value={formData.slug}
                onChange={(e) => {
                  const slug = e.target.value.toLowerCase();
                  setFormData({ ...formData, slug });
                  if (showErrors && errors.slug) {
                    if (slug.trim() && /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
                      setErrors((prev) => {
                        const { slug, ...rest } = prev;
                        return rest;
                      });
                    }
                  }
                }}
              />
              {showErrors && errors.slug && (
                <p className="mt-1 text-sm text-red-600">{errors.slug}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Lowercase letters, numbers, and hyphens only. Used in the portal URL.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Website
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                placeholder="www.example.com"
                value={formData.website}
                onChange={(e) =>
                  setFormData({ ...formData, website: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                VAT Number
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.vat_number}
                onChange={(e) =>
                  setFormData({ ...formData, vat_number: e.target.value })
                }
              />
            </div>
          </div>

          {/* Address */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Address</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Street Address
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
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
            </div>
          </div>

          {/* Contact Persons */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Contact Persons
            </h4>

            {/* Existing contacts */}
            {formData.contact_persons &&
              formData.contact_persons.length > 0 && (
                <div className="mb-4 space-y-2">
                  {formData.contact_persons.map((contact, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                    >
                      {editingContactIndex === index ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                First Name *
                              </label>
                              <input
                                type="text"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                value={contact.first_name}
                                onChange={(e) =>
                                  updateContact(index, {
                                    ...contact,
                                    first_name: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Last Name *
                              </label>
                              <input
                                type="text"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                value={contact.last_name}
                                onChange={(e) =>
                                  updateContact(index, {
                                    ...contact,
                                    last_name: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Role
                              </label>
                              <input
                                type="text"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                value={contact.role || ""}
                                onChange={(e) =>
                                  updateContact(index, {
                                    ...contact,
                                    role: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Email
                              </label>
                              <input
                                type="email"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                value={contact.email || ""}
                                onChange={(e) =>
                                  updateContact(index, {
                                    ...contact,
                                    email: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Phone
                              </label>
                              <input
                                type="tel"
                                placeholder="+491234545 or 00491234566"
                                className={`w-full border ${editContactPhoneError ? "border-red-300" : "border-gray-300"} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                                value={contact.phone || ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  updateContact(index, {
                                    ...contact,
                                    phone: value,
                                  });
                                  setEditContactPhoneError(validatePhone(value));
                                }}
                              />
                              {editContactPhoneError && (
                                <p className="mt-1 text-xs text-red-600">
                                  {editContactPhoneError}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingContactIndex(null);
                                setEditContactPhoneError(null);
                              }}
                              disabled={!!editContactPhoneError}
                              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
                              </span>
                              {contact.role && (
                                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                                  {contact.role}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-sm text-gray-500 space-x-3">
                              {contact.email && <span>{contact.email}</span>}
                              {contact.phone && <span>{contact.phone}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingContactIndex(index)}
                              className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                              title="Edit"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteContactIndex(index)}
                              className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                              title="Delete"
                            >
                              <svg
                                className="w-4 h-4"
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
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            {/* Add new contact */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="text-sm font-medium text-blue-900 mb-3">
                Add New Contact
              </h5>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    placeholder="First name"
                    className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={newContact.first_name}
                    onChange={(e) =>
                      setNewContact({ ...newContact, first_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Last name"
                    className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={newContact.last_name}
                    onChange={(e) =>
                      setNewContact({ ...newContact, last_name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Role
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Manager, Technical"
                    className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={newContact.role}
                    onChange={(e) =>
                      setNewContact({ ...newContact, role: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={newContact.email}
                    onChange={(e) =>
                      setNewContact({ ...newContact, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="+491234545 or 00491234566"
                    className={`w-full border ${newContactPhoneError ? "border-red-300" : "border-gray-300"} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
                    value={newContact.phone}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewContact({ ...newContact, phone: value });
                      setNewContactPhoneError(validatePhone(value));
                    }}
                  />
                  {newContactPhoneError && (
                    <p className="mt-1 text-xs text-red-600">
                      {newContactPhoneError}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={addContact}
                  disabled={!newContact.first_name.trim() || !newContact.last_name.trim() || !!newContactPhoneError}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-4 h-4 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Contact
                </button>
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700">
              Comments / Notes
            </label>
            <RichTextEditor
              value={formData.comments}
              onChange={(html) =>
                setFormData({ ...formData, comments: html })
              }
              rows={3}
            />
          </div>

          {/* Admin User */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Admin User
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              An admin user is required to manage the company.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Admin Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${
                    showErrors && errors.admin_email
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  value={formData.admin_email}
                  onChange={(e) => {
                    setFormData({ ...formData, admin_email: e.target.value });
                    if (showErrors && errors.admin_email) {
                      const value = e.target.value.trim();
                      if (value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                        setErrors((prev) => {
                          const { admin_email, ...rest } = prev;
                          return rest;
                        });
                      }
                    }
                  }}
                />
                {showErrors && errors.admin_email && (
                  <p className="mt-1 text-sm text-red-600">{errors.admin_email}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Admin Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  minLength={8}
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${
                    showErrors && errors.admin_password
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  value={formData.admin_password}
                  onChange={(e) => {
                    setFormData({ ...formData, admin_password: e.target.value });
                    if (showErrors && errors.admin_password) {
                      if (e.target.value.trim() && e.target.value.length >= 8) {
                        setErrors((prev) => {
                          const { admin_password, ...rest } = prev;
                          return rest;
                        });
                      }
                    }
                  }}
                />
                {showErrors && errors.admin_password && (
                  <p className="mt-1 text-sm text-red-600">{errors.admin_password}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Admin First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${
                    showErrors && errors.admin_first_name
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  value={formData.admin_first_name}
                  onChange={(e) => {
                    setFormData({ ...formData, admin_first_name: e.target.value });
                    if (showErrors && errors.admin_first_name && e.target.value.trim()) {
                      setErrors((prev) => {
                        const { admin_first_name, ...rest } = prev;
                        return rest;
                      });
                    }
                  }}
                />
                {showErrors && errors.admin_first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.admin_first_name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Admin Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${
                    showErrors && errors.admin_last_name
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  value={formData.admin_last_name}
                  onChange={(e) => {
                    setFormData({ ...formData, admin_last_name: e.target.value });
                    if (showErrors && errors.admin_last_name && e.target.value.trim()) {
                      setErrors((prev) => {
                        const { admin_last_name, ...rest } = prev;
                        return rest;
                      });
                    }
                  }}
                />
                {showErrors && errors.admin_last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.admin_last_name}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? "Creating..." : "Create"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={deleteContactIndex !== null}
        title="Delete Contact"
        message={`Are you sure you want to delete "${deleteContactIndex !== null ? `${formData.contact_persons?.[deleteContactIndex]?.first_name ?? ""} ${formData.contact_persons?.[deleteContactIndex]?.last_name ?? ""}`.trim() : ""}"?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteContactIndex !== null) removeContact(deleteContactIndex);
          setDeleteContactIndex(null);
        }}
        onCancel={() => setDeleteContactIndex(null)}
      />
    </Modal>
  );
}
