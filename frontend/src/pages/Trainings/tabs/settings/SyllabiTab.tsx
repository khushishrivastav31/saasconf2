import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  Syllabus,
  SyllabusCreate,
  SyllabusUpdate,
  CertificationBody,
  TrainingLanguage,
} from '../../../../types/training';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { useToast } from '../../../../components/Toast';
import SyllabusForm from './SyllabusForm';

interface ListResponse<T> {
  items: T[];
  total: number;
}

const QUERY_KEY = ['syllabi'];

const emptyCreate: SyllabusCreate = {
  slug: '',
  name: '',
  description: '',
  price: null,
  exam_cost: null,
  certification_body_id: null,
  language_id: null,
};

export default function SyllabiTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<SyllabusCreate>({ ...emptyCreate });
  const [editForm, setEditForm] = useState<SyllabusUpdate>({});
  const [deleteTarget, setDeleteTarget] = useState<Syllabus | null>(null);

  // Fetch syllabi
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<ListResponse<Syllabus>>('/trainings/syllabi');
      return res.data;
    },
  });

  // Fetch certification bodies for dropdown
  const { data: cbData } = useQuery({
    queryKey: ['certification-bodies'],
    queryFn: async () => {
      const res = await api.get<ListResponse<CertificationBody>>('/trainings/certification-bodies');
      return res.data;
    },
  });

  // Fetch languages for dropdown
  const { data: langData } = useQuery({
    queryKey: ['training-languages'],
    queryFn: async () => {
      const res = await api.get<ListResponse<TrainingLanguage>>('/trainings/languages');
      return res.data;
    },
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const certBodies = cbData?.items || [];
  const languages = langData?.items || [];
  const selectedItem = items.find((s) => s.id === selectedId);

  // Auto-select first item
  useEffect(() => {
    if (items.length > 0 && !selectedId && !isAdding) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId, isAdding]);

  // Sync edit form when selection changes
  useEffect(() => {
    if (selectedItem) {
      setEditForm({
        slug: selectedItem.slug,
        name: selectedItem.name,
        description: selectedItem.description || '',
        price: selectedItem.price,
        exam_cost: selectedItem.exam_cost,
        certification_body_id: selectedItem.certification_body_id,
        language_id: selectedItem.language_id,
      });
    }
  }, [selectedItem]);

  const createMutation = useMutation({
    mutationFn: async (payload: SyllabusCreate) => {
      const res = await api.post<Syllabus>('/trainings/syllabi', payload);
      return res.data;
    },
    onSuccess: (newItem) => {
      setError(null);
      setIsAdding(false);
      setCreateForm({ ...emptyCreate });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setSelectedId(newItem.id);
      showToast('Syllabus created', 'success');
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create syllabus'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: payload }: { id: string; data: SyllabusUpdate }) => {
      await api.put(`/trainings/syllabi/${id}`, payload);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showToast('Syllabus saved', 'success');
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update syllabus'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/syllabi/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showToast('Syllabus deleted', 'success');
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete syllabus'));
      setDeleteTarget(null);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(createForm);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    updateMutation.mutate({ id: selectedItem.id, data: editForm });
  };

  const bodyCount = items.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Syllabus
            {bodyCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {bodyCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage syllabi for your training programmes.
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Syllabus
          </button>
        )}
      </div>

      <ErrorBanner message={error} />

      {/* Create form */}
      {isAdding && (
        <div className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
            New Syllabus
          </h5>
          <SyllabusForm
            form={createForm}
            setForm={(f) => setCreateForm(f as SyllabusCreate)}
            onSubmit={handleCreateSubmit}
            isPending={createMutation.isPending}
            isCreate
            certBodies={certBodies}
            languages={languages}
            onCancelCreate={() => {
              setIsAdding(false);
              setCreateForm({ ...emptyCreate });
            }}
          />
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : items.length > 0 ? (
        <div className="flex gap-6">
          {/* Sidebar list */}
          <div className="w-64 shrink-0">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Syllabi
                </h5>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
                {items.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                        s.id === selectedId
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="shrink-0 w-2 h-2 rounded-full bg-primary-400" />
                      <div className="min-w-0">
                        <span className="block truncate">{s.name}</span>
                        <span className="block truncate text-xs text-gray-400 dark:text-gray-500">
                          {s.slug}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 min-w-0">
            {selectedItem ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {selectedItem.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{selectedItem.slug}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(selectedItem)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                    title="Delete"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5">
                  <SyllabusForm
                    form={editForm}
                    setForm={(f) => setEditForm(f as SyllabusUpdate)}
                    onSubmit={handleEditSubmit}
                    isPending={updateMutation.isPending}
                    isCreate={false}
                    certBodies={certBodies}
                    languages={languages}
                    onCancelCreate={() => {}}
                  />
                </div>
              </div>
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Select a syllabus
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Choose a syllabus from the list to view and edit details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            No syllabi yet. Click "+ Add Syllabus" to get started.
          </div>
        )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Syllabus"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
