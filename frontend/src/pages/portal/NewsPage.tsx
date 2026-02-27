import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import RichTextDisplay from '../../components/common/RichTextDisplay';
import type { PortalNewsListResponse } from '../../types/portal';

function formatPublishedDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  // Cut at last space to avoid splitting a word
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

export default function NewsPage() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['portal-news'],
    queryFn: async () => {
      const res = await portalApi.get<PortalNewsListResponse>('/portal/news');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const articles = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-12 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">News</h1>
        <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No news articles yet.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">News</h1>
      <div className="space-y-4">
        {articles.map((article) => {
          const isExpanded = expandedIds.has(article.id);
          const plainText = stripHtml(article.body_html);
          const needsTruncation = plainText.length > 200;
          const preview = truncateText(plainText, 200);

          return (
            <div
              key={article.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
            >
              <div className="px-6 py-5">
                {/* Conference badge */}
                <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200 mb-3">
                  {article.conference_name}
                </span>

                {/* Title */}
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {article.title}
                </h2>

                {/* Published date */}
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                  {formatPublishedDate(article.published_at)}
                </p>

                {/* Body: preview or full */}
                {isExpanded ? (
                  <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
                    <RichTextDisplay content={article.body_html} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {preview}
                  </p>
                )}

                {/* Read more / Show less toggle */}
                {needsTruncation && (
                  <button
                    onClick={() => toggleExpand(article.id)}
                    className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    {isExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
