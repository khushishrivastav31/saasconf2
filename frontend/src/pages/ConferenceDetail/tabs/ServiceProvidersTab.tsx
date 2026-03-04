import { useState } from 'react';
import { queryKeys } from '../../../config/queryKeys';
import type {
  Conference,
  ServiceProvider,
  ServiceProviderCreate,
  ServiceProviderUpdate,
  LocationContactPerson,
} from '../../../types';
import ServiceProviderDetailPanel from '../../../components/ServiceProviderDetailPanel';
import ContactPersonList from '../../../components/ContactPersonList';
import RichTextEditor from '../../../components/common/RichTextEditor';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useSelection } from '../SelectionContext';
import { useConferenceCrud } from '../../../hooks/api';

export default function ConferenceServiceProvidersTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { selectedServiceProviderId, setSelectedServiceProviderId } = useSelection();
  const [isAdding, setIsAdding] = useState(false);

  // Form state for create
  const [createForm, setCreateForm] = useState<ServiceProviderCreate>({
    company_name: '',
    service_description: '',
    contact_persons: [],
  });
  const [createNewContact, setCreateNewContact] = useState<LocationContactPerson>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    comment: '',
  });

  const { items, isLoading, createMutation, updateMutation, deleteMutation, error } =
    useConferenceCrud<ServiceProvider, ServiceProviderCreate, ServiceProviderUpdate>({
      conferenceId: conference.id,
      endpoint: 'service-providers',
      queryKey: queryKeys.serviceProviders.byConference(conference.id),
      onCreateSuccess: (newProvider) => {
        setIsAdding(false);
        setCreateForm({ company_name: '', service_description: '', contact_persons: [] });
        setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
        setSelectedServiceProviderId(newProvider.id);
      },
      onDeleteSuccess: () => setSelectedServiceProviderId(null),
    });

  const data = { items };
  const selectedProvider = items.find((sp) => sp.id === selectedServiceProviderId);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...createForm };
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      finalData.contact_persons = [...(finalData.contact_persons || []), { ...createNewContact }];
    }
    createMutation.mutate(finalData);
  };

  const addCreateContact = () => {
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [...(createForm.contact_persons || []), { ...createNewContact }],
      });
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const providerCount = data?.items?.length || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Service Providers
            {providerCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {providerCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage service providers for this conference.
          </p>
        </div>
        {isAdmin && !isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
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
          className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4"
        >
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            New Service Provider
          </h5>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Service Description
              </label>
              <RichTextEditor
                value={createForm.service_description || ''}
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
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setCreateForm({
                  company_name: '',
                  service_description: '',
                  contact_persons: [],
                });
                setCreateNewContact({
                  first_name: '',
                  last_name: '',
                  email: '',
                  phone: '',
                  comment: '',
                });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : data?.items && data.items.length > 0 ? (
        <div className="flex gap-6">
          {/* Provider List */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Providers
                </h5>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
                {data.items.map((sp) => (
                  <li key={sp.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedServiceProviderId(sp.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                        sp.id === selectedServiceProviderId
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-400" />
                      <span className="truncate">{sp.company_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Detail Panel */}
          <div className="flex-1 min-w-0">
            {selectedProvider ? (
              <ServiceProviderDetailPanel
                provider={selectedProvider}
                onSave={(spData) =>
                  updateMutation.mutate({ id: selectedProvider.id, data: spData })
                }
                onDelete={isAdmin ? (id) => deleteMutation.mutate(id) : undefined}
                isSaving={updateMutation.isPending}
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
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Select a provider
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Choose a provider from the list to view and edit details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            No service providers yet. Click "+ Add Provider" to get started.
          </div>
        )
      )}
    </div>
  );
}
