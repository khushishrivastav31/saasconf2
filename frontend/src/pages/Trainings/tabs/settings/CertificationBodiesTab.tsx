import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  CertificationBody,
  CertificationBodyCreate,
  CertificationBodyUpdate,
  CertificationBodyContact,
} from '../../../../types/training';
import type { LocationContactPerson } from '../../../../types/common';
import { parseApiError } from '../../../../utils/apiError';
import CertificationBodyDetailPanel from '../../../../components/CertificationBodyDetailPanel';
import ContactPersonList from '../../../../components/ContactPersonList';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';

interface CertificationBodyListResponse {
  items: CertificationBody[];
  total: number;
}

const QUERY_KEY = ['certification-bodies'];

export default function CertificationBodiesTab() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState<CertificationBodyCreate>({
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

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<CertificationBodyListResponse>(
        '/trainings/certification-bodies'
      );
      return response.data;
    },
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const selectedBody = items.find((cb) => cb.id === selectedId);

  // Auto-select first item when data loads
  useEffect(() => {
    if (items.length > 0 && !selectedId && !isAdding) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId, isAdding]);

  const createMutation = useMutation({
    mutationFn: async (payload: CertificationBodyCreate) => {
      const res = await api.post<CertificationBody>('/trainings/certification-bodies', payload);
      return res.data;
    },
    onSuccess: (newBody) => {
      setError(null);
      setIsAdding(false);
      setCreateForm({ company_name: '', service_description: '', contact_persons: [] });
      setCreateNewContact({ first_name: '', last_name: '', email: '', phone: '', comment: '' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setSelectedId(newBody.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create certification body'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: payload }: { id: string; data: CertificationBodyUpdate }) => {
      await api.put(`/trainings/certification-bodies/${id}`, payload);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update certification body'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/certification-bodies/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete certification body'));
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...createForm };
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...createNewContact } as CertificationBodyContact,
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
          { ...createNewContact } as CertificationBodyContact,
        ],
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
      contact_persons:
        createForm.contact_persons?.map((c, i) =>
          i === index ? (contact as CertificationBodyContact) : c
        ) || [],
    });
  };

  const bodyCount = items.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Certification Bodies
            {bodyCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {bodyCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage certification bodies for your trainings.
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Body
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
            New Certification Body
          </h5>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={createForm.company_name}
                onChange={(e) => setCreateForm({ ...createForm, company_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Service Description
              </label>
              <RichTextEditor
                value={createForm.service_description || ''}
                onChange={(html) => setCreateForm({ ...createForm, service_description: html })}
                rows={2}
              />
            </div>
            <ContactPersonList
              contacts={(createForm.contact_persons || []) as LocationContactPerson[]}
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
                setCreateForm({ company_name: '', service_description: '', contact_persons: [] });
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
      ) : items.length > 0 ? (
        <div className="flex gap-6">
          {/* Body List */}
          <div className="w-64 shrink-0">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Bodies
                </h5>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
                {items.map((cb) => (
                  <li key={cb.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(cb.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                        cb.id === selectedId
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="shrink-0 w-2 h-2 rounded-full bg-primary-400" />
                      <span className="truncate">{cb.company_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Detail Panel */}
          <div className="flex-1 min-w-0">
            {selectedBody ? (
              <CertificationBodyDetailPanel
                body={selectedBody}
                onSave={(cbData) => updateMutation.mutate({ id: selectedBody.id, data: cbData })}
                onDelete={(id) => deleteMutation.mutate(id)}
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
                  Select a certification body
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Choose a body from the list to view and edit details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            No certification bodies yet. Click "+ Add Body" to get started.
          </div>
        )
      )}
    </div>
  );
}
