import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import portalApi from '../../../config/portalApi';
import { useApplicantAuth } from '../../../hooks/useApplicantAuth';
import { type StagedAttachment } from '../../../components/MessageFileAttach';
import type {
  PortalThreadListResponse,
  PortalThreadDetailResponse,
  PortalThreadDomain,
} from '../../../types/portal';
import PortalComposeModal from './ComposeModal';
import ThreadDetailPane from './ThreadDetailPane';
import { formatRelativeDate } from './utils';

type DomainFilter = 'all' | PortalThreadDomain;

const DOMAIN_FILTERS: { value: DomainFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'conference', label: 'Conferences' },
  { value: 'training', label: 'Trainings' },
];

export default function MessagesPage() {
  const { applicant } = useApplicantAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadIdParam = searchParams.get('thread');

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadIdParam);
  const [replyHtml, setReplyHtml] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<StagedAttachment[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');

  useEffect(() => {
    if (threadIdParam) setSelectedThreadId(threadIdParam);
  }, [threadIdParam]);

  // Thread list
  const { data: threadList, isLoading } = useQuery({
    queryKey: ['portal-messages', showArchived, domainFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ archived: String(showArchived) });
      if (domainFilter !== 'all') params.set('domain', domainFilter);
      const resp = await portalApi.get(`/portal/messages?${params}`);
      return resp.data as PortalThreadListResponse;
    },
    refetchInterval: 30000,
  });

  // Thread detail
  const { data: threadDetail } = useQuery({
    queryKey: ['portal-message-thread', selectedThreadId],
    queryFn: async () => {
      const resp = await portalApi.get(`/portal/messages/${selectedThreadId}`);
      return resp.data as PortalThreadDetailResponse;
    },
    enabled: !!selectedThreadId,
    refetchInterval: selectedThreadId ? 15000 : false,
  });

  // Reply
  const replyMutation = useMutation({
    mutationFn: async (data: { body_html: string; attachment_ids: string[] }) => {
      const resp = await portalApi.post(`/portal/messages/${selectedThreadId}/reply`, data);
      return resp.data;
    },
    onSuccess: () => {
      setReplyHtml('');
      setReplyAttachments([]);
      queryClient.invalidateQueries({
        queryKey: ['portal-message-thread', selectedThreadId],
      });
      queryClient.invalidateQueries({ queryKey: ['portal-messages'] });
      queryClient.invalidateQueries({ queryKey: ['portal-unread-count'] });
    },
  });

  // Create thread
  const createMutation = useMutation({
    mutationFn: async (data: {
      conference_id: string;
      subject: string;
      body_html: string;
      attachment_ids: string[];
    }) => {
      const resp = await portalApi.post('/portal/messages', data);
      return resp.data as PortalThreadDetailResponse;
    },
    onSuccess: (data) => {
      setShowCompose(false);
      setSelectedThreadId(data.id);
      setSearchParams({ thread: data.id });
      queryClient.invalidateQueries({ queryKey: ['portal-messages'] });
      queryClient.invalidateQueries({ queryKey: ['portal-unread-count'] });
    },
  });

  // Archive / unarchive
  const archiveMutation = useMutation({
    mutationFn: async ({ threadId, archive }: { threadId: string; archive: boolean }) => {
      await portalApi.post(`/portal/messages/${threadId}/${archive ? 'archive' : 'unarchive'}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-messages'] });
      queryClient.invalidateQueries({
        queryKey: ['portal-message-thread', selectedThreadId],
      });
    },
  });

  // Mark read on select
  const handleSelectThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId);
      setSearchParams({ thread: threadId });
      try {
        await portalApi.post(`/portal/messages/${threadId}/read`);
        queryClient.invalidateQueries({ queryKey: ['portal-messages'] });
        queryClient.invalidateQueries({ queryKey: ['portal-unread-count'] });
      } catch {
        // Silent
      }
    },
    [queryClient, setSearchParams]
  );

  const threads = threadList?.items ?? [];
  const isArchived = !!threadDetail?.archived_at;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Messages</h1>
          <button
            onClick={() => {
              setShowArchived(!showArchived);
              setSelectedThreadId(null);
              setSearchParams({});
            }}
            className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              showArchived
                ? 'bg-gray-700 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {showArchived ? 'Showing Archived' : 'Archived'}
          </button>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          New Message
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Domain filter chips. Hidden when looking at a single thread on
            mobile so the detail view gets the full screen width. */}
        <div
          className={`px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex gap-1.5 ${
            selectedThreadId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {DOMAIN_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setDomainFilter(f.value)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                domainFilter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex" style={{ height: 'calc(100vh - 260px)' }}>
          {/* Thread list */}
          <div
            className={`w-full lg:w-80 border-r overflow-y-auto flex-shrink-0 ${
              selectedThreadId ? 'hidden lg:block' : ''
            }`}
          >
            {isLoading ? (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                Loading...
              </div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                {showArchived
                  ? 'No archived messages.'
                  : 'No messages yet. Click "New Message" to start a conversation.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {threads.map((thread) => (
                  <div key={thread.id} className="relative group">
                    <button
                      onClick={() => handleSelectThread(thread.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        selectedThreadId === thread.id
                          ? 'bg-blue-50 border-l-2 border-l-blue-600'
                          : ''
                      } ${thread.unread ? 'bg-blue-50/40' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {thread.unread && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                          )}
                          <span
                            className={`text-sm truncate ${
                              thread.unread
                                ? 'font-semibold text-gray-900 dark:text-gray-100'
                                : 'font-medium text-gray-800 dark:text-gray-200'
                            }`}
                          >
                            {thread.subject}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {formatRelativeDate(thread.last_message_at)}
                        </span>
                      </div>
                      {thread.domain_entity_name && (
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              thread.domain === 'training'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                            }`}
                          >
                            {thread.domain_entity_name}
                          </span>
                        </div>
                      )}
                      {thread.last_message_preview && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {thread.last_message_preview}
                        </p>
                      )}
                    </button>
                    {/* Archive action on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveMutation.mutate({
                          threadId: thread.id,
                          archive: !thread.archived_at,
                        });
                      }}
                      className="absolute top-2 right-2 p-1 rounded bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={thread.archived_at ? 'Unarchive' : 'Archive'}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className={`flex-1 flex flex-col ${selectedThreadId ? '' : 'hidden lg:flex'}`}>
            {selectedThreadId && threadDetail ? (
              <ThreadDetailPane
                threadDetail={threadDetail}
                applicantId={applicant?.id}
                isArchived={isArchived}
                replyHtml={replyHtml}
                setReplyHtml={setReplyHtml}
                replyAttachments={replyAttachments}
                setReplyAttachments={setReplyAttachments}
                isReplying={replyMutation.isPending}
                onReply={() =>
                  replyMutation.mutate({
                    body_html: replyHtml,
                    attachment_ids: replyAttachments.map((a) => a.id),
                  })
                }
                onArchiveToggle={() =>
                  archiveMutation.mutate({
                    threadId: threadDetail.id,
                    archive: !isArchived,
                  })
                }
                onBack={() => {
                  setSelectedThreadId(null);
                  setSearchParams({});
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Select a conversation or start a new one
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <PortalComposeModal
          onClose={() => setShowCompose(false)}
          onSend={(data) => createMutation.mutate(data)}
          sending={createMutation.isPending}
        />
      )}
    </div>
  );
}
