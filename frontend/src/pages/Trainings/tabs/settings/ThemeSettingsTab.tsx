import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type { TrainingTheme, TrainingLanguage } from '../../../../types/training';
import { parseApiError } from '../../../../utils/apiError';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import RichTextEditor from '../../../../components/common/RichTextEditor';

interface ThemeListResponse {
  items: TrainingTheme[];
  total: number;
}

interface LanguageListResponse {
  items: TrainingLanguage[];
  total: number;
}

export default function ThemeSettingsTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLanguageId, setEditLanguageId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [newName, setNewName] = useState('');
  const [newLanguageId, setNewLanguageId] = useState<string | null>(null);
  const [newDescription, setNewDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TrainingTheme | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['training-themes'],
    queryFn: async () => {
      const response = await api.get<ThemeListResponse>('/trainings/themes');
      return response.data;
    },
  });

  const { data: languagesData } = useQuery({
    queryKey: ['training-languages'],
    queryFn: async () => {
      const response = await api.get<LanguageListResponse>('/trainings/languages');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      language_id: string | null;
      description: string;
    }) => {
      await api.post('/trainings/themes', payload);
    },
    onSuccess: () => {
      setError(null);
      setNewName('');
      setNewLanguageId(null);
      setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['training-themes'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create theme'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      language_id: string | null;
      description: string;
    }) => {
      const { id, ...body } = payload;
      await api.put(`/trainings/themes/${id}`, body);
    },
    onSuccess: () => {
      setError(null);
      setEditingId(null);
      setEditName('');
      setEditLanguageId(null);
      setEditDescription('');
      queryClient.invalidateQueries({ queryKey: ['training-themes'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update theme'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/themes/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['training-themes'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete theme'));
      setDeleteTarget(null);
    },
  });

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const handleCreate = () => {
    if (!newName.trim() || createMutation.isPending) return;
    createMutation.mutate({
      name: newName.trim(),
      language_id: newLanguageId,
      description: newDescription,
    });
  };

  const handleUpdate = () => {
    if (!editingId || !editName.trim()) return;
    updateMutation.mutate({
      id: editingId,
      name: editName.trim(),
      language_id: editLanguageId,
      description: editDescription,
    });
  };

  const startEdit = (theme: TrainingTheme) => {
    setEditingId(theme.id);
    setEditName(theme.name);
    setEditLanguageId(theme.language_id);
    setEditDescription(theme.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditLanguageId(null);
    setEditDescription('');
  };

  const themes = data?.items || [];
  const languages = languagesData?.items || [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Themes</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {themes.map((theme) => (
              <li key={theme.id} className="group">
                {editingId === theme.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleUpdate();
                    }}
                    className="px-4 py-3 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 border border-primary-300 dark:border-primary-600 dark:bg-gray-800 dark:text-gray-100 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                      <select
                        value={editLanguageId ?? ''}
                        onChange={(e) => setEditLanguageId(e.target.value || null)}
                        className="w-36 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">No language</option>
                        {languages.map((lang) => (
                          <option key={lang.id} value={lang.id}>
                            {lang.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Description
                      </label>
                      <RichTextEditor
                        value={editDescription}
                        onChange={setEditDescription}
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={!editName.trim() || isSaving}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
                      >
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {theme.name}
                        </span>
                        {theme.language_name && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {theme.language_name}
                          </span>
                        )}
                      </div>
                      {theme.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {theme.description.replace(/<[^>]*>/g, '')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startEdit(theme)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md"
                        title="Edit"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(theme)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                        title="Delete"
                      >
                        <svg
                          className="w-4 h-4"
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
                )}
              </li>
            ))}

            {/* Always-visible add input */}
            <li>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className="px-4 py-2.5 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Add a theme..."
                    className="flex-1 bg-transparent border-none py-0 px-0 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-0"
                  />
                  {newName.trim() && (
                    <select
                      value={newLanguageId ?? ''}
                      onChange={(e) => setNewLanguageId(e.target.value || null)}
                      className="w-36 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">No language</option>
                      {languages.map((lang) => (
                        <option key={lang.id} value={lang.id}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {newName.trim() && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Description
                      </label>
                      <RichTextEditor
                        value={newDescription}
                        onChange={setNewDescription}
                        rows={2}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
                    >
                      {createMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                  </>
                )}
              </form>
            </li>
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Theme"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
