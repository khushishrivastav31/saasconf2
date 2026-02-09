import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../config/api";
import type {
  Conference,
  PaginatedResponse,
  Location,
  LocationCreate,
  LocationContactPerson,
  TenantLocationType,
} from "../../../types";
import { parseApiError } from "../../../utils/apiError";
import LocationDetailPanel from "../../../components/LocationDetailPanel";
import type { LocationUpdateData } from "../../../components/LocationDetailPanel";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ContactPersonList from "../../../components/ContactPersonList";
import RichTextEditor from "../../../components/common/RichTextEditor";
import { ErrorBanner } from "../../../components/common/ErrorBanner";

export default function ConferenceLocationsTab({
  conference,
  selectedLocationId,
  setSelectedLocationId,
  isAdmin,
}: {
  conference: Conference;
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeleteLocationConfirm, setShowDeleteLocationConfirm] =
    useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    location_type: "room" as LocationCreate["location_type"],
    description: "",
    capacity: "" as string | number,
    building: "",
    floor: "",
    city: "",
    virtual_url: "",
    virtual_platform: "",
    contact_persons: [] as LocationContactPerson[],
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    comment: "",
  });

  const addContactToCreate = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [...createForm.contact_persons, { ...newContact }],
      });
      setNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeContactFromCreate = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons.filter((_, i) => i !== index),
    });
  };

  const updateContactInCreate = (
    index: number,
    contact: LocationContactPerson,
  ) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons.map((c, i) =>
        i === index ? contact : c,
      ),
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["conference-locations", conference.id],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Location>>(
        `/conferences/${conference.id}/locations`,
      );
      return response.data;
    },
  });

  const { data: allLocations } = useQuery({
    queryKey: ["all-locations"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Location>>(
        `/locations?page_size=100`,
      );
      return response.data;
    },
  });

  const { data: locationTypesData } = useQuery({
    queryKey: ["location-types", conference.id],
    queryFn: async () => {
      const response = await api.get<{
        items: TenantLocationType[];
        total: number;
      }>(`/conferences/${conference.id}/settings/location-types`);
      return response.data;
    },
  });

  const selectedLocation = useMemo(
    () => data?.items?.find((loc) => loc.id === selectedLocationId) || null,
    [data, selectedLocationId],
  );

  const linkMutation = useMutation({
    mutationFn: async (locationId: string) => {
      await api.post(`/conferences/${conference.id}/locations`, {
        id: locationId,
      });
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to link location"));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: LocationCreate) => {
      const response = await api.post<Location>("/locations", data);
      return response.data;
    },
    onSuccess: (newLocation) => {
      setLinkError(null);
      setShowCreateForm(false);
      setCreateForm({
        name: "",
        code: "",
        location_type: "room",
        description: "",
        capacity: "",
        building: "",
        floor: "",
        city: "",
        virtual_url: "",
        virtual_platform: "",
        contact_persons: [],
      });
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
      setSelectedLocationId(newLocation.id);
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to create location"));
    },
  });

  const locationUpdateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: LocationUpdateData;
    }) => {
      await api.put(`/locations/${id}`, data);
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to update location"));
    },
  });

  const locationDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/locations/${id}`);
    },
    onSuccess: () => {
      setLinkError(null);
      setSelectedLocationId(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
    },
    onError: (error: unknown) => {
      setLinkError(parseApiError(error, "Failed to delete location"));
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const contacts = [...createForm.contact_persons];
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      contacts.push({ ...newContact });
    }
    const payload: LocationCreate = {
      name: createForm.name,
      location_type: createForm.location_type,
      conference_id: conference.id,
    };
    if (createForm.code) payload.code = createForm.code;
    if (createForm.description) payload.description = createForm.description;
    if (createForm.capacity !== "")
      payload.capacity = Number(createForm.capacity);
    if (createForm.building) payload.building = createForm.building;
    if (createForm.floor) payload.floor = createForm.floor;
    if (createForm.city) payload.city = createForm.city;
    if (createForm.virtual_url) payload.virtual_url = createForm.virtual_url;
    if (createForm.virtual_platform)
      payload.virtual_platform = createForm.virtual_platform;
    if (contacts.length > 0) payload.contact_persons = contacts;
    createMutation.mutate(payload);
  };

  const isVirtual = createForm.location_type === "virtual";

  const linkedIds = new Set(data?.items?.map((l) => l.id) || []);
  const unlinkableLocations =
    allLocations?.items?.filter((l) => !linkedIds.has(l.id)) || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Linked Locations ({data?.total || 0})
        </h4>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {unlinkableLocations.length > 0 && (
              <select
                className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    linkMutation.mutate(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Link existing...</option>
                {unlinkableLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.location_type})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              {showCreateForm ? "Cancel" : "Create New"}
            </button>
          </div>
        )}
      </div>

      <ErrorBanner message={linkError} />

      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Name *
            </label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({ ...createForm, name: e.target.value })
              }
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Code
              </label>
              <input
                type="text"
                value={createForm.code}
                onChange={(e) =>
                  setCreateForm({ ...createForm, code: e.target.value })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Type *
              </label>
              <select
                required
                value={createForm.location_type}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    location_type: e.target
                      .value as LocationCreate["location_type"],
                  })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                {locationTypesData?.items
                  ?.filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Capacity
            </label>
            <input
              type="number"
              min="0"
              value={createForm.capacity}
              onChange={(e) =>
                setCreateForm({ ...createForm, capacity: e.target.value })
              }
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          {isVirtual ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Platform
                </label>
                <select
                  value={createForm.virtual_platform}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      virtual_platform: e.target.value,
                    })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select platform</option>
                  {["zoom", "teams", "meet", "webex", "other"].map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  URL
                </label>
                <input
                  type="url"
                  value={createForm.virtual_url}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      virtual_url: e.target.value,
                    })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Building
                </label>
                <input
                  type="text"
                  value={createForm.building}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, building: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Floor
                </label>
                <input
                  type="text"
                  value={createForm.floor}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, floor: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  City
                </label>
                <input
                  type="text"
                  value={createForm.city}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, city: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Description
            </label>
            <RichTextEditor
              value={createForm.description}
              onChange={(html) =>
                setCreateForm({ ...createForm, description: html })
              }
              rows={2}
            />
          </div>
          {/* Contact Persons */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contact Persons
            </label>
            <ContactPersonList
              contacts={createForm.contact_persons}
              newContact={newContact}
              setNewContact={setNewContact}
              addContact={addContactToCreate}
              removeContact={removeContactFromCreate}
              updateContact={updateContactInCreate}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Location"}
            </button>
          </div>
        </form>
      )}

      {/* Detail Panel (tree is in the sidebar) */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      ) : selectedLocation ? (
        <LocationDetailPanel
          location={selectedLocation}
          onSave={async (updateData) => {
            await locationUpdateMutation.mutateAsync({
              id: selectedLocation.id,
              data: updateData,
            });
          }}
          onDelete={() => setShowDeleteLocationConfirm(true)}
          locationTypes={locationTypesData?.items}
        />
      ) : data?.items && data.items.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg
            className="w-12 h-12 text-gray-300 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-500">Select a location</p>
          <p className="text-xs text-gray-400 mt-1">
            Choose a location from the sidebar to view and edit its details
          </p>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
          No locations linked to this conference yet.
        </div>
      )}

      {selectedLocation && (
        <ConfirmDialog
          open={showDeleteLocationConfirm}
          title="Delete Location"
          message={`Are you sure you want to delete "${selectedLocation.name}"? This will permanently remove it.`}
          confirmLabel="Delete"
          onConfirm={() => {
            locationDeleteMutation.mutate(selectedLocation.id);
            setShowDeleteLocationConfirm(false);
          }}
          onCancel={() => setShowDeleteLocationConfirm(false)}
        />
      )}
    </div>
  );
}
