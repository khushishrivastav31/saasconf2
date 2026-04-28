import { useEffect, useRef } from 'react';
import portalApi from '../../../config/portalApi';
import RichTextEditor from '../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../components/common/RichTextDisplay';
import MessageFileAttach, { type StagedAttachment } from '../../../components/MessageFileAttach';
import { formatDateTime } from '../../../utils/formatDate';
import type { PortalThreadDetailResponse } from '../../../types/portal';
import PortalAttachmentDisplay from './AttachmentDisplay';

interface ThreadDetailPaneProps {
  threadDetail: PortalThreadDetailResponse;
  applicantId?: string;
  isArchived: boolean;
  replyHtml: string;
  setReplyHtml: (html: string) => void;
  replyAttachments: StagedAttachment[];
  setReplyAttachments: (a: StagedAttachment[]) => void;
  isReplying: boolean;
  onReply: () => void;
  onArchiveToggle: () => void;
  onBack: () => void;
}

export default function ThreadDetailPane({
  threadDetail,
  applicantId,
  isArchived,
  replyHtml,
  setReplyHtml,
  replyAttachments,
  setReplyAttachments,
  isReplying,
  onReply,
  onArchiveToggle,
  onBack,
}: ThreadDetailPaneProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadDetail.messages.length]);

  const otherParticipants = threadDetail.participants.filter(
    (p) => !(p.type === 'applicant' && p.id === applicantId)
  );

  const getSeenInfo = (msgCreatedAt: string) => {
    const msgTime = new Date(msgCreatedAt).getTime();
    return otherParticipants.filter(
      (p) => p.last_read_at && new Date(p.last_read_at).getTime() >= msgTime
    );
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={onBack}
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
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {threadDetail.domain_entity_name
              ? `${threadDetail.domain === 'training' ? 'Training' : 'Conference'}: ${threadDetail.domain_entity_name}`
              : 'Conversation with Organizer'}
          </p>
        </div>
        {/* Archive button */}
        <button
          onClick={onArchiveToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            isArchived
              ? 'text-blue-700 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50 dark:bg-gray-900">
        {threadDetail.messages.map((msg) => {
          // Backend marks ``is_me=true`` for any of the portal user's
          // identities (applicant + training_attendee). Fall back to the
          // legacy applicant-only check so older API responses still work.
          const isMe =
            msg.sender.is_me ?? (msg.sender.type === 'applicant' && msg.sender.id === applicantId);
          const readers = isMe ? getSeenInfo(msg.created_at) : [];

          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
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
                      <PortalAttachmentDisplay key={att.id} attachment={att} isMe={isMe} />
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
            onClick={onReply}
            disabled={!replyHtml.trim() || isReplying}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
          >
            {isReplying ? 'Sending...' : 'Reply'}
          </button>
        </div>
      </div>
    </>
  );
}
