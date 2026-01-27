import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../config/api";
import type {
  ServiceProvider,
  ServiceProviderCreate,
  ServiceProviderUpdate,
  LocationContactPerson,
} from "../types";
import AttachmentList from "./AttachmentList";
import ContactPersonList from "./ContactPersonList";
import ConfirmDialog from "./ConfirmDialog";

export default function ServiceProviderSection({
  locationId,
}: {
  locationId: string;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state for create
  const [createForm, setCreateForm] = useState<ServiceProviderCreate>({
    company_name: "",
    service_description: "",
    contact_persons: [],
  });
  const [createNewContact, setCreateNewContact] =
    useState<LocationContactPerson>({
      name: "",
      email: "",
      phone: "",
      comment: "",
    });

  // Form state for edit
  const [editForm, setEditForm] = useState<ServiceProviderUpdate>({});
  const [editNewContact, setEditNewContact] = useState<LocationContactPerson>({
    name: "",
    email: "",
    phone: "",
    comment: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["service-providers", locationId],
    queryFn: async () => {
      const response = await api.get<{
        items: ServiceProvider[];
        total: number;
      }>(`/locations/${locationId}/service-providers`);
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (spData: ServiceProviderCreate) => {
      const response = await api.post<ServiceProvider>(
        `/locations/${locationId}/service-providers`,
        spData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-providers", locationId],
      });
      setIsAdding(false);
      setCreateForm({
        company_name: "",
        service_description: "",
        contact_persons: [],
      });
      setCreateNewContact({ name: "", email: "", phone: "", comment: "" });
      setError(null);
    },
    onError: (err: unknown) => {
      const axiosError = err as {
        response?: { data?: { detail?: string } };
      };
      setError(
        axiosError.response?.data?.detail || "Failed to create service provider"
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data: spData,
    }: {
      id: string;
      data: ServiceProviderUpdate;
    }) => {
      const response = await api.put<ServiceProvider>(
        `/locations/${locationId}/service-providers/${id}`,
        spData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-providers", locationId],
      });
      setEditingId(null);
      setEditForm({});
      setEditNewContact({ name: "", email: "", phone: "", comment: "" });
      setError(null);
    },
    onError: (err: unknown) => {
      const axiosError = err as {
        response?: { data?: { detail?: string } };
      };
      setError(
        axiosError.response?.data?.detail || "Failed to update service provider"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/locations/${locationId}/service-providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-providers", locationId],
      });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...createForm };
    if (createNewContact.name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...createNewContact },
      ];
    }
    createMutation.mutate(finalData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const finalData = { ...editForm };
    if (editNewContact.name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...editNewContact },
      ];
    }
    updateMutation.mutate({ id: editingId, data: finalData });
  };

  const startEdit = (sp: ServiceProvider) => {
    setEditingId(sp.id);
    setEditForm({
      company_name: sp.company_name,
      service_description: sp.service_description || "",
      contact_persons: sp.contact_persons || [],
    });
    setEditNewContact({ name: "", email: "", phone: "", comment: "" });
    setIsAdding(false);
    setError(null);
  };

  const addCreateContact = () => {
    if (createNewContact.name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [
          ...(createForm.contact_persons || []),
          { ...createNewContact },
        ],
      });
      setCreateNewContact({ name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const addEditContact = () => {
    if (editNewContact.name.trim()) {
      setEditForm({
        ...editForm,
        contact_persons: [
          ...(editForm.contact_persons || []),
          { ...editNewContact },
        ],
      });
      setEditNewContact({ name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeEditContact = (index: number) => {
    setEditForm({
      ...editForm,
      contact_persons:
        editForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const updateEditContact = (index: number, contact: LocationContactPerson) => {
    setEditForm({
      ...editForm,
      contact_persons:
        editForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const [deleteTarget, setDeleteTarget] = useState<ServiceProvider | null>(null);

  const providerCount = data?.items?.length || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Service Providers
          {providerCount > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {providerCount}
            </span>
          )}
        </h4>
        {!isAdding && !editingId && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setError(null);
            }}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Provider
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Create form */}
      {isAdding && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-4"
        >
          <h5 className="text-sm font-medium text-gray-900">New Service Provider</h5>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={createForm.company_name}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    company_name: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Description
              </label>
              <textarea
                rows={2}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={createForm.service_description || ""}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    service_description: e.target.value,
                  })
                }
              />
            </div>
            <ContactPersonList
              contacts={createForm.contact_persons || []}
              newContact={createNewContact}
              setNewContact={setCreateNewContact}
              addContact={addCreateContact}
              removeContact={removeCreateContact}
              updateContact={updateCreateContact}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setError(null);
                setCreateForm({
                  company_name: "",
                  service_description: "",
                  contact_persons: [],
                });
                setCreateNewContact({
                  name: "",
                  email: "",
                  phone: "",
                  comment: "",
                });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Provider list */}
      {isLoading ? (
        <div className="text-sm text-gray-500">
          Loading service providers...
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((sp) =>
            editingId === sp.id ? (
              /* Edit form */
              <form
                key={sp.id}
                onSubmit={handleEditSubmit}
                className="bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-4"
              >
                <h5 className="text-sm font-medium text-gray-900">Edit Provider</h5>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={editForm.company_name || ""}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          company_name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Service Description
                    </label>
                    <textarea
                      rows={2}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={editForm.service_description || ""}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          service_description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <ContactPersonList
                    contacts={editForm.contact_persons || []}
                    newContact={editNewContact}
                    setNewContact={setEditNewContact}
                    addContact={addEditContact}
                    removeContact={removeEditContact}
                    updateContact={updateEditContact}
                  />
                </div>

                <AttachmentList
                  entityType="service_provider"
                  entityId={sp.id}
                />

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Display card */
              <div
                key={sp.id}
                className="bg-white border border-gray-200 border-l-4 border-l-primary-300 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h5 className="text-sm font-semibold text-gray-900">
                      {sp.company_name}
                    </h5>
                    {sp.service_description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {sp.service_description}
                      </p>
                    )}
                    {sp.contact_persons && sp.contact_persons.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sp.contact_persons.map((cp, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-xs"
                          >
                            <span className="w-4 h-4 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                              {cp.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium">{cp.name}</span>
                            {cp.email && (
                              <span className="text-gray-500">{cp.email}</span>
                            )}
                            {cp.phone && (
                              <span className="text-gray-500">{cp.phone}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 ml-3 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(sp)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(sp)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <AttachmentList
                  entityType="service_provider"
                  entityId={sp.id}
                />
              </div>
            )
          )}
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            No service providers yet. Click "+ Add Provider" to get started.
          </div>
        )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Service Provider"
        message={`Are you sure you want to delete "${deleteTarget?.company_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
