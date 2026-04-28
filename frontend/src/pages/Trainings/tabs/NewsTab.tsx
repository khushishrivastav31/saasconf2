import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import Modal from '../../../components/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import OverlaySelector from '../../../components/OverlaySelector';
import RichTextEditor from '../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../components/common/RichTextDisplay';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useToast } from '../../../components/Toast';
import { formatDateTime } from '../../../utils/formatDate';
import { parseApiError } from '../../../utils/apiError';
import type { NewsArticle, NewsArticleListResponse } from '../../../types/news';
import SendTrainingNewsModal from './SendTrainingNewsModal';

interface FormState {
  title: string;
  body_html: string;
  screen_overlay_id: string | null;
}

const EMPTY_FORM: FormState = { title: '', body_html: '', screen_overlay_id: null };

const API_BASE = '/trainings/news';
const QUERY_KEY = ['training-news'];

/**
 * Trainings → News tab.
 *
 * Mirrors the per-conference News tab but tenant-scoped: a single
 * stream of training news articles managed by the trainings admin.
 * Recipients of the "Send" action are training attendees in the
 * tenant; the portal only surfaces these articles to users with a
 * training-portal identity (matched by ``email_hash``).
 */
export default function NewsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<NewsArticle | null>(null);
  const [publishTarget, setPublishTarget] = useState<NewsArticle | null>(null);
  const [sendTarget, setSendTarget] = useState<NewsArticle | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const resp = await api.get<NewsArticleListResponse>(API_BASE);
      return resp.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const resp = await api.post<NewsArticle>(API_BASE, payload);
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeModal();
      showToast('Article created', 'success');
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<FormState & { is_published: boolean }>;
    }) => {
      const resp = await api.put<NewsArticle>(`${API_BASE}/${id}`, payload);
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeModal();
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${API_BASE}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDeleteTarget(null);
      showToast('Article deleted', 'success');
    },
    onError: (err) => {
      setError(parseApiError(err));
      setDeleteTarget(null);
    },
  });

  const articles = data?.items ?? [];

  function openCreateModal() {
    setEditingArticle(null);
    setForm(EMPTY_FORM);
    setError(null);
    setIsModalOpen(true);
  }

  function openEditModal(article: NewsArticle) {
    setEditingArticle(article);
    setForm({
      title: article.title,
      body_html: article.body_html,
      screen_overlay_id: article.screen_overlay_id ?? null,
    });
    setError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingArticle(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.title.trim()) return;
    if (editingArticle) {
      updateMutation.mutate({ id: editingArticle.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleConfirmPublish() {
    if (!publishTarget) return;
    updateMutation.mutate({
      id: publishTarget.id,
      payload: { is_published: !publishTarget.is_published },
    });
    setPublishTarget(null);
  }

  function authorName(article: NewsArticle): string {
    const parts = [article.author_first_name, article.author_last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unknown';
  }

  if (isLoading) return <LoadingSpinner />;

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">News Articles</h3>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          + New Article
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">No news articles</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create your first article to share updates with training attendees.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <div
              key={article.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {article.title}
                    </h4>
                    {article.is_published ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        Draft
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
                    <span>By {authorName(article)}</span>
                    {article.published_at ? (
                      <span>Published {formatDateTime(article.published_at)}</span>
                    ) : (
                      <span>Created {formatDateTime(article.created_at)}</span>
                    )}
                  </div>

                  <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                    <RichTextDisplay content={article.body_html} truncate />
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditModal(article)}
                    className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Edit"
                    aria-label="Edit article"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setPublishTarget(article)}
                    className="p-2 text-gray-400 dark:text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                    title={article.is_published ? 'Unpublish' : 'Publish'}
                    aria-label={article.is_published ? 'Unpublish' : 'Publish'}
                  >
                    {article.is_published ? '🚫' : '✅'}
                  </button>
                  {article.is_published && (
                    <button
                      onClick={() => setSendTarget(article)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                      title="Send to attendees"
                      aria-label="Send article"
                    >
                      ✉️
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget(article)}
                    className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                    title="Delete"
                    aria-label="Delete article"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingArticle ? 'Edit Article' : 'New Article'}
      >
        <div className="px-6 py-4 space-y-4">
          <div>
            <label
              htmlFor="news-title"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Title
            </label>
            <input
              id="news-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label
              htmlFor="news-body"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Body
            </label>
            <RichTextEditor
              value={form.body_html}
              onChange={(html) => setForm((f) => ({ ...f, body_html: html }))}
              placeholder="Write the article body…"
            />
          </div>
          <OverlaySelector
            trainingScope
            value={form.screen_overlay_id}
            onChange={(id) => setForm((f) => ({ ...f, screen_overlay_id: id }))}
          />
        </div>
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!form.title.trim() || isSaving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Article"
        message={`Delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!publishTarget}
        title={publishTarget?.is_published ? 'Unpublish Article' : 'Publish Article'}
        message={
          publishTarget?.is_published
            ? `Unpublish "${publishTarget.title}"? It will no longer be visible to portal users.`
            : `Publish "${publishTarget?.title}"? It will become visible to all training-portal users.`
        }
        confirmLabel={publishTarget?.is_published ? 'Unpublish' : 'Publish'}
        onConfirm={handleConfirmPublish}
        onCancel={() => setPublishTarget(null)}
      />

      <SendTrainingNewsModal
        isOpen={!!sendTarget}
        onClose={() => setSendTarget(null)}
        articleId={sendTarget?.id ?? ''}
        articleTitle={sendTarget?.title ?? ''}
        onSent={(emailsSent) =>
          showToast(`Sent to ${emailsSent} attendee${emailsSent === 1 ? '' : 's'}`, 'success')
        }
      />
    </div>
  );
}
