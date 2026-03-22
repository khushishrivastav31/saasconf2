import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { formatDateTime } from '../../../../utils/formatDate';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';
import MessageFileAttach, { type StagedAttachment } from '../../../../components/MessageFileAttach';
import type { ThreadDetailResponse, MessageAttachmentInfo } from '../../../../types';
import type { MessageTemplateListResponse } from '../../../../types/messaging';

interface ThreadDetailProps {
  thread: ThreadDetailResponse;
  conferenceId: string;
  currentUserId: string;
  onReply: (bodyHtml: string, attachmentIds: string[]) => void;
  onBack: () => void;
  replying: boolean;
  onArchive?: (archive: boolean) => void;
  onDoubleClickMessage?: (subject: string, bodyHtml: string) => void;
  onFlag?: () => void;
  onCreateNote?: (bodyHtml: string) => void;
  noteSending?: boolean;
  /** When true, always shows the back/close button (used in popup modal) */
  isPopup?: boolean;
}

function formatTimestamp(dateStr: string) {
  return formatDateTime(dateStr);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentDisplay({
  attachment,
  isMe,
  downloadUrl,
}: {
  attachment: MessageAttachmentInfo;
  isMe: boolean;
  downloadUrl: string;
}) {
  const handleDownload = async () => {
    const response = await api.get(downloadUrl, { responseType: 'blob' });
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

export default function ThreadDetail({
  thread,
  conferenceId,
  currentUserId,
  onReply,
  onBack,
  replying,
  onArchive,
  onDoubleClickMessage,
  onFlag,
  onCreateNote,
  noteSending,
  isPopup,
}: ThreadDetailProps) {
  const [replyHtml, setReplyHtml] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<StagedAttachment[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch templates for reply
  const { data: templatesData } = useQuery<MessageTemplateListResponse>({
    queryKey: queryKeys.messaging.templates(conferenceId),
    queryFn: () => api.get(`/conferences/${conferenceId}/messaging/templates`).then((r) => r.data),
  });

  const templates = templatesData?.items ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.messages.length]);

  const handleSendReply = () => {
    if (!replyHtml.trim()) return;
    onReply(
      replyHtml,
      replyAttachments.map((a) => a.id)
    );
    setReplyHtml('');
    setReplyAttachments([]);
  };

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      setReplyHtml(tmpl.body_html);
    }
    setShowTemplatePicker(false);
  };

  // Read receipt: find other participants who have read
  const otherParticipants = thread.participants.filter(
    (p) => !(p.type === 'user' && p.id === currentUserId)
  );

  // Determine "seen" for each message sent by current user
  const getSeenInfo = (msgCreatedAt: string) => {
    const msgTime = new Date(msgCreatedAt).getTime();
    const readers = otherParticipants.filter(
      (p) => p.last_read_at && new Date(p.last_read_at).getTime() >= msgTime
    );
    return readers;
  };

  const isArchived = !!thread.archived_at;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={onBack}
          className={`text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ${isPopup ? '' : 'lg:hidden'}`}
          title={isPopup ? 'Close' : 'Back'}
          aria-label={isPopup ? 'Close' : 'Back'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isPopup ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            )}
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {thread.participants
              .filter((p) => p.type === 'applicant')
              .map((p) => `${p.first_name} ${p.last_name}`.trim())
              .join(', ') || 'Unknown'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{thread.subject}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Flag button */}
          {onFlag && (
            <button
              onClick={onFlag}
              className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 transition-colors"
              title="Toggle flag"
              aria-label="Toggle flag"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </button>
          )}
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Export thread"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                <button
                  onClick={async () => {
                    setShowExportMenu(false);
                    const resp = await api.get(
                      `/conferences/${conferenceId}/messaging/threads/${thread.id}/export?format=html`,
                      { responseType: 'blob' }
                    );
                    const url = window.URL.createObjectURL(new Blob([resp.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `thread-${thread.id}.html`);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  Export as HTML
                </button>
                <button
                  onClick={async () => {
                    setShowExportMenu(false);
                    const resp = await api.get(
                      `/conferences/${conferenceId}/messaging/threads/${thread.id}/export?format=text`,
                      { responseType: 'blob' }
                    );
                    const url = window.URL.createObjectURL(new Blob([resp.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `thread-${thread.id}.txt`);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  Export as Text
                </button>
              </div>
            )}
          </div>
          {/* Archive button */}
          {onArchive && (
            <button
              onClick={() => {
                if (isArchived) {
                  onArchive(false);
                } else {
                  setShowArchiveConfirm(true);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                isArchived
                  ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border-blue-200 hover:bg-blue-100'
                  : 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              {isArchived ? 'Unarchive' : 'Archive'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
        {thread.messages.map((msg) => {
          const isMe = msg.sender.type === 'user' && msg.sender.id === currentUserId;
          const readers = isMe ? getSeenInfo(msg.created_at) : [];

          // Internal note: distinct centered styling
          if (msg.is_internal_note) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="max-w-[85%] rounded-lg p-3 bg-amber-50 dark:bg-amber-900/30 border border-dashed border-amber-300">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      Internal Note
                    </span>
                    <span className="text-xs text-amber-600">
                      {msg.sender.first_name} {msg.sender.last_name}
                    </span>
                    <span className="text-xs text-amber-400">
                      {formatTimestamp(msg.created_at)}
                    </span>
                  </div>
                  <div className="text-sm text-amber-900">
                    <RichTextDisplay content={msg.body_html} />
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              onDoubleClick={() => {
                if (onDoubleClickMessage) {
                  onDoubleClickMessage(thread.subject, msg.body_html);
                }
              }}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  isMe
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                } ${onDoubleClickMessage ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-medium ${
                      isMe ? 'text-blue-100' : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {msg.sender.first_name} {msg.sender.last_name}
                    {msg.sender.type === 'applicant' && (
                      <span className="ml-1 text-xs opacity-75">(Applicant)</span>
                    )}
                  </span>
                  <span
                    className={`text-xs ${
                      isMe ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {formatTimestamp(msg.created_at)}
                  </span>
                </div>
                <div className={isMe ? 'prose-invert' : ''}>
                  <RichTextDisplay content={msg.body_html} />
                </div>
                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {msg.attachments.map((att) => (
                      <AttachmentDisplay
                        key={att.id}
                        attachment={att}
                        isMe={isMe}
                        downloadUrl={`/conferences/${conferenceId}/messaging/attachments/${att.id}/download`}
                      />
                    ))}
                  </div>
                )}
                {/* Read receipt */}
                {isMe && readers.length > 0 && (
                  <div className="mt-1.5 text-right">
                    <span className="text-[10px] text-blue-200">
                      Seen by{' '}
                      {readers.map((r) => `${r.first_name} ${r.last_name}`.trim()).join(', ')}
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
        <div className="flex items-center gap-2 mb-2">
          {/* Template picker button */}
          {templates.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Template
              </button>
              {showTemplatePicker && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleApplyTemplate(t.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <RichTextEditor
          value={replyHtml}
          onChange={setReplyHtml}
          placeholder="Type your reply..."
          rows={3}
        />
        <div className="flex items-center justify-between mt-2">
          <MessageFileAttach
            apiClient={api}
            uploadPath={`/conferences/${conferenceId}/messaging/upload`}
            attachments={replyAttachments}
            onAttachmentsChange={setReplyAttachments}
          />
          <button
            onClick={handleSendReply}
            disabled={!replyHtml.trim() || replying}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
          >
            {replying ? 'Sending...' : 'Reply'}
          </button>
        </div>
      </div>

      {/* Internal note input */}
      {onCreateNote && (
        <div className="border-t border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-900/20 px-5 py-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && noteText.trim()) {
                  onCreateNote(noteText.trim());
                  setNoteText('');
                }
              }}
              placeholder="Add an internal note (only visible to your team)..."
              className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-md placeholder-amber-400 dark:placeholder-amber-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button
              onClick={() => {
                if (noteText.trim()) {
                  onCreateNote(noteText.trim());
                  setNoteText('');
                }
              }}
              disabled={!noteText.trim() || noteSending}
              className="px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50"
            >
              {noteSending ? 'Saving...' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      {/* Archive confirmation dialog */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                <svg
                  className="w-5 h-5 text-amber-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Archive this thread?
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This thread will be moved to the archive. You can restore it later from the archived
              view.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowArchiveConfirm(false);
                  onArchive?.(true);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
