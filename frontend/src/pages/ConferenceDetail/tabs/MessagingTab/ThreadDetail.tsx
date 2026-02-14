import { useState, useEffect, useRef } from "react";
import api from "../../../../config/api";
import RichTextEditor from "../../../../components/common/RichTextEditor";
import RichTextDisplay from "../../../../components/common/RichTextDisplay";
import MessageFileAttach, {
  type StagedAttachment,
} from "../../../../components/MessageFileAttach";
import type { ThreadDetailResponse, MessageAttachmentInfo } from "../../../../types";

interface ThreadDetailProps {
  thread: ThreadDetailResponse;
  conferenceId: string;
  currentUserId: string;
  onReply: (bodyHtml: string, attachmentIds: string[]) => void;
  onBack: () => void;
  replying: boolean;
}

function formatTimestamp(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    const response = await api.get(downloadUrl, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", attachment.filename);
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
          ? "bg-blue-500/30 text-blue-100 hover:bg-blue-500/50"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
      <span className="opacity-70 flex-shrink-0">
        ({formatFileSize(attachment.file_size)})
      </span>
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
}: ThreadDetailProps) {
  const [replyHtml, setReplyHtml] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<StagedAttachment[]>(
    []
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.messages.length]);

  const handleSendReply = () => {
    if (!replyHtml.trim()) return;
    onReply(
      replyHtml,
      replyAttachments.map((a) => a.id)
    );
    setReplyHtml("");
    setReplyAttachments([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-600 lg:hidden"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {thread.participants
              .filter((p) => p.type === "applicant")
              .map((p) => `${p.first_name} ${p.last_name}`.trim())
              .join(", ") || "Unknown"}
          </h3>
          <p className="text-xs text-gray-500 truncate">{thread.subject}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {thread.messages.map((msg) => {
          const isMe =
            msg.sender.type === "user" && msg.sender.id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  isMe
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-medium ${
                      isMe ? "text-blue-100" : "text-gray-600"
                    }`}
                  >
                    {msg.sender.first_name} {msg.sender.last_name}
                    {msg.sender.type === "applicant" && (
                      <span className="ml-1 text-xs opacity-75">
                        (Applicant)
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-xs ${
                      isMe ? "text-blue-200" : "text-gray-400"
                    }`}
                  >
                    {formatTimestamp(msg.created_at)}
                  </span>
                </div>
                <div className={isMe ? "prose-invert" : ""}>
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
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply */}
      <div className="border-t bg-white px-5 py-3">
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
            {replying ? "Sending..." : "Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}
