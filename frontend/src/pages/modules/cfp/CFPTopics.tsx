import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import type { CFPTopic } from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import ConfirmDialog from '../../../components/ConfirmDialog';

interface TopicListResponse {
  items: CFPTopic[];
  total: number;
}

export default function CFPTopics({ isAdmin: isAdminProp }: { isAdmin?: boolean } = {}) {
  const isAdminFallback = useIsAdmin();
  const isAdmin = isAdminProp ?? isAdminFallback;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CFPTopic | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['cfp-topics'],
    queryFn: async () => {
      const response = await api.get<TopicListResponse>('/cfp/topics');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.post('/cfp/topics', { name });
    },
    onSuccess: () => {
      setError(null);
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['cfp-topics'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create topic'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await api.put(`/cfp/topics/${id}`, { name });
    },
    onSuccess: () => {
      setError(null);
      setEditingId(null);
      setEditName('');
      queryClient.invalidateQueries({ queryKey: ['cfp-topics'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update topic'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cfp/topics/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-topics'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to delete topic'));
      setDeleteTarget(null);
    },
  });

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const handleCreate = () => {
    if (!newName.trim() || createMutation.isPending) return;
    createMutation.mutate(newName.trim());
  };

  const handleUpdate = () => {
    if (!editingId || !editName.trim()) return;
    updateMutation.mutate({ id: editingId, name: editName.trim() });
  };

  const startEdit = (topic: CFPTopic) => {
    setEditingId(topic.id);
    setEditName(topic.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const topics = data?.items || [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Topics</h2>

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
            {topics.map((topic) => (
              <li key={topic.id} className="group">
                {editingId === topic.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleUpdate();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5"
                  >
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-primary-300 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!editName.trim() || isSaving}
                      className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md disabled:opacity-50"
                      title="Save"
                      aria-label="Save"
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
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                      title="Cancel"
                      aria-label="Cancel"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <span className="text-sm text-gray-900 dark:text-gray-100">{topic.name}</span>
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(topic)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-md"
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
                          onClick={() => setDeleteTarget(topic)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
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
                    )}
                  </div>
                )}
              </li>
            ))}

            {/* Always-visible add input */}
            {isAdmin && (
              <li className={topics.length > 0 ? '' : ''}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreate();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5"
                >
                  <svg
                    className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0"
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
                    placeholder="Add a topic..."
                    className="flex-1 bg-transparent border-none py-0 px-0 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-0"
                  />
                  {newName.trim() && (
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-3 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
                    >
                      {createMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                  )}
                </form>
              </li>
            )}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Topic"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
