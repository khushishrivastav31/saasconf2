import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import Modal from '../../components/Modal';
import LocationTree from '../../components/LocationTree';
import LocationDetailPanel from '../../components/LocationDetailPanel';
import type { LocationUpdateData } from '../../components/LocationDetailPanel';
import ContactPersonList from '../../components/ContactPersonList';
import RichTextEditor from '../../components/common/RichTextEditor';
import type {
  Location,
  LocationCreate,
  LocationContactPerson,
  LocationStats,
  TenantLocationType,
  Conference,
  PaginatedResponse,
} from '../../types';

export default function Locations() {
  const isAdmin = useIsAdmin();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [expandedConferences, setExpandedConferences] = useState<Set<string>>(new Set());
  const [treeSearchQuery, setTreeSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const queryClient = useQueryClient();

  const { data: conferences } = useQuery({
    queryKey: ['conferences-for-select'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Conference>>('/conferences?page_size=100');
      return response.data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['location-stats'],
    queryFn: async () => {
      const response = await api.get<LocationStats>('/locations/stats');
      return response.data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['locations', typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set('location_type', typeFilter);
      const response = await api.get<PaginatedResponse<Location>>(`/locations?${params}`);
      return response.data;
    },
  });

  const selectedLocation = useMemo(
    () => data?.items.find((loc) => loc.id === selectedLocationId) || null,
    [data, selectedLocationId]
  );

  const createMutation = useMutation({
    mutationFn: async (data: LocationCreate) => {
      const response = await api.post<Location>('/locations', data);
      return response.data;
    },
    onSuccess: (newLocation) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['location-stats'] });
      setIsCreateModalOpen(false);
      setSelectedLocationId(newLocation.id);
      if (newLocation.conference_ids?.length) {
        setExpandedConferences((prev) => {
          const next = new Set(prev);
          for (const cid of newLocation.conference_ids) next.add(cid);
          return next;
        });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: LocationUpdateData }) => {
      const response = await api.put<Location>(`/locations/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['location-stats'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['location-stats'] });
      setSelectedLocationId(null);
    },
  });

  const handleToggleConference = (conferenceId: string) => {
    setExpandedConferences((prev) => {
      const next = new Set(prev);
      if (next.has(conferenceId)) {
        next.delete(conferenceId);
      } else {
        next.add(conferenceId);
      }
      return next;
    });
  };

  const handleSelectLocation = (location: Location) => {
    setSelectedLocationId(location.id);
    if (location.conference_ids?.length) {
      setExpandedConferences((prev) => {
        const next = new Set(prev);
        for (const cid of location.conference_ids) next.add(cid);
        return next;
      });
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Locations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage venues, rooms, and spaces for your conferences
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Add Location
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
          <StatCard label="Total" value={stats.total} />
          {stats.type_counts.map((tc) => (
            <StatCard key={tc.slug} label={tc.name} value={tc.count} />
          ))}
          <StatCard label="Capacity" value={stats.total_capacity} />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Types</option>
        </select>
      </div>

      {/* Master-Detail Layout */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 320px)' }}>
          {/* Left: Tree panel */}
          <div className="w-72 flex-shrink-0">
            <div
              className="bg-white dark:bg-gray-800 rounded-lg shadow sticky top-24 flex flex-col"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            >
              <LocationTree
                mode="multi-conference"
                conferences={conferences?.items || []}
                locations={data?.items || []}
                expandedConferences={expandedConferences}
                onToggleConference={handleToggleConference}
                selectedLocationId={selectedLocationId}
                onSelectLocation={handleSelectLocation}
                searchQuery={treeSearchQuery}
                onSearchChange={setTreeSearchQuery}
                typeMap={{}}
              />
            </div>
          </div>

          {/* Right: Detail panel */}
          <div className="flex-1 min-w-0">
            {selectedLocation ? (
              <LocationDetailPanel
                location={selectedLocation}
                onSave={
                  isAdmin
                    ? async (data) => {
                        await updateMutation.mutateAsync({ id: selectedLocation.id, data });
                      }
                    : undefined
                }
                onDelete={isAdmin ? (id) => deleteMutation.mutate(id) : undefined}
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col items-center justify-center h-full py-16 text-center">
                <svg
                  className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4"
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
                  Choose a location from the tree to view and edit its details
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <CreateLocationModal
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  const colorClasses: Record<string, string> = {
    primary: 'text-primary-600',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${colorClasses.primary}`}>{value}</p>
    </div>
  );
}

function CreateLocationModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: LocationCreate) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<LocationCreate>({
    name: '',
    code: '',
    location_type: 'room',
    description: '',
    capacity: undefined,
    building: '',
    floor: '',
    city: '',
    virtual_url: '',
    virtual_platform: '',
    contact_persons: [],
    conference_id: '',
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });

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

  const { data: conferences } = useQuery({
    queryKey: ['conferences-for-select'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Conference>>('/conferences?page_size=100');
      return response.data;
    },
  });

  const { data: locationTypesData } = useQuery({
    queryKey: ['location-types', formData.conference_id],
    queryFn: async () => {
      const response = await api.get<{
        items: TenantLocationType[];
        total: number;
      }>(`/conferences/${formData.conference_id}/settings/location-types`);
      return response.data;
    },
    enabled: !!formData.conference_id,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...formData };
    if (newContact.first_name.trim() && newContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...newContact }];
    }
    onSubmit(finalData);
  };

  const isVirtual = formData.location_type === 'virtual';

  return (
    <Modal open={true} onClose={onClose} title="Add Location">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-5 space-y-4">
          {/* Section: Location Info */}
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
            Location Info
          </h4>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Conference *
            </label>
            <select
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
              value={formData.conference_id}
              onChange={(e) => setFormData({ ...formData, conference_id: e.target.value })}
            >
              <option value="">Select a conference...</option>
              {conferences?.items?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.abbreviation ? ` (${c.abbreviation})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Name *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
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
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Type *
              </label>
              <select
                required
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                value={formData.location_type}
                onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Capacity
              </label>
              <input
                type="number"
                min="0"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                value={formData.capacity || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    capacity: e.target.value ? parseInt(e.target.value) : undefined,
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
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
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
                  type="url"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                  value={formData.virtual_url}
                  onChange={(e) => setFormData({ ...formData, virtual_url: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Building
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
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
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  City
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 sm:text-sm"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
            </div>
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

          {/* Section: Contact Persons */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-4">
              Contact Persons
            </h4>
            <ContactPersonList
              contacts={formData.contact_persons || []}
              newContact={newContact}
              setNewContact={setNewContact}
              addContact={addContact}
              removeContact={removeContact}
              updateContact={updateContact}
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 rounded-b-lg flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? 'Adding...' : 'Add Location'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
