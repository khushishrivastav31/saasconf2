import { useState, useMemo } from 'react';
import { normalizeUrl } from '../../../../utils/validators';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type {
  PaginatedResponse,
  Location,
  LocationCreate,
  LocationContactPerson,
  TenantLocationType,
} from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import LocationDetailPanel from '../../../../components/LocationDetailPanel';
import type { LocationUpdateData } from '../../../../components/LocationDetailPanel';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import ContactPersonList from '../../../../components/ContactPersonList';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { EmptyState } from '../../../../components/common/EmptyState';

export default function LocationsTab() {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeleteLocationConfirm, setShowDeleteLocationConfirm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    location_type: '',
    description: '',
    capacity: '' as string | number,
    parent_id: '' as string,
    building: '',
    floor: '',
    city: '',
    virtual_url: '',
    virtual_platform: '',
    contact_persons: [] as LocationContactPerson[],
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });

  const addContactToCreate = () => {
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [...createForm.contact_persons, { ...newContact }],
      });
      setNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    }
  };

  const removeContactFromCreate = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons.filter((_, i) => i !== index),
    });
  };

  const updateContactInCreate = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons.map((c, i) => (i === index ? contact : c)),
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.locations.allList,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Location>>('/locations?page_size=100');
      return response.data;
    },
  });

  const { data: locationTypesData } = useQuery({
    queryKey: ['training-location-types'],
    queryFn: async () => {
      const response = await api.get<{ items: TenantLocationType[]; total: number }>(
        '/trainings/location-types'
      );
      return response.data;
    },
    staleTime: 60_000,
  });

  const selectedLocation = useMemo(
    () => data?.items?.find((loc) => loc.id === selectedLocationId) || null,
    [data, selectedLocationId]
  );

  const createMutation = useMutation({
    mutationFn: async (payload: LocationCreate) => {
      const response = await api.post<Location>('/locations', payload);
      return response.data;
    },
    onSuccess: (newLocation) => {
      setError(null);
      setShowCreateForm(false);
      setCreateForm({
        name: '',
        code: '',
        location_type: '',
        description: '',
        capacity: '',
        parent_id: '',
        building: '',
        floor: '',
        city: '',
        virtual_url: '',
        virtual_platform: '',
        contact_persons: [],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.allList });
      queryClient.invalidateQueries({ queryKey: ['locations-list'] });
      setSelectedLocationId(newLocation.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create location'));
    },
  });

  const locationUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: LocationUpdateData }) => {
      await api.put(`/locations/${id}`, data);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.allList });
      queryClient.invalidateQueries({ queryKey: ['locations-list'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update location'));
    },
  });

  const locationDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/locations/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setSelectedLocationId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.allList });
      queryClient.invalidateQueries({ queryKey: ['locations-list'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete location'));
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
    };
    if (createForm.code) payload.code = createForm.code;
    if (createForm.description) payload.description = createForm.description;
    if (createForm.capacity !== '') payload.capacity = Number(createForm.capacity);
    if (createForm.parent_id) payload.parent_id = createForm.parent_id;
    if (createForm.building) payload.building = createForm.building;
    if (createForm.floor) payload.floor = createForm.floor;
    if (createForm.city) payload.city = createForm.city;
    if (createForm.virtual_url) payload.virtual_url = createForm.virtual_url;
    if (createForm.virtual_platform) payload.virtual_platform = createForm.virtual_platform;
    if (contacts.length > 0) payload.contact_persons = contacts;
    createMutation.mutate(payload);
  };

  const isVirtual = createForm.location_type === 'virtual';

  // Organize locations into hierarchy: venues (no parent) and their children
  const locationTree = useMemo(() => {
    if (!data?.items) return [];
    const items = data.items;
    const parentLocations = items.filter((loc) => !loc.parent_id);
    const childrenByParent = new Map<string, Location[]>();

    items.forEach((loc) => {
      if (loc.parent_id) {
        const children = childrenByParent.get(loc.parent_id) || [];
        children.push(loc);
        childrenByParent.set(loc.parent_id, children);
      }
    });

    // Build flat list with hierarchy info
    const result: { location: Location; level: number; hasChildren: boolean }[] = [];
    parentLocations.forEach((parent) => {
      const children = childrenByParent.get(parent.id) || [];
      result.push({ location: parent, level: 0, hasChildren: children.length > 0 });
      children.forEach((child) => {
        result.push({ location: child, level: 1, hasChildren: false });
      });
    });

    // Add orphan children (parent not in current list) at top level
    items.forEach((loc) => {
      if (loc.parent_id && !items.find((p) => p.id === loc.parent_id)) {
        result.push({ location: loc, level: 0, hasChildren: false });
      }
    });

    return result;
  }, [data?.items]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Locations ({data?.total || 0})
        </h4>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          {showCreateForm ? 'Cancel' : 'Create New'}
        </button>
      </div>

      <ErrorBanner message={error} />

      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Code
              </label>
              <input
                type="text"
                value={createForm.code}
                onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Type *
              </label>
              <select
                required
                value={createForm.location_type}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    location_type: e.target.value as LocationCreate['location_type'],
                  })
                }
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select type...</option>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Parent Location
              </label>
              <select
                value={createForm.parent_id}
                onChange={(e) => setCreateForm({ ...createForm, parent_id: e.target.value })}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">None (top-level venue)</option>
                {data?.items
                  ?.filter((loc) => !loc.parent_id) // Only show top-level locations as parents
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                Select a venue if this is a room within it
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Capacity
              </label>
              <input
                type="number"
                min="0"
                value={createForm.capacity}
                onChange={(e) => setCreateForm({ ...createForm, capacity: e.target.value })}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Max attendees</p>
            </div>
          </div>
          {isVirtual ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
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
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select platform</option>
                  {['zoom', 'teams', 'meet', 'webex', 'other'].map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  URL
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={createForm.virtual_url}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      virtual_url: e.target.value,
                    })
                  }
                  onBlur={(e) =>
                    setCreateForm({
                      ...createForm,
                      virtual_url: normalizeUrl(e.target.value),
                    })
                  }
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Building
                </label>
                <input
                  type="text"
                  value={createForm.building}
                  onChange={(e) => setCreateForm({ ...createForm, building: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Floor
                </label>
                <input
                  type="text"
                  value={createForm.floor}
                  onChange={(e) => setCreateForm({ ...createForm, floor: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  City
                </label>
                <input
                  type="text"
                  value={createForm.city}
                  onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <RichTextEditor
              value={createForm.description}
              onChange={(html) => setCreateForm({ ...createForm, description: html })}
              rows={2}
            />
          </div>
          {/* Contact Persons */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              {createMutation.isPending ? 'Creating...' : 'Create Location'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : data?.items && data.items.length > 0 ? (
        <div className="flex gap-6">
          {/* Location List */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Locations
                </h5>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
                {locationTree.map(({ location: loc, level, hasChildren }) => (
                  <li key={loc.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedLocationId(loc.id)}
                      className={`w-full flex items-center gap-2 py-2.5 text-sm text-left transition-colors ${
                        loc.id === selectedLocationId
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      style={{ paddingLeft: level === 0 ? '0.75rem' : '1.75rem' }}
                    >
                      {level === 0 && hasChildren ? (
                        <svg
                          className="flex-shrink-0 w-4 h-4 text-gray-400 dark:text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                      ) : level === 1 ? (
                        <svg
                          className="flex-shrink-0 w-3 h-3 text-gray-300"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      ) : (
                        <span
                          className={`flex-shrink-0 w-2 h-2 rounded-full ${
                            loc.is_active ? 'bg-green-400' : 'bg-red-400'
                          }`}
                        />
                      )}
                      <span className="truncate flex-1">{loc.name}</span>
                      {loc.capacity && (
                        <span className="text-xs text-gray-400 dark:text-gray-500" title="Capacity">
                          {loc.capacity}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-12 text-right">
                        {loc.location_type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Detail Panel */}
          <div className="flex-1 min-w-0">
            {selectedLocation ? (
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
                allLocations={data?.items}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
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
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Select a location
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Choose a location from the list to view and edit its details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <EmptyState
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            }
            title="No locations yet"
            description="Create locations to manage venues and rooms for your trainings."
          />
        </div>
      )}

      {selectedLocation && (
        <ConfirmDialog
          open={showDeleteLocationConfirm}
          title="Delete Location"
          message={`Are you sure you want to delete "${selectedLocation.name}"? This will remove it from all training placements.`}
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
