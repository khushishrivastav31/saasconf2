import { useState } from 'react';
import { queryKeys } from '../../../config/queryKeys';
import Modal from '../../../components/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import RichTextEditor from '../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../components/common/RichTextDisplay';
import { formatDateTime } from '../../../utils/formatDate';
import type { NewsArticle } from '../../../types/news';
import SendNewsModal from './SendNewsModal';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import OverlaySelector from '../../../components/OverlaySelector';
import { useConferenceCrud } from '../../../hooks/api';

interface NewsTabProps {
  conference: { id: string; name: string };
  isAdmin: boolean;
}

interface ArticleFormState {
  title: string;
  body_html: string;
  screen_overlay_id: string | null;
}

const emptyForm: ArticleFormState = {
  title: '',
  body_html: '',
  screen_overlay_id: null,
};

export default function NewsTab({ conference, isAdmin }: NewsTabProps) {
  const conferenceId = conference.id;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [form, setForm] = useState<ArticleFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<NewsArticle | null>(null);
  const [publishTarget, setPublishTarget] = useState<NewsArticle | null>(null);
  const [sendTarget, setSendTarget] = useState<NewsArticle | null>(null);

  // ── Data + Mutations ───────────────────────────────────────────────

  const {
    items: articles,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    error,
    setError,
  } = useConferenceCrud<
    NewsArticle,
    ArticleFormState,
    Partial<ArticleFormState & { is_published: boolean }>
  >({
    conferenceId,
    endpoint: 'news',
    queryKey: queryKeys.news.byConference(conferenceId),
    onCreateSuccess: () => closeModal(),
    onUpdateSuccess: () => closeModal(),
    onDeleteSuccess: () => setDeleteTarget(null),
  });

  // ── Handlers ─────────────────────────────────────────────────────────

  function openCreateModal() {
    setEditingArticle(null);
    setForm(emptyForm);
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
    setForm(emptyForm);
  }

  function handleSave() {
    if (!form.title.trim()) return;

    if (editingArticle) {
      updateMutation.mutate({
        id: editingArticle.id,
        data: { title: form.title, body_html: form.body_html },
      });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleConfirmPublish() {
    if (!publishTarget) return;
    updateMutation.mutate({
      id: publishTarget.id,
      data: { is_published: !publishTarget.is_published },
    });
    setPublishTarget(null);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  function authorName(article: NewsArticle): string {
    const parts = [article.author_first_name, article.author_last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unknown';
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── Loading state ────────────────────────────────────────────────────

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">News Articles</h3>
        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Article
          </button>
        )}
      </div>

      {/* Empty state */}
      {articles.length === 0 && (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
            />
          </svg>
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            No news articles
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isAdmin
              ? 'Create your first news article to share updates with attendees.'
              : 'No news articles have been published yet.'}
          </p>
        </div>
      )}

      {/* Article cards */}
      {articles.length > 0 && (
        <div className="space-y-4">
          {articles.map((article) => (
            <div
              key={article.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: content */}
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
                    {article.published_at && (
                      <span>Published {formatDateTime(article.published_at)}</span>
                    )}
                    {!article.published_at && (
                      <span>Created {formatDateTime(article.created_at)}</span>
                    )}
                  </div>

                  <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                    <RichTextDisplay content={article.body_html} truncate />
                  </div>
                </div>

                {/* Right: actions */}
                {isAdmin && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Edit */}
                    <button
                      onClick={() => openEditModal(article)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Edit article"
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

                    {/* Publish / Unpublish */}
                    <button
                      onClick={() => setPublishTarget(article)}
                      className={`p-2 rounded transition-colors ${
                        article.is_published
                          ? 'text-green-500 hover:text-orange-600 hover:bg-orange-50'
                          : 'text-gray-400 dark:text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                      }`}
                      title={article.is_published ? 'Unpublish' : 'Publish'}
                    >
                      {article.is_published ? (
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
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      ) : (
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
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Send email (only published) */}
                    {article.is_published && (
                      <button
                        onClick={() => setSendTarget(article)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        title="Send as email"
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
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(article)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Delete article"
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
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingArticle ? 'Edit Article' : 'New Article'}
        size="max-w-4xl"
      >
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Article title"
              className="block w-full h-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Body
            </label>
            <RichTextEditor
              value={form.body_html}
              onChange={(html) => setForm((prev) => ({ ...prev, body_html: html }))}
              rows={12}
            />
          </div>

          <OverlaySelector
            conferenceId={conferenceId}
            value={form.screen_overlay_id}
            onChange={(id) => setForm((prev) => ({ ...prev, screen_overlay_id: id }))}
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={closeModal}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !form.title.trim()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>

      {/* Publish / Unpublish confirmation */}
      <ConfirmDialog
        open={!!publishTarget}
        title={publishTarget?.is_published ? 'Unpublish Article' : 'Publish Article'}
        message={
          publishTarget?.is_published
            ? `Are you sure you want to unpublish "${publishTarget?.title ?? ''}"? It will no longer be visible to portal users.`
            : `Are you sure you want to publish "${publishTarget?.title ?? ''}"? It will become visible to all portal users.`
        }
        confirmLabel={publishTarget?.is_published ? 'Unpublish' : 'Publish'}
        variant="warning"
        onConfirm={handleConfirmPublish}
        onCancel={() => setPublishTarget(null)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Article"
        message={`Are you sure you want to delete "${deleteTarget?.title ?? ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Send email modal */}
      {sendTarget && (
        <SendNewsModal
          isOpen={!!sendTarget}
          onClose={() => setSendTarget(null)}
          articleId={sendTarget.id}
          articleTitle={sendTarget.title}
          conferenceId={conferenceId}
        />
      )}
    </div>
  );
}
