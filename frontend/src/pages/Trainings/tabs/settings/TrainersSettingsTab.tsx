import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type {
  Trainer,
  TrainerCreate,
  TrainerUpdate,
  Training,
  TrainingLanguage,
} from '../../../../types/training';
import type { PronounOption } from '../../../../types/conference';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { TrainerPhoto, TrainerAvatar } from './TrainerPhoto';
import TrainerUnavailabilitySection from './TrainerUnavailabilitySection';
import TrainerScheduleSection from './TrainerScheduleSection';

interface ListResponse<T> {
  items: T[];
  total: number;
}

const QUERY_KEY = ['trainers'];

const emptyCreate: TrainerCreate = {
  first_name: '',
  last_name: '',
  email: null,
  phone: null,
  pronouns: null,
  vita: null,
  is_active: true,
  is_internal: true,
  training_ids: [],
  language_ids: [],
};

/* ─── Main component ──────────────────────────────────────────── */

export default function TrainersSettingsTab() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<TrainerCreate>({ ...emptyCreate });
  const [editForm, setEditForm] = useState<TrainerUpdate>({});
  const [deleteTarget, setDeleteTarget] = useState<Trainer | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const createPhotoRef = useRef<HTMLInputElement>(null);

  // Fetch trainers
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<ListResponse<Trainer>>('/trainings/trainers');
      return res.data;
    },
  });

  // Fetch trainings for assignment
  const { data: trainingsData } = useQuery({
    queryKey: ['trainings-list'],
    queryFn: async () => {
      const res = await api.get<ListResponse<Training>>('/trainings?page_size=100');
      return res.data;
    },
  });

  // Fetch languages for assignment
  const { data: langData } = useQuery({
    queryKey: ['training-languages'],
    queryFn: async () => {
      const res = await api.get<ListResponse<TrainingLanguage>>('/trainings/languages');
      return res.data;
    },
  });

  // Fetch pronoun options (tenant-scoped)
  const { data: pronounOptionsData } = useQuery({
    queryKey: queryKeys.pronounOptions,
    queryFn: async () => {
      const res = await api.get<{ items: PronounOption[] }>('/pronoun-options');
      return res.data.items;
    },
    staleTime: 60_000,
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const allTrainings = useMemo(() => trainingsData?.items || [], [trainingsData?.items]);
  const allLanguages = useMemo(() => langData?.items || [], [langData?.items]);
  const activePronounOptions = useMemo(
    () => (pronounOptionsData || []).filter((o) => o.is_active),
    [pronounOptionsData]
  );
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
        first_name: selectedItem.first_name,
        last_name: selectedItem.last_name,
        email: selectedItem.email,
        phone: selectedItem.phone,
        pronouns: selectedItem.pronouns,
        vita: selectedItem.vita || '',
        is_active: selectedItem.is_active,
        is_internal: selectedItem.is_internal,
        training_ids: selectedItem.training_ids,
        language_ids: selectedItem.language_ids,
      });
    }
  }, [selectedItem]);

  const createMutation = useMutation({
    mutationFn: async ({
      payload,
      photoFile,
    }: {
      payload: TrainerCreate;
      photoFile: File | null;
    }) => {
      const res = await api.post<Trainer>('/trainings/trainers', payload);
      const newTrainer = res.data;
      // Upload pending photo if one was selected
      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('entity_type', 'trainer_photo');
        formData.append('entity_id', newTrainer.id);
        await api.post('/attachments', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      return newTrainer;
    },
    onSuccess: (newItem) => {
      setError(null);
      setIsAdding(false);
      setCreateForm({ ...emptyCreate });
      setPendingPhotoFile(null);
      if (pendingPhotoPreview) {
        URL.revokeObjectURL(pendingPhotoPreview);
        setPendingPhotoPreview(null);
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Also invalidate the new trainer's photo query so the sidebar avatar loads
      queryClient.invalidateQueries({
        queryKey: queryKeys.attachments.list('trainer_photo', newItem.id),
      });
      setSelectedId(newItem.id);
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to create trainer')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: payload }: { id: string; data: TrainerUpdate }) => {
      const res = await api.put<Trainer>(`/trainings/trainers/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to update trainer')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/trainers/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete trainer'));
      setDeleteTarget(null);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ payload: createForm, photoFile: pendingPhotoFile });
  };

  const handleCreatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingPhotoFile(file);
      if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
      setPendingPhotoPreview(URL.createObjectURL(file));
    }
    if (createPhotoRef.current) createPhotoRef.current.value = '';
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    updateMutation.mutate({ id: selectedItem.id, data: editForm });
  };

  const inputCls =
    'mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm';
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

  const toggleMulti = (current: string[], id: string, setter: (ids: string[]) => void) => {
    if (current.includes(id)) {
      setter(current.filter((x) => x !== id));
    } else {
      setter([...current, id]);
    }
  };

  const [trainingSearch, setTrainingSearch] = useState('');
  const [detailTab, setDetailTab] = useState<'profile' | 'catalog' | 'unavailability' | 'schedule'>(
    'profile'
  );

  // Reset detail tab when selection changes
  useEffect(() => {
    setDetailTab('profile');
  }, [selectedId]);

  const filteredTrainings = useMemo(() => {
    if (!trainingSearch.trim()) return allTrainings;
    const q = trainingSearch.toLowerCase();
    return allTrainings.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTrainings, trainingSearch]);

  const renderForm = (
    form: TrainerCreate | TrainerUpdate,
    setForm: (f: TrainerCreate | TrainerUpdate) => void,
    onSubmit: (e: React.FormEvent) => void,
    isPending: boolean,
    isCreate: boolean
  ) => (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
      id={isCreate ? 'create-trainer-form' : 'edit-trainer-form'}
    >
      {/* Name row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>First Name *</label>
          <input
            type="text"
            required
            className={inputCls}
            value={form.first_name || ''}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Last Name *</label>
          <input
            type="text"
            required
            className={inputCls}
            value={form.last_name || ''}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
        </div>
      </div>

      {/* Contact row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            className={inputCls}
            value={form.email || ''}
            onChange={(e) => setForm({ ...form, email: e.target.value || null })}
          />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            type="text"
            className={inputCls}
            value={form.phone || ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
          />
        </div>
      </div>

      {/* Pronouns */}
      {activePronounOptions.length > 0 && (
        <div>
          <label className={labelCls}>Pronouns</label>
          <select
            className={inputCls}
            value={form.pronouns || ''}
            onChange={(e) => setForm({ ...form, pronouns: e.target.value || null })}
          >
            <option value="">Select pronouns...</option>
            {activePronounOptions.map((opt) => (
              <option key={opt.id} value={opt.name}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Type + Active row */}
      <div className="flex items-center gap-6">
        <div>
          <label className={labelCls}>Type</label>
          <div className="mt-1 flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="radio"
                name={isCreate ? 'create-type' : 'edit-type'}
                checked={form.is_internal === true}
                onChange={() => setForm({ ...form, is_internal: true })}
                className="text-primary-600 focus:ring-primary-500"
              />
              Internal
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="radio"
                name={isCreate ? 'create-type' : 'edit-type'}
                checked={form.is_internal === false}
                onChange={() => setForm({ ...form, is_internal: false })}
                className="text-primary-600 focus:ring-primary-500"
              />
              External
            </label>
          </div>
        </div>
        <div className="pt-5">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active ?? true}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            />
            Active
          </label>
        </div>
      </div>

      {/* Languages */}
      {allLanguages.length > 0 && (
        <div>
          <label className={labelCls}>Languages</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {allLanguages.map((l) => {
              const selected = (form.language_ids || []).includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() =>
                    toggleMulti(form.language_ids || [], l.id, (ids) =>
                      setForm({ ...form, language_ids: ids })
                    )
                  }
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    selected
                      ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Vita */}
      <div>
        <label className={labelCls}>Vita</label>
        <RichTextEditor
          value={(form.vita as string) || ''}
          onChange={(html) => setForm({ ...form, vita: html })}
          rows={5}
        />
      </div>

      {/* Actions — only for create form (edit uses header button) */}
      {isCreate && (
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setCreateForm({ ...emptyCreate });
              setPendingPhotoFile(null);
              if (pendingPhotoPreview) {
                URL.revokeObjectURL(pendingPhotoPreview);
                setPendingPhotoPreview(null);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  );

  const trainerCount = items.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Trainers
            {trainerCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {trainerCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage trainers for your training programmes.
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Trainer
          </button>
        )}
      </div>

      <ErrorBanner message={error} />

      {/* Create form */}
      {isAdding && (
        <div className="mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">New Trainer</h5>

          {/* Photo picker for create */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-20 h-20 rounded-full border border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800 flex items-center justify-center shrink-0">
              {pendingPhotoPreview ? (
                <img
                  src={pendingPhotoPreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  className="h-10 w-10 text-gray-300 dark:text-gray-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                ref={createPhotoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCreatePhotoSelect}
                className="hidden"
                id="create-trainer-photo"
              />
              <label
                htmlFor="create-trainer-photo"
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer bg-primary-600 text-white hover:bg-primary-700"
              >
                {pendingPhotoFile ? 'Change Photo' : 'Choose Photo'}
              </label>
              {pendingPhotoFile && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingPhotoFile(null);
                    if (pendingPhotoPreview) {
                      URL.revokeObjectURL(pendingPhotoPreview);
                      setPendingPhotoPreview(null);
                    }
                  }}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-white dark:bg-gray-800 text-red-600 border border-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  Remove
                </button>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">JPEG, PNG, WebP</p>
            </div>
          </div>

          {renderForm(
            createForm,
            (f) => setCreateForm(f as TrainerCreate),
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
                  Trainers
                </h5>
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-120 overflow-y-auto">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
                        t.id === selectedId
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {/* Avatar circle */}
                      <TrainerAvatar
                        trainerId={t.id}
                        initials={`${t.first_name.charAt(0)}${t.last_name.charAt(0)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">
                          {t.first_name} {t.last_name}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${t.is_active ? 'bg-green-500' : 'bg-gray-400'}`}
                          />
                          {t.is_internal ? 'Internal' : 'External'}
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
                {/* Header with Save + Delete */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {selectedItem.first_name} {selectedItem.last_name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedItem.is_internal ? 'Internal' : 'External'} trainer
                      {!selectedItem.is_active && ' (inactive)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(detailTab === 'profile' || detailTab === 'catalog') && (
                      <button
                        type="submit"
                        form="edit-trainer-form"
                        disabled={updateMutation.isPending}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
                      >
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selectedItem)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                      title="Delete"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6">
                  <nav className="flex gap-6 -mb-px">
                    <button
                      type="button"
                      onClick={() => setDetailTab('profile')}
                      className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                        detailTab === 'profile'
                          ? 'border-primary-600 text-primary-600'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('catalog')}
                      className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                        detailTab === 'catalog'
                          ? 'border-primary-600 text-primary-600'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      Trainings Catalog
                      {(editForm.training_ids || []).length > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {(editForm.training_ids || []).length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('unavailability')}
                      className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                        detailTab === 'unavailability'
                          ? 'border-primary-600 text-primary-600'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      Unavailability
                      {(selectedItem.unavailability?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {selectedItem.unavailability?.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('schedule')}
                      className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                        detailTab === 'schedule'
                          ? 'border-primary-600 text-primary-600'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      Schedule
                    </button>
                  </nav>
                </div>

                {/* Tab content */}
                <div className="px-6 py-5">
                  {detailTab === 'profile' && (
                    <div className="space-y-6">
                      {/* Photo upload */}
                      <TrainerPhoto trainerId={selectedItem.id} />

                      {/* Edit form */}
                      {renderForm(
                        editForm,
                        (f) => setEditForm(f as TrainerUpdate),
                        handleEditSubmit,
                        updateMutation.isPending,
                        false
                      )}
                    </div>
                  )}
                  {detailTab === 'catalog' && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Trainings Catalog
                          {(editForm.training_ids || []).length > 0 && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                              ({(editForm.training_ids || []).length} of {allTrainings.length}{' '}
                              selected)
                            </span>
                          )}
                        </h4>
                      </div>
                      {allTrainings.length > 8 && (
                        <div className="relative mb-3">
                          <input
                            type="text"
                            value={trainingSearch}
                            onChange={(e) => setTrainingSearch(e.target.value)}
                            placeholder="Search trainings..."
                            className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md pl-8 pr-3 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500"
                          />
                          <svg
                            className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                        </div>
                      )}
                      <div className="max-h-112 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-2 space-y-0.5 bg-white dark:bg-gray-800">
                        {filteredTrainings.length === 0 ? (
                          <p className="text-xs text-gray-400 dark:text-gray-500 py-2 px-1">
                            {trainingSearch
                              ? 'No trainings match your search.'
                              : 'No trainings available.'}
                          </p>
                        ) : (
                          filteredTrainings.map((t) => {
                            const checked = (editForm.training_ids || []).includes(t.id);
                            return (
                              <label
                                key={t.id}
                                className={`flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-2 py-1.5 rounded ${
                                  checked
                                    ? 'text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleMulti(editForm.training_ids || [], t.id, (ids) =>
                                      setEditForm({ ...editForm, training_ids: ids })
                                    )
                                  }
                                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 shrink-0"
                                />
                                <span className="truncate">{t.name}</span>
                                {!t.is_active && (
                                  <span className="text-xs text-gray-400 shrink-0">(inactive)</span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                  {detailTab === 'unavailability' && (
                    <TrainerUnavailabilitySection
                      trainerId={selectedItem.id}
                      entries={selectedItem.unavailability ?? []}
                    />
                  )}
                  {detailTab === 'schedule' && (
                    <TrainerScheduleSection trainerId={selectedItem.id} />
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
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Select a trainer
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Choose a trainer from the list to view and edit details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            No trainers yet. Click &quot;+ Add Trainer&quot; to get started.
          </div>
        )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Trainer"
        message={`Are you sure you want to delete "${deleteTarget?.first_name} ${deleteTarget?.last_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
