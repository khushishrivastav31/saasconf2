import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../config/api";
import ConfirmDialog from "../../components/ConfirmDialog";
import type {
  Tenant,
  TenantCreate,
  TenantUpdate,
  ContactPerson,
  PaginatedResponse,
  Module,
  TenantModule,
  TenantModuleAssign,
  TenantModuleUpdate,
  TenantUser,
  TenantUserCreate,
  TenantUserUpdate,
} from "../../types";

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
    admin_name: "",
  });

  const [newContact, setNewContact] = useState<ContactPerson>({
    name: "",
    email: "",
    phone: "",
    role: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const addContact = () => {
    if (newContact.name.trim()) {
      setFormData({
        ...formData,
        contact_persons: [
          ...(formData.contact_persons || []),
          { ...newContact },
        ],
      });
      setNewContact({ name: "", email: "", phone: "", role: "" });
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

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Create Company
            </h3>
          </div>

          <div className="px-6 py-4 space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company Name *
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
                  Slug *
                </label>
                <input
                  type="text"
                  required
                  pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      slug: e.target.value.toLowerCase(),
                    })
                  }
                />
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
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Address
              </h4>
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
                                  Name *
                                </label>
                                <input
                                  type="text"
                                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                  value={contact.name}
                                  onChange={(e) =>
                                    updateContact(index, {
                                      ...contact,
                                      name: e.target.value,
                                    })
                                  }
                                />
                              </div>
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
                                  type="text"
                                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                  value={contact.phone || ""}
                                  onChange={(e) =>
                                    updateContact(index, {
                                      ...contact,
                                      phone: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingContactIndex(null)}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
                                  {contact.name}
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
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteContactIndex(index)}
                                className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                      Name *
                    </label>
                    <input
                      type="text"
                      placeholder="Contact name"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={newContact.name}
                      onChange={(e) =>
                        setNewContact({ ...newContact, name: e.target.value })
                      }
                    />
                  </div>
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
                      type="text"
                      placeholder="+1 234 567 890"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={newContact.phone}
                      onChange={(e) =>
                        setNewContact({ ...newContact, phone: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={addContact}
                    disabled={!newContact.name.trim()}
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
              <textarea
                rows={3}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.comments}
                onChange={(e) =>
                  setFormData({ ...formData, comments: e.target.value })
                }
              />
            </div>

            {/* Admin User */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Admin User (Optional)
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.admin_email}
                    onChange={(e) =>
                      setFormData({ ...formData, admin_email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Admin Password
                  </label>
                  <input
                    type="password"
                    minLength={8}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.admin_password}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        admin_password: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Admin Name
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.admin_name}
                    onChange={(e) =>
                      setFormData({ ...formData, admin_name: e.target.value })
                    }
                  />
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
          message={`Are you sure you want to delete "${deleteContactIndex !== null ? formData.contact_persons?.[deleteContactIndex]?.name : ""}"?`}
          confirmLabel="Delete"
          onConfirm={() => {
            if (deleteContactIndex !== null) removeContact(deleteContactIndex);
            setDeleteContactIndex(null);
          }}
          onCancel={() => setDeleteContactIndex(null)}
        />
      </div>
    </div>
  );
}

function TenantDetailModal({
  tenant,
  onClose,
}: {
  tenant: Tenant;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"info" | "modules" | "users">(
    "info",
  );
  const [isAssignModuleOpen, setIsAssignModuleOpen] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const queryClient = useQueryClient();

  const tabs = [
    { id: "info" as const, name: "Company Info" },
    { id: "modules" as const, name: "Modules" },
    { id: "users" as const, name: "Users" },
  ];

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{tenant.name}</h3>
            <p className="text-sm text-gray-500">{tenant.slug}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "info" && (
            <CompanyInfoTab
              tenant={tenant}
              onUpdate={() => {
                queryClient.invalidateQueries({ queryKey: ["tenants"] });
              }}
            />
          )}
          {activeTab === "modules" && (
            <ModulesTab
              tenantId={tenant.id}
              onAssignModule={() => setIsAssignModuleOpen(true)}
            />
          )}
          {activeTab === "users" && (
            <UsersTab
              tenantId={tenant.id}
              onAddUser={() => setIsAddUserOpen(true)}
            />
          )}
        </div>

        {/* Assign Module Modal */}
        {isAssignModuleOpen && (
          <AssignModuleModal
            tenantId={tenant.id}
            onClose={() => {
              setIsAssignModuleOpen(false);
              queryClient.invalidateQueries({
                queryKey: ["tenant-modules", tenant.id],
              });
            }}
          />
        )}

        {/* Add User Modal */}
        {isAddUserOpen && (
          <AddUserModal
            tenantId={tenant.id}
            onClose={() => {
              setIsAddUserOpen(false);
              queryClient.invalidateQueries({
                queryKey: ["tenant-users", tenant.id],
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function CompanyInfoTab({
  tenant,
  onUpdate,
}: {
  tenant: Tenant;
  onUpdate: () => void;
}) {
  const [formData, setFormData] = useState<TenantUpdate>({
    name: tenant.name,
    address: tenant.address || "",
    postal_code: tenant.postal_code || "",
    city: tenant.city || "",
    country: tenant.country || "",
    vat_number: tenant.vat_number || "",
    website: tenant.website || "",
    contact_persons: tenant.contact_persons || [],
    comments: tenant.comments || "",
  });

  const [newContact, setNewContact] = useState<ContactPerson>({
    name: "",
    email: "",
    phone: "",
    role: "",
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUpdate) => {
      await api.put(`/admin/tenants/${tenant.id}`, data);
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: () => {
      setSaveStatus("saved");
      onUpdate();
      // Reset status after 2 seconds
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  // Auto-save when form data changes (with debounce)
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const handleFieldChange = (
    field: keyof TenantUpdate,
    value: string | undefined,
  ) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Set new timeout for auto-save (500ms debounce)
    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setSaveTimeout(timeout);
  };

  const addContact = () => {
    if (newContact.name.trim()) {
      const newContacts = [
        ...(formData.contact_persons || []),
        { ...newContact },
      ];
      setFormData({ ...formData, contact_persons: newContacts });
      setNewContact({ name: "", email: "", phone: "", role: "" });
      // Save immediately when adding contact
      updateMutation.mutate({ ...formData, contact_persons: newContacts });
    }
  };

  const removeContact = (index: number) => {
    const newContacts =
      formData.contact_persons?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, contact_persons: newContacts });
    // Save immediately when removing contact
    updateMutation.mutate({ ...formData, contact_persons: newContacts });
  };

  const updateContact = (index: number, contact: ContactPerson) => {
    const newContacts =
      formData.contact_persons?.map((c, i) => (i === index ? contact : c)) ||
      [];
    setFormData({ ...formData, contact_persons: newContacts });
    updateMutation.mutate({ ...formData, contact_persons: newContacts });
  };

  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(
    null,
  );
  const [deleteContactIndex, setDeleteContactIndex] = useState<number | null>(
    null,
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">Company Details</h4>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="animate-spin h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-600">Save failed</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Website
            </label>
            <input
              type="text"
              placeholder="www.example.com"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.website}
              onChange={(e) => handleFieldChange("website", e.target.value)}
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
              onChange={(e) => handleFieldChange("vat_number", e.target.value)}
            />
          </div>
        </div>

        {/* Address */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-2">Address</h5>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Street Address"
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.address}
              onChange={(e) => handleFieldChange("address", e.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Postal Code"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.postal_code}
                onChange={(e) =>
                  handleFieldChange("postal_code", e.target.value)
                }
              />
              <input
                type="text"
                placeholder="City"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.city}
                onChange={(e) => handleFieldChange("city", e.target.value)}
              />
              <input
                type="text"
                placeholder="Country"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.country}
                onChange={(e) => handleFieldChange("country", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Contact Persons */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-2">
            Contact Persons
          </h5>

          {formData.contact_persons && formData.contact_persons.length > 0 && (
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
                            Name *
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                            value={contact.name}
                            onChange={(e) =>
                              updateContact(index, {
                                ...contact,
                                name: e.target.value,
                              })
                            }
                          />
                        </div>
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
                            type="text"
                            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                            value={contact.phone || ""}
                            onChange={(e) =>
                              updateContact(index, {
                                ...contact,
                                phone: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingContactIndex(null)}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
                            {contact.name}
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
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteContactIndex(index)}
                          className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
            <h6 className="text-sm font-medium text-blue-900 mb-3">
              Add New Contact
            </h6>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  placeholder="Contact name"
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={newContact.name}
                  onChange={(e) =>
                    setNewContact({ ...newContact, name: e.target.value })
                  }
                />
              </div>
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
                  type="text"
                  placeholder="+1 234 567 890"
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={newContact.phone}
                  onChange={(e) =>
                    setNewContact({ ...newContact, phone: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={addContact}
                disabled={!newContact.name.trim()}
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
        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Comments / Notes
          </label>
          <textarea
            rows={3}
            className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.comments}
            onChange={(e) => handleFieldChange("comments", e.target.value)}
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteContactIndex !== null}
        title="Delete Contact"
        message={`Are you sure you want to delete "${deleteContactIndex !== null ? formData.contact_persons?.[deleteContactIndex]?.name : ""}"?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteContactIndex !== null) removeContact(deleteContactIndex);
          setDeleteContactIndex(null);
        }}
        onCancel={() => setDeleteContactIndex(null)}
      />
    </div>
  );
}

function ModulesTab({
  tenantId,
  onAssignModule,
}: {
  tenantId: string;
  onAssignModule: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingModule, setEditingModule] = useState<TenantModule | null>(null);

  const { data: modules, isLoading } = useQuery({
    queryKey: ["tenant-modules", tenantId],
    queryFn: async () => {
      const response = await api.get<TenantModule[]>(
        `/admin/tenants/${tenantId}/modules`,
      );
      return response.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      await api.delete(`/admin/tenants/${tenantId}/modules/${moduleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-modules", tenantId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">Assigned Modules</h4>
        <button
          onClick={onAssignModule}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-primary-600 hover:bg-primary-700"
        >
          Assign Module
        </button>
      </div>

      {modules && modules.length > 0 ? (
        <div className="space-y-3">
          {modules.map((tm) => (
            <div key={tm.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h5 className="font-medium text-gray-900">
                      {tm.module_name}
                    </h5>
                    <span
                      className={`px-2 text-xs font-semibold rounded-full ${
                        tm.is_active_subscription
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {tm.is_active_subscription ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{tm.module_code}</p>

                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Start:</span>{" "}
                      {tm.start_date
                        ? new Date(tm.start_date).toLocaleDateString()
                        : "Not set"}
                    </div>
                    <div>
                      <span className="text-gray-500">End:</span>{" "}
                      {tm.end_date
                        ? new Date(tm.end_date).toLocaleDateString()
                        : "No expiry"}
                    </div>
                    <div>
                      <span className="text-gray-500">Price:</span>{" "}
                      {tm.price ? `${tm.price} ${tm.currency}` : "Free"}
                    </div>
                  </div>

                  {/* Show the relevant resource limit based on module code */}
                  {(() => {
                    const code = tm.module_code?.toLowerCase();
                    let limitLabel = "";
                    let limitValue: number | null = null;

                    if (code === "cfp" && tm.max_papers) {
                      limitLabel = "Max Papers";
                      limitValue = tm.max_papers;
                    } else if (code === "speakers" && tm.max_speakers) {
                      limitLabel = "Max Speakers";
                      limitValue = tm.max_speakers;
                    } else if (code === "attendees" && tm.max_attendees) {
                      limitLabel = "Max Attendees";
                      limitValue = tm.max_attendees;
                    } else if (code === "volunteers" && tm.max_volunteers) {
                      limitLabel = "Max Volunteers";
                      limitValue = tm.max_volunteers;
                    }

                    return limitValue ? (
                      <div className="mt-2">
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {limitLabel}: {limitValue}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingModule(tm)}
                    className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => revokeMutation.mutate(tm.module_id)}
                    disabled={revokeMutation.isPending}
                    className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                    title="Revoke"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center py-8">
          No modules assigned yet.
        </p>
      )}

      {/* Edit Module Modal */}
      {editingModule && (
        <EditModuleModal
          tenantId={tenantId}
          module={editingModule}
          onClose={() => {
            setEditingModule(null);
            queryClient.invalidateQueries({
              queryKey: ["tenant-modules", tenantId],
            });
          }}
        />
      )}
    </div>
  );
}

function UsersTab({
  tenantId,
  onAddUser,
}: {
  tenantId: string;
  onAddUser: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-users", tenantId],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<TenantUser>>(
        `/users?tenant_id=${tenantId}`,
      );
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-users", tenantId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">Users</h4>
        <button
          onClick={onAddUser}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-primary-600 hover:bg-primary-700"
        >
          Add User
        </button>
      </div>

      {data && data.items.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.items.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {user.full_name || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="capitalize">
                      {user.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(user)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Deactivate"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-center py-8">No users found.</p>
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => {
            setEditingUser(null);
            queryClient.invalidateQueries({
              queryKey: ["tenant-users", tenantId],
            });
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Deactivate User"
        message={`Are you sure you want to deactivate "${deleteTarget?.email}"? The user will no longer be able to log in.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
}: {
  user: TenantUser;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<TenantUserUpdate>({
    email: user.email,
    full_name: user.full_name || "",
    role: user.role,
    is_active: user.is_active,
  });
  const [newPassword, setNewPassword] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (data: TenantUserUpdate) => {
      await api.put(`/users/${user.id}`, data);
    },
    onMutate: () => {
      setSaveStatus("saving");
      setErrorMessage("");
    },
    onSuccess: () => {
      setSaveStatus("saved");
      setNewPassword("");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (error: unknown) => {
      setSaveStatus("error");
      const err = error as { response?: { data?: { detail?: string } } };
      setErrorMessage(
        err.response?.data?.detail || "Failed to update user",
      );
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const handleSave = () => {
    const data: TenantUserUpdate = { ...formData };
    if (newPassword.trim()) {
      data.password = newPassword.trim();
    }
    updateMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Edit User</h3>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === "saving" && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <svg
                  className="animate-spin h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-600">Save failed</span>
            )}
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Full Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.full_name}
              onChange={(e) =>
                setFormData({ ...formData, full_name: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as "tenant_admin" | "user",
                })
              }
            >
              <option value="user">User</option>
              <option value="tenant_admin">Tenant Admin</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Active
            </label>
            <button
              type="button"
              onClick={() =>
                setFormData({ ...formData, is_active: !formData.is_active })
              }
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                formData.is_active ? "bg-primary-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  formData.is_active ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <input
              type="password"
              minLength={8}
              placeholder="Leave empty to keep current password"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Minimum 8 characters. Only fill in to change the password.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={
              updateMutation.isPending ||
              (newPassword.length > 0 && newPassword.length < 8)
            }
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignModuleModal({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<TenantModuleAssign>({
    module_id: "",
    config: {},
    start_date: "",
    end_date: "",
    price: undefined,
    currency: "USD",
    max_papers: undefined,
    max_speakers: undefined,
    max_attendees: undefined,
    max_volunteers: undefined,
  });

  const { data: availableModules } = useQuery({
    queryKey: ["modules"],
    queryFn: async () => {
      const response =
        await api.get<PaginatedResponse<Module>>("/admin/modules");
      return response.data;
    },
  });

  const { data: assignedModules } = useQuery({
    queryKey: ["tenant-modules", tenantId],
    queryFn: async () => {
      const response = await api.get<TenantModule[]>(
        `/admin/tenants/${tenantId}/modules`,
      );
      return response.data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (data: TenantModuleAssign) => {
      // Convert date strings to ISO datetime format for the backend
      const payload = {
        module_id: data.module_id,
        config: data.config || {},
        start_date: data.start_date
          ? new Date(data.start_date).toISOString()
          : null,
        end_date: data.end_date ? new Date(data.end_date).toISOString() : null,
        price: data.price ?? null,
        currency: data.currency || "USD",
        max_papers: data.max_papers ?? null,
        max_speakers: data.max_speakers ?? null,
        max_attendees: data.max_attendees ?? null,
        max_volunteers: data.max_volunteers ?? null,
      };
      await api.post(`/admin/tenants/${tenantId}/modules`, payload);
    },
    onSuccess: () => {
      onClose();
    },
    onError: (error: Error) => {
      console.error("Failed to assign module:", error);
      alert("Failed to assign module. Please try again.");
    },
  });

  const assignedModuleIds = assignedModules?.map((m) => m.module_id) || [];
  const unassignedModules =
    availableModules?.items.filter((m) => !assignedModuleIds.includes(m.id)) ||
    [];

  // Get the selected module's code
  const selectedModule = unassignedModules.find(
    (m) => m.id === formData.module_id,
  );
  const selectedModuleCode = selectedModule?.code?.toLowerCase();

  // Determine which resource limit to show based on module code
  const showMaxPapers = selectedModuleCode === "cfp";
  const showMaxSpeakers = selectedModuleCode === "speakers";
  const showMaxAttendees = selectedModuleCode === "attendees";
  const showMaxVolunteers = selectedModuleCode === "volunteers";
  const showResourceLimits =
    showMaxPapers || showMaxSpeakers || showMaxAttendees || showMaxVolunteers;

  // Get the appropriate label for the resource limit
  const getResourceLimitLabel = () => {
    if (showMaxPapers) return "Max Papers";
    if (showMaxSpeakers) return "Max Speakers";
    if (showMaxAttendees) return "Max Attendees";
    if (showMaxVolunteers) return "Max Volunteers";
    return "";
  };

  const getResourceLimitValue = () => {
    if (showMaxPapers) return formData.max_papers;
    if (showMaxSpeakers) return formData.max_speakers;
    if (showMaxAttendees) return formData.max_attendees;
    if (showMaxVolunteers) return formData.max_volunteers;
    return undefined;
  };

  const setResourceLimitValue = (value: number | undefined) => {
    if (showMaxPapers) setFormData({ ...formData, max_papers: value });
    else if (showMaxSpeakers) setFormData({ ...formData, max_speakers: value });
    else if (showMaxAttendees)
      setFormData({ ...formData, max_attendees: value });
    else if (showMaxVolunteers)
      setFormData({ ...formData, max_volunteers: value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate(formData);
  };

  // Reset resource limits when module changes
  const handleModuleChange = (moduleId: string) => {
    setFormData({
      ...formData,
      module_id: moduleId,
      config: {},
      max_papers: undefined,
      max_speakers: undefined,
      max_attendees: undefined,
      max_volunteers: undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Assign Module</h3>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Module
              </label>
              <select
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.module_id}
                onChange={(e) => handleModuleChange(e.target.value)}
              >
                <option value="">Select a module</option>
                {unassignedModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Start Date
                </label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  End Date
                </label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Price
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.price || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      price: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Currency
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.currency}
                  onChange={(e) =>
                    setFormData({ ...formData, currency: e.target.value })
                  }
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            {showResourceLimits && (
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                  Resource Limit
                </h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {getResourceLimitLabel()}
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={getResourceLimitValue() || ""}
                    onChange={(e) =>
                      setResourceLimitValue(
                        e.target.value ? parseInt(e.target.value) : undefined,
                      )
                    }
                    placeholder={`Enter maximum number of ${getResourceLimitLabel().toLowerCase().replace("max ", "")}`}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Leave empty for unlimited
                  </p>
                </div>
              </div>
            )}
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
              disabled={assignMutation.isPending || !formData.module_id}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditModuleModal({
  tenantId,
  module,
  onClose,
}: {
  tenantId: string;
  module: TenantModule;
  onClose: () => void;
}) {
  // Helper to format date for input
  const formatDateForInput = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  };

  const [formData, setFormData] = useState<TenantModuleUpdate>({
    is_enabled: module.is_enabled,
    start_date: formatDateForInput(module.start_date),
    end_date: formatDateForInput(module.end_date),
    price: module.price ?? undefined,
    currency: module.currency || "USD",
    max_papers: module.max_papers ?? undefined,
    max_speakers: module.max_speakers ?? undefined,
    max_attendees: module.max_attendees ?? undefined,
    max_volunteers: module.max_volunteers ?? undefined,
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (data: TenantModuleUpdate) => {
      const payload = {
        ...data,
        start_date: data.start_date
          ? new Date(data.start_date).toISOString()
          : null,
        end_date: data.end_date ? new Date(data.end_date).toISOString() : null,
        price: data.price ?? null,
        max_papers: data.max_papers ?? null,
        max_speakers: data.max_speakers ?? null,
        max_attendees: data.max_attendees ?? null,
        max_volunteers: data.max_volunteers ?? null,
      };
      await api.put(
        `/admin/tenants/${tenantId}/modules/${module.module_id}`,
        payload,
      );
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: () => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const handleFieldChange = <K extends keyof TenantModuleUpdate>(
    field: K,
    value: TenantModuleUpdate[K],
  ) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Set new timeout for auto-save (500ms debounce)
    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setSaveTimeout(timeout);
  };

  // Determine which resource limit to show based on module code
  const moduleCode = module.module_code?.toLowerCase();
  const showMaxPapers = moduleCode === "cfp";
  const showMaxSpeakers = moduleCode === "speakers";
  const showMaxAttendees = moduleCode === "attendees";
  const showMaxVolunteers = moduleCode === "volunteers";
  const showResourceLimits =
    showMaxPapers || showMaxSpeakers || showMaxAttendees || showMaxVolunteers;

  const getResourceLimitLabel = () => {
    if (showMaxPapers) return "Max Papers";
    if (showMaxSpeakers) return "Max Speakers";
    if (showMaxAttendees) return "Max Attendees";
    if (showMaxVolunteers) return "Max Volunteers";
    return "";
  };

  const getResourceLimitValue = () => {
    if (showMaxPapers) return formData.max_papers;
    if (showMaxSpeakers) return formData.max_speakers;
    if (showMaxAttendees) return formData.max_attendees;
    if (showMaxVolunteers) return formData.max_volunteers;
    return undefined;
  };

  const setResourceLimitValue = (value: number | undefined) => {
    if (showMaxPapers) handleFieldChange("max_papers", value);
    else if (showMaxSpeakers) handleFieldChange("max_speakers", value);
    else if (showMaxAttendees) handleFieldChange("max_attendees", value);
    else if (showMaxVolunteers) handleFieldChange("max_volunteers", value);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Edit Module: {module.module_name}
            </h3>
            <p className="text-sm text-gray-500">{module.module_code}</p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === "saving" && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <svg
                  className="animate-spin h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-600">Save failed</span>
            )}
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Module Enabled
            </label>
            <button
              type="button"
              onClick={() =>
                handleFieldChange("is_enabled", !formData.is_enabled)
              }
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                formData.is_enabled ? "bg-primary-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  formData.is_enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.start_date || ""}
                onChange={(e) =>
                  handleFieldChange("start_date", e.target.value || undefined)
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.end_date || ""}
                onChange={(e) =>
                  handleFieldChange("end_date", e.target.value || undefined)
                }
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.price ?? ""}
                onChange={(e) =>
                  handleFieldChange(
                    "price",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Currency
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.currency || "USD"}
                onChange={(e) => handleFieldChange("currency", e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Resource Limits */}
          {showResourceLimits && (
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Resource Limit
              </h4>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {getResourceLimitLabel()}
                </label>
                <input
                  type="number"
                  min="0"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={getResourceLimitValue() ?? ""}
                  onChange={(e) =>
                    setResourceLimitValue(
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  placeholder={`Enter maximum number of ${getResourceLimitLabel().toLowerCase().replace("max ", "")}`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty for unlimited
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<TenantUserCreate>({
    email: "",
    password: "",
    full_name: "",
    role: "user",
  });

  const createMutation = useMutation({
    mutationFn: async (data: TenantUserCreate) => {
      await api.post(`/users?tenant_id=${tenantId}`, data);
    },
    onSuccess: () => {
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Add User</h3>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as "tenant_admin" | "user",
                  })
                }
              >
                <option value="user">User</option>
                <option value="tenant_admin">Tenant Admin</option>
              </select>
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
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
