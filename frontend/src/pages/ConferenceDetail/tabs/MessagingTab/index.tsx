import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import type {
  Conference,
  ThreadListResponse,
  ThreadDetailResponse,
  BulkRecipientFilter,
} from '../../../../types';
import ThreadList from './ThreadList';
import ThreadDetail from './ThreadDetail';
import FullComposeModal from './FullComposeModal';
import BulkComposeModal from './BulkComposeModal';

interface MessagingTabProps {
  conference: Conference;
}

export default function MessagingTab({ conference }: MessagingTabProps) {
  const conferenceId = conference.id;
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showBulkCompose, setShowBulkCompose] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [composePrefill, setComposePrefill] = useState<{
    subject?: string;
    body_html?: string;
  } | null>(null);
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [filterAttachments, setFilterAttachments] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterParticipant, setFilterParticipant] = useState('');
  const [popupThreadId, setPopupThreadId] = useState<string | null>(null);

  const messagingMode =
    ((conference.settings as Record<string, unknown>)?.messaging_mode as string | undefined) ??
    'in_app';
  const emailOnly = messagingMode === 'email_only';
  const basePath = `/conferences/${conferenceId}/messaging`;

  // Thread list
  const { data: threadList, isLoading: loadingThreads } = useQuery({
    queryKey: [
      'messaging-threads',
      conferenceId,
      page,
      search,
      showArchived,
      filterFlagged,
      filterAttachments,
      filterUnread,
      filterParticipant,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '50',
        archived: String(showArchived),
      });
      if (search) {
        params.set('search', search);
        params.set('search_body', 'true');
      }
      if (filterFlagged) params.set('flagged', 'true');
      if (filterAttachments) params.set('has_attachments', 'true');
      if (filterUnread) params.set('unread_only', 'true');
      if (filterParticipant.trim()) params.set('participant_name', filterParticipant.trim());
      const resp = await api.get(`${basePath}/threads?${params}`);
      return resp.data as ThreadListResponse;
    },
  });

  // Thread detail
  const { data: threadDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['messaging-thread', conferenceId, selectedThreadId],
    queryFn: async () => {
      const resp = await api.get(`${basePath}/threads/${selectedThreadId}`);
      return resp.data as ThreadDetailResponse;
    },
    enabled: !!selectedThreadId,
  });

  // Popup thread detail (for double-click pop-up)
  const { data: popupThreadDetail } = useQuery({
    queryKey: ['messaging-thread', conferenceId, popupThreadId],
    queryFn: async () => {
      const resp = await api.get(`${basePath}/threads/${popupThreadId}`);
      return resp.data as ThreadDetailResponse;
    },
    enabled: !!popupThreadId,
  });

  // Reply in popup
  const popupReplyMutation = useMutation({
    mutationFn: async (data: { threadId: string; body_html: string; attachment_ids: string[] }) => {
      const resp = await api.post(`${basePath}/threads/${data.threadId}/reply`, {
        body_html: data.body_html,
        attachment_ids: data.attachment_ids,
      });
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['messaging-thread', conferenceId, popupThreadId],
      });
      queryClient.invalidateQueries({
        queryKey: ['messaging-threads', conferenceId],
      });
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to send reply'), 'error');
    },
  });

  // Create thread(s)
  const createThread = useMutation({
    mutationFn: async (data: {
      recipient_applicant_ids: string[];
      subject: string;
      body_html: string;
      attachment_ids: string[];
      screen_overlay_id?: string | null;
    }) => {
      const resp = await api.post(`${basePath}/threads`, data);
      return resp.data as { threads_created: number; first_thread: ThreadDetailResponse };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['messaging-threads', conferenceId],
      });
      setShowCompose(false);
      setComposePrefill(null);
      setSelectedThreadId(data.first_thread.id);
      showToast(
        data.threads_created === 1
          ? 'Message sent'
          : `Message sent to ${data.threads_created} recipients`,
        'success'
      );
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to send message'), 'error');
    },
  });

  // Reply
  const replyMutation = useMutation({
    mutationFn: async (data: { body_html: string; attachment_ids: string[] }) => {
      const resp = await api.post(`${basePath}/threads/${selectedThreadId}/reply`, data);
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['messaging-thread', conferenceId, selectedThreadId],
      });
      queryClient.invalidateQueries({
        queryKey: ['messaging-threads', conferenceId],
      });
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to send reply'), 'error');
    },
  });

  // Bulk send
  const bulkSend = useMutation({
    mutationFn: async (data: {
      subject: string;
      body_html: string;
      recipients: BulkRecipientFilter;
      screen_overlay_id?: string | null;
    }) => {
      const resp = await api.post(`${basePath}/bulk-send`, data);
      return resp.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['messaging-threads', conferenceId],
      });
      setShowBulkCompose(false);
      showToast(`Sent to ${data.threads_created} recipients`, 'success');
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to send bulk message'), 'error');
    },
  });

  // Flag toggle
  const flagMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const resp = await api.post(`${basePath}/threads/${threadId}/flag`);
      return resp.data as { flagged: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['messaging-threads', conferenceId],
      });
    },
  });

  // Internal note
  const noteMutation = useMutation({
    mutationFn: async ({ threadId, bodyHtml }: { threadId: string; bodyHtml: string }) => {
      const resp = await api.post(`${basePath}/threads/${threadId}/note`, {
        body_html: bodyHtml,
      });
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['messaging-thread', conferenceId, selectedThreadId],
      });
      queryClient.invalidateQueries({
        queryKey: ['messaging-threads', conferenceId],
      });
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Failed to save note'), 'error');
    },
  });

  // Archive / unarchive
  const archiveMutation = useMutation({
    mutationFn: async ({ threadId, archive }: { threadId: string; archive: boolean }) => {
      await api.post(`${basePath}/threads/${threadId}/${archive ? 'archive' : 'unarchive'}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['messaging-threads', conferenceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['messaging-thread', conferenceId, selectedThreadId],
      });
    },
  });

  // Mark as read when opening a thread
  const handleSelectThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId);
      try {
        await api.post(`${basePath}/threads/${threadId}/read`);
        queryClient.invalidateQueries({
          queryKey: ['messaging-threads', conferenceId],
        });
      } catch {
        // Silent - read tracking is not critical
      }
    },
    [basePath, conferenceId, queryClient]
  );

  // Double-click handler: opens compose popup pre-filled with that message
  const handleDoubleClickMessage = useCallback((subject: string, bodyHtml: string) => {
    setComposePrefill({ subject: `Fwd: ${subject}`, body_html: bodyHtml });
    setShowCompose(true);
  }, []);

  const threads = threadList?.items ?? [];

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
      style={{ height: 'calc(100vh - 120px)' }}
    >
      {/* Email-only banner */}
      {emailOnly && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 text-sm text-amber-800">
          <svg
            className="w-4 h-4 flex-shrink-0"
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
          Messages are delivered as email only. In-app messaging is disabled for this conference.
        </div>
      )}

      {/* Toolbar */}
      <div className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        {/* Row 1: Title + actions */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messages</h2>
            {threadList && (
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                {threadList.total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkCompose(true)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Bulk Send
            </button>
            <button
              onClick={() => {
                setComposePrefill(null);
                setShowCompose(true);
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Compose
            </button>
          </div>
        </div>
        {/* Row 2: Filters + search */}
        <div className="flex items-center justify-between px-4 pb-2.5 gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setShowArchived(!showArchived);
                setPage(1);
                setSelectedThreadId(null);
              }}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                showArchived
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {showArchived ? 'Showing Archived' : 'Archived'}
            </button>
            <button
              onClick={() => {
                setFilterFlagged(!filterFlagged);
                setPage(1);
              }}
              className={`text-xs font-medium px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                filterFlagged
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 border border-yellow-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title="Show flagged threads"
            >
              <svg
                className="w-3 h-3"
                fill={filterFlagged ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
              Flagged
            </button>
            <button
              onClick={() => {
                setFilterAttachments(!filterAttachments);
                setPage(1);
              }}
              className={`text-xs font-medium px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                filterAttachments
                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title="Show threads with attachments"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              Files
            </button>
            <button
              onClick={() => {
                setFilterUnread(!filterUnread);
                setPage(1);
              }}
              className={`text-xs font-medium px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                filterUnread
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border border-blue-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title="Show unread threads"
            >
              <svg
                className="w-3 h-3"
                fill={filterUnread ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="4" />
              </svg>
              Unread
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg
                className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
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
              <input
                type="text"
                placeholder="Search messages..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md w-44 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <input
              type="text"
              placeholder="Participant..."
              value={filterParticipant}
              onChange={(e) => {
                setFilterParticipant(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md w-32 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* Thread list */}
        <div
          className={`w-full lg:w-80 border-r dark:border-gray-700 overflow-y-auto flex-shrink-0 ${
            selectedThreadId ? 'hidden lg:block' : ''
          }`}
        >
          {loadingThreads ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
              Loading...
            </div>
          ) : (
            <ThreadList
              threads={threads}
              selectedId={selectedThreadId}
              onSelect={handleSelectThread}
              onDoubleClick={(threadId) => {
                setPopupThreadId(threadId);
                api
                  .post(`${basePath}/threads/${threadId}/read`)
                  .catch((err) => console.error('Failed to mark thread as read:', err));
                queryClient.invalidateQueries({
                  queryKey: ['messaging-threads', conferenceId],
                });
              }}
              onArchive={(threadId, archive) => archiveMutation.mutate({ threadId, archive })}
              showArchived={showArchived}
            />
          )}
          {/* Pagination */}
          {threadList && threadList.total > 50 && (
            <div className="flex items-center justify-center gap-2 p-3 border-t dark:border-gray-700">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm text-gray-500 dark:text-gray-400 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={threads.length < 50}
                className="text-sm text-gray-500 dark:text-gray-400 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Thread detail */}
        <div className={`flex-1 ${selectedThreadId ? '' : 'hidden lg:flex'} flex flex-col`}>
          {selectedThreadId && threadDetail ? (
            <ThreadDetail
              thread={threadDetail}
              conferenceId={conferenceId}
              currentUserId={user?.id ?? ''}
              onReply={(html, attachmentIds) =>
                replyMutation.mutate({ body_html: html, attachment_ids: attachmentIds })
              }
              onBack={() => setSelectedThreadId(null)}
              replying={replyMutation.isPending}
              onArchive={(archive) =>
                archiveMutation.mutate({ threadId: threadDetail.id, archive })
              }
              onDoubleClickMessage={handleDoubleClickMessage}
              onFlag={() => flagMutation.mutate(threadDetail.id)}
              onCreateNote={(bodyHtml) =>
                noteMutation.mutate({ threadId: threadDetail.id, bodyHtml })
              }
              noteSending={noteMutation.isPending}
            />
          ) : loadingDetail && selectedThreadId ? (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
              Loading...
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
              Select a thread or compose a new message
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <FullComposeModal
        conferenceId={conferenceId}
        open={showCompose}
        onClose={() => {
          setShowCompose(false);
          setComposePrefill(null);
        }}
        onSend={(data) => createThread.mutate(data)}
        sending={createThread.isPending}
        prefill={composePrefill}
        emailOnlyMode={emailOnly}
      />
      <BulkComposeModal
        conferenceId={conferenceId}
        open={showBulkCompose}
        onClose={() => setShowBulkCompose(false)}
        onSend={(data) => bulkSend.mutate(data)}
        sending={bulkSend.isPending}
      />

      {/* Thread pop-up modal (double-click from sidebar) */}
      {popupThreadId && popupThreadDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPopupThreadId(null)} />
          <div
            className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col resize overflow-hidden"
            style={{
              width: '672px',
              height: 'min(85vh, 800px)',
              minWidth: '380px',
              minHeight: '360px',
              maxWidth: '95vw',
              maxHeight: '95vh',
            }}
          >
            <ThreadDetail
              isPopup
              thread={popupThreadDetail}
              conferenceId={conferenceId}
              currentUserId={user?.id ?? ''}
              onReply={(html, attachmentIds) =>
                popupReplyMutation.mutate({
                  threadId: popupThreadId,
                  body_html: html,
                  attachment_ids: attachmentIds,
                })
              }
              onBack={() => setPopupThreadId(null)}
              replying={popupReplyMutation.isPending}
              onArchive={(archive) => archiveMutation.mutate({ threadId: popupThreadId, archive })}
              onFlag={() => flagMutation.mutate(popupThreadId)}
              onCreateNote={(bodyHtml) =>
                noteMutation.mutate({ threadId: popupThreadId, bodyHtml })
              }
              noteSending={noteMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}
