import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import RichTextEditor from '../../components/common/RichTextEditor';
import RichTextDisplay from '../../components/common/RichTextDisplay';
import MessageFileAttach, { type StagedAttachment } from '../../components/MessageFileAttach';
import { formatDate, formatDateTime, formatTime } from '../../utils/formatDate';
import type {
  PortalThreadListResponse,
  PortalThreadDetailResponse,
  PortalConferenceSummary,
  PortalMessageAttachmentInfo,
} from '../../types/portal';

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return formatTime(dateStr);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return formatDate(dateStr);
  return formatDate(dateStr);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PortalAttachmentDisplay({
  attachment,
  isMe,
}: {
  attachment: PortalMessageAttachmentInfo;
  isMe: boolean;
}) {
  const handleDownload = async () => {
    const response = await portalApi.get(`/portal/messages/attachments/${attachment.id}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', attachment.filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded mt-1 ${
        isMe
          ? 'bg-blue-500/30 text-blue-100 hover:bg-blue-500/50'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      <svg
        className="w-3.5 h-3.5 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
        />
      </svg>
      <span className="truncate max-w-[200px]">{attachment.filename}</span>
      <span className="opacity-70 flex-shrink-0">({formatFileSize(attachment.file_size)})</span>
    </button>
  );
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadIdParam) setSelectedThreadId(threadIdParam);
  }, [threadIdParam]);

  // Thread list
  const { data: threadList, isLoading } = useQuery({
    queryKey: ['portal-messages', showArchived],
    queryFn: async () => {
      const params = new URLSearchParams({ archived: String(showArchived) });
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadDetail?.messages.length]);

  const threads = threadList?.items ?? [];

  // Read receipt helpers
  const otherParticipants =
    threadDetail?.participants.filter((p) => !(p.type === 'applicant' && p.id === applicant?.id)) ??
    [];

  const getSeenInfo = (msgCreatedAt: string) => {
    const msgTime = new Date(msgCreatedAt).getTime();
    return otherParticipants.filter(
      (p) => p.last_read_at && new Date(p.last_read_at).getTime() >= msgTime
    );
  };

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
        <div className="flex" style={{ height: 'calc(100vh - 220px)' }}>
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
              <>
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
                  <button
                    onClick={() => {
                      setSelectedThreadId(null);
                      setSearchParams({});
                    }}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 lg:hidden"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {threadDetail.subject}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Conversation with Organizer
                    </p>
                  </div>
                  {/* Archive button */}
                  <button
                    onClick={() =>
                      archiveMutation.mutate({
                        threadId: threadDetail.id,
                        archive: !isArchived,
                      })
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      isArchived
                        ? 'text-blue-700 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                        : 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
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
                    {isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50 dark:bg-gray-900">
                  {threadDetail.messages.map((msg) => {
                    const isMe = msg.sender.type === 'applicant' && msg.sender.id === applicant?.id;
                    const readers = isMe ? getSeenInfo(msg.created_at) : [];

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-4 py-3 ${
                            isMe
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-medium ${
                                isMe ? 'text-blue-100' : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {isMe ? 'You' : `${msg.sender.first_name} ${msg.sender.last_name}`}
                            </span>
                            <span
                              className={`text-xs ${isMe ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}
                            >
                              {formatDateTime(msg.created_at)}
                            </span>
                          </div>
                          <div className={`text-sm ${isMe ? 'prose-invert' : ''}`}>
                            <RichTextDisplay content={msg.body_html} />
                          </div>
                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {msg.attachments.map((att) => (
                                <PortalAttachmentDisplay
                                  key={att.id}
                                  attachment={att}
                                  isMe={isMe}
                                />
                              ))}
                            </div>
                          )}
                          {/* Read receipt */}
                          {isMe && readers.length > 0 && (
                            <div className="mt-1.5 text-right">
                              <span className="text-[10px] text-blue-200">
                                Seen by{' '}
                                {readers
                                  .map((r) => `${r.first_name} ${r.last_name}`.trim())
                                  .join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply */}
                <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-3">
                  <RichTextEditor
                    value={replyHtml}
                    onChange={setReplyHtml}
                    placeholder="Type your reply..."
                    rows={3}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <MessageFileAttach
                      apiClient={portalApi}
                      uploadPath="/portal/messages/upload"
                      attachments={replyAttachments}
                      onAttachmentsChange={setReplyAttachments}
                    />
                    <button
                      onClick={() =>
                        replyMutation.mutate({
                          body_html: replyHtml,
                          attachment_ids: replyAttachments.map((a) => a.id),
                        })
                      }
                      disabled={!replyHtml.trim() || replyMutation.isPending}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
                    >
                      {replyMutation.isPending ? 'Sending...' : 'Reply'}
                    </button>
                  </div>
                </div>
              </>
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

function PortalComposeModal({
  onClose,
  onSend,
  sending,
}: {
  onClose: () => void;
  onSend: (data: {
    conference_id: string;
    subject: string;
    body_html: string;
    attachment_ids: string[];
  }) => void;
  sending: boolean;
}) {
  const [conferenceId, setConferenceId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);

  // Fetch conferences the applicant has access to
  const { data: conferences } = useQuery({
    queryKey: ['portal-conferences'],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceSummary[]>('/portal/conferences');
      return res.data;
    },
  });

  // Auto-select if only one conference
  useEffect(() => {
    if (conferences?.length === 1 && !conferenceId) {
      setConferenceId(conferences[0].id);
    }
  }, [conferences, conferenceId]);

  const canSend = conferenceId && subject.trim() && bodyHtml.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col"
        style={{ height: 'min(80vh, 700px)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Message</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Conference selector */}
          {conferences && conferences.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Conference
              </label>
              <select
                value={conferenceId}
                onChange={(e) => setConferenceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select a conference...</option>
                {conferences.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {conferences && conferences.length === 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {conferences[0].name} organizers
              </p>
            </div>
          )}
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Message subject"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
              maxLength={500}
            />
          </div>
          {/* Body */}
          <div className="flex-1 min-h-0">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message
            </label>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message..."
              rows={10}
            />
          </div>
          {/* Attachments */}
          <MessageFileAttach
            apiClient={portalApi}
            uploadPath="/portal/messages/upload"
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSend({
                conference_id: conferenceId,
                subject,
                body_html: bodyHtml,
                attachment_ids: attachments.map((a) => a.id),
              })
            }
            disabled={!canSend || sending}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
