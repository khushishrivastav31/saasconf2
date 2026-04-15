import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  Training,
  TrainingCreate,
  TrainingUpdate,
  TrainingLanguage,
  TrainingTheme,
  Syllabus,
  CertificationBody,
} from '../../../../types/training';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import TrainingFilesSection from './TrainingFilesSection';

interface ListResponse<T> {
  items: T[];
  total: number;
}

interface PaginatedResponse<T> extends ListResponse<T> {
  page: number;
  page_size: number;
  pages: number;
}

const QUERY_KEY = ['trainings-catalog'];

const emptyCreate: TrainingCreate = {
  name: '',
  slug: '',
  duration: undefined,
  color: undefined,
  description: '',
  content: '',
  regular_price: null,
  early_bird_price: null,
  language_id: null,
  second_language_id: null,
  syllabus_id: null,
  theme_id: null,
  certification_body_id: null,
};

export default function TrainingsSettingsTab() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<TrainingCreate>({ ...emptyCreate });
  const [editForm, setEditForm] = useState<TrainingUpdate>({});
  const [deleteTarget, setDeleteTarget] = useState<Training | null>(null);
  const [detailTab, setDetailTab] = useState<'details' | 'files'>('details');

  // Fetch trainings
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Training>>('/trainings?page_size=100');
      return res.data;
    },
  });

  // Fetch dropdown data
  const { data: langData } = useQuery({
    queryKey: ['training-languages'],
    queryFn: async () => {
      const res = await api.get<ListResponse<TrainingLanguage>>('/trainings/languages');
      return res.data;
    },
  });

  const { data: themeData } = useQuery({
    queryKey: ['training-themes'],
    queryFn: async () => {
      const res = await api.get<ListResponse<TrainingTheme>>('/trainings/themes');
      return res.data;
    },
  });

  const { data: syllabiData } = useQuery({
    queryKey: ['syllabi'],
    queryFn: async () => {
      const res = await api.get<ListResponse<Syllabus>>('/trainings/syllabi');
      return res.data;
    },
  });

  const { data: cbData } = useQuery({
    queryKey: ['certification-bodies'],
    queryFn: async () => {
      const res = await api.get<ListResponse<CertificationBody>>('/trainings/certification-bodies');
      return res.data;
    },
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const languages = langData?.items || [];
  const themes = themeData?.items || [];
  const syllabi = syllabiData?.items || [];
  const certBodies = cbData?.items || [];
  const selectedItem = items.find((t) => t.id === selectedId);

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
        name: selectedItem.name,
        slug: selectedItem.slug || '',
        duration: selectedItem.duration ?? undefined,
        color: selectedItem.color ?? undefined,
        description: selectedItem.description || '',
        content: selectedItem.content || '',
        regular_price: selectedItem.regular_price,
        early_bird_price: selectedItem.early_bird_price,
        language_id: selectedItem.language_id,
        second_language_id: selectedItem.second_language_id,
        syllabus_id: selectedItem.syllabus_id,
        theme_id: selectedItem.theme_id,
        certification_body_id: selectedItem.certification_body_id,
        is_active: selectedItem.is_active,
      });
    }
  }, [selectedItem]);

  const createMutation = useMutation({
    mutationFn: async (payload: TrainingCreate) => {
      const res = await api.post<Training>('/trainings', payload);
      return res.data;
    },
    onSuccess: (newItem) => {
      setError(null);
      setIsAdding(false);
      setCreateForm({ ...emptyCreate });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setSelectedId(newItem.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create training'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: payload }: { id: string; data: TrainingUpdate }) => {
      await api.put(`/trainings/${id}`, payload);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update training'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete training'));
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

  const inputCls =
    'mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm';
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

  const renderForm = (
    form: TrainingCreate | TrainingUpdate,
    setForm: (f: TrainingCreate | TrainingUpdate) => void,
    onSubmit: (e: React.FormEvent) => void,
    isPending: boolean,
    isCreate: boolean
  ) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Name *</label>
          <input
            type="text"
            required
            className={inputCls}
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Slug</label>
          <input
            type="text"
            className={inputCls}
            value={form.slug || ''}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="e.g. aws-cloud-practitioner"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>Duration (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            className={inputCls}
            value={form.duration ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                duration: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="e.g. 3"
          />
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-[38px] w-12 cursor-pointer rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5"
              value={form.color || '#4F46E5'}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <input
              type="text"
              className={inputCls}
              value={form.color || ''}
              onChange={(e) => setForm({ ...form, color: e.target.value || undefined })}
              placeholder="#4F46E5"
              maxLength={7}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Language</label>
          <select
            className={inputCls}
            value={form.language_id || ''}
            onChange={(e) => setForm({ ...form, language_id: e.target.value || null })}
          >
            <option value="">None</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Second Language</label>
          <select
            className={inputCls}
            value={form.second_language_id || ''}
            onChange={(e) => setForm({ ...form, second_language_id: e.target.value || null })}
          >
            <option value="">None</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Syllabus</label>
          <select
            className={inputCls}
            value={form.syllabus_id || ''}
            onChange={(e) => setForm({ ...form, syllabus_id: e.target.value || null })}
          >
            <option value="">None</option>
            {syllabi.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Theme</label>
          <select
            className={inputCls}
            value={form.theme_id || ''}
            onChange={(e) => setForm({ ...form, theme_id: e.target.value || null })}
          >
            <option value="">None</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.language_name ? ` (${t.language_name})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Certification Body</label>
          <select
            className={inputCls}
            value={form.certification_body_id || ''}
            onChange={(e) => setForm({ ...form, certification_body_id: e.target.value || null })}
          >
            <option value="">None</option>
            {certBodies.map((cb) => (
              <option key={cb.id} value={cb.id}>
                {cb.company_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Regular Price</label>
          <input
            type="number"
            step="any"
            className={inputCls}
            value={form.regular_price ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                regular_price: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Early Bird Price</label>
          <input
            type="number"
            step="any"
            className={inputCls}
            value={form.early_bird_price ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                early_bird_price: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is-active-checkbox"
          checked={'is_active' in form ? ((form as TrainingUpdate).is_active ?? true) : true}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          className="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
        />
        <label htmlFor="is-active-checkbox" className={labelCls}>
          Active
        </label>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <RichTextEditor
          value={form.description || ''}
          onChange={(html) => setForm({ ...form, description: html })}
          rows={3}
        />
      </div>

      <div>
        <label className={labelCls}>Content</label>
        <RichTextEditor
          value={form.content || ''}
          onChange={(html) => setForm({ ...form, content: html })}
          rows={5}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {isPending ? 'Saving...' : isCreate ? 'Create' : 'Save'}
        </button>
        {isCreate && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setCreateForm({ ...emptyCreate });
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  const itemCount = items.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Training Catalog
            {itemCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {itemCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your training catalog entries.
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Training
          </button>
        )}
      </div>

      <ErrorBanner message={error} />

      {/* Create form */}
      {isAdding && (
        <div className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
            New Training
          </h5>
          {renderForm(
            createForm,
            (f) => setCreateForm(f as TrainingCreate),
            handleCreateSubmit,
            createMutation.isPending,
            true
          )}
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
                  Trainings
                </h5>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                        t.id === selectedId
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: t.color || (t.is_active ? '#4ade80' : '#d1d5db'),
                        }}
                        title={t.color ? `Color: ${t.color}` : t.is_active ? 'Active' : 'Inactive'}
                      />
                      <div className="min-w-0">
                        <span className="block truncate">{t.name}</span>
                        {t.slug && (
                          <span className="block truncate text-xs text-gray-400 dark:text-gray-500">
                            {t.slug}
                          </span>
                        )}
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
                    {selectedItem.slug && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedItem.slug}
                      </p>
                    )}
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
                <div className="border-b border-gray-200 dark:border-gray-700 px-6">
                  <nav className="flex gap-6 -mb-px">
                    {(['details', 'files'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setDetailTab(tab)}
                        className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${
                          detailTab === tab
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        {tab === 'details' ? 'Details' : 'Files'}
                      </button>
                    ))}
                  </nav>
                </div>
                <div className="px-6 py-5">
                  {detailTab === 'details' ? (
                    renderForm(
                      editForm,
                      (f) => setEditForm(f as TrainingUpdate),
                      handleEditSubmit,
                      updateMutation.isPending,
                      false
                    )
                  ) : (
                    <TrainingFilesSection trainingId={selectedItem.id} />
                  )}
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
                  Select a training
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Choose a training from the list to view and edit details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            No trainings yet. Click &quot;+ Add Training&quot; to get started.
          </div>
        )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Training"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? The training must be deactivated first. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
