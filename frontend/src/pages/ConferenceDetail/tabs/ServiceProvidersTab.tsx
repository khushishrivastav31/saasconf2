import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../config/api";
import { useIsAdmin } from "../../../hooks/useIsAdmin";
import type {
  Conference,
  ServiceProvider,
  ServiceProviderCreate,
  ServiceProviderUpdate,
  LocationContactPerson,
} from "../../../types";
import { parseApiError } from "../../../utils/apiError";
import ServiceProviderDetailPanel from "../../../components/ServiceProviderDetailPanel";
import ContactPersonList from "../../../components/ContactPersonList";
import RichTextEditor from "../../../components/common/RichTextEditor";
import { ErrorBanner } from "../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../components/common/LoadingSpinner";

export default function ConferenceServiceProvidersTab({
  conference,
  selectedServiceProviderId,
  setSelectedServiceProviderId,
}: {
  conference: Conference;
  selectedServiceProviderId: string | null;
  setSelectedServiceProviderId: (id: string | null) => void;
}) {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for create
  const [createForm, setCreateForm] = useState<ServiceProviderCreate>({
    company_name: "",
    service_description: "",
    contact_persons: [],
  });
  const [createNewContact, setCreateNewContact] =
    useState<LocationContactPerson>({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      comment: "",
    });

  const { data, isLoading } = useQuery({
    queryKey: ["conference-service-providers", conference.id],
    queryFn: async () => {
      const response = await api.get<{
        items: ServiceProvider[];
        total: number;
      }>(`/conferences/${conference.id}/service-providers`);
      return response.data;
    },
  });

  const selectedProvider = data?.items?.find(
    (sp) => sp.id === selectedServiceProviderId,
  );

  const createMutation = useMutation({
    mutationFn: async (spData: ServiceProviderCreate) => {
      const response = await api.post<ServiceProvider>(
        `/conferences/${conference.id}/service-providers`,
        spData,
      );
      return response.data;
    },
    onSuccess: (newProvider) => {
      queryClient.invalidateQueries({
        queryKey: ["conference-service-providers", conference.id],
      });
      setIsAdding(false);
      setCreateForm({
        company_name: "",
        service_description: "",
        contact_persons: [],
      });
      setCreateNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
      setError(null);
      setSelectedServiceProviderId(newProvider.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to create service provider"));
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
        `/conferences/${conference.id}/service-providers/${id}`,
        spData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conference-service-providers", conference.id],
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to update service provider"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/service-providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conference-service-providers", conference.id],
      });
      setSelectedServiceProviderId(null);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...createForm };
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...createNewContact },
      ];
    }
    createMutation.mutate(finalData);
  };

  const addCreateContact = () => {
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [
          ...(createForm.contact_persons || []),
          { ...createNewContact },
        ],
      });
      setCreateNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (
    index: number,
    contact: LocationContactPerson,
  ) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.map((c, i) =>
          i === index ? contact : c,
        ) || [],
    });
  };

  const providerCount = data?.items?.length || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Service Providers
            {providerCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                {providerCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">
            Manage service providers for this conference.
          </p>
        </div>
        {isAdmin && !isAdding && (
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

      <ErrorBanner message={error} />

      {/* Create form */}
      {isAdding && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-4"
        >
          <h5 className="text-sm font-medium text-gray-900">
            New Service Provider
          </h5>
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
              <RichTextEditor
                value={createForm.service_description || ""}
                onChange={(html) =>
                  setCreateForm({
                    ...createForm,
                    service_description: html,
                  })
                }
                rows={2}
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
                  first_name: "",
                  last_name: "",
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

      {/* Detail panel or placeholder */}
      {isLoading ? (
        <LoadingSpinner />
      ) : selectedProvider ? (
        <ServiceProviderDetailPanel
          provider={selectedProvider}
          onSave={(spData) =>
            updateMutation.mutate({ id: selectedProvider.id, data: spData })
          }
          onDelete={isAdmin ? (id) => deleteMutation.mutate(id) : undefined}
          isSaving={updateMutation.isPending}
        />
      ) : data?.items && data.items.length > 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <svg
            className="mx-auto h-10 w-10 text-gray-300 mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Select a service provider from the sidebar
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            No service providers yet. Click "+ Add Provider" to get started.
          </div>
        )
      )}
    </div>
  );
}
