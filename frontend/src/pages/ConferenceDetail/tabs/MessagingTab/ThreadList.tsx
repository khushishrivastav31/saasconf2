import { useState } from 'react';
import { formatDate, formatTime } from '../../../../utils/formatDate';
import type { ThreadListItem } from '../../../../types';

interface ThreadListProps {
  threads: ThreadListItem[];
  selectedId: string | null;
  onSelect: (threadId: string) => void;
  onDoubleClick?: (threadId: string) => void;
  onArchive?: (threadId: string, archive: boolean) => void;
  showArchived?: boolean;
}

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

export default function ThreadList({
  threads,
  selectedId,
  onSelect,
  onDoubleClick,
  onArchive,
  showArchived,
}: ThreadListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);

  if (threads.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        {showArchived ? 'No archived messages' : 'No messages yet'}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {threads.map((thread) => {
        const recipientName =
          thread.other_participants.length > 0
            ? thread.other_participants
                .map((p) => `${p.first_name} ${p.last_name}`.trim())
                .join(', ')
            : 'Unknown';

        return (
          <div
            key={thread.id}
            className="relative"
            onMouseEnter={() => setHoveredId(thread.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div
              onClick={() => onSelect(thread.id)}
              onDoubleClick={() => onDoubleClick?.(thread.id)}
              className={`w-full text-left px-4 py-3 cursor-pointer select-none hover:bg-gray-50 transition-colors ${
                selectedId === thread.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
              } ${thread.unread ? 'bg-blue-50/40' : ''}`}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {thread.is_flagged && (
                    <svg
                      className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  )}
                  {thread.unread && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm truncate ${
                      thread.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'
                    }`}
                  >
                    {recipientName}
                  </span>
                  {thread.has_attachments && (
                    <svg
                      className="w-3 h-3 text-gray-400 flex-shrink-0"
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
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatRelativeDate(thread.last_message_at)}
                </span>
              </div>
              <p
                className={`text-xs truncate ${thread.unread ? 'font-medium text-gray-700' : 'text-gray-500'}`}
              >
                {thread.subject}
              </p>
              {thread.last_message_preview && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {thread.last_message_preview}
                </p>
              )}
            </div>
            {/* Archive/unarchive action on hover */}
            {hoveredId === thread.id && onArchive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (thread.archived_at) {
                    onArchive(thread.id, false);
                  } else {
                    setArchiveConfirmId(thread.id);
                  }
                }}
                className="absolute top-2 right-2 p-1 rounded bg-white shadow-sm border border-gray-200 text-gray-400 hover:text-gray-700"
                title={thread.archived_at ? 'Unarchive' : 'Archive'}
              >
                {thread.archived_at ? (
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
                      d="M3 10h18M3 6h18m-9 8v6m-3-3l3 3 3-3"
                    />
                  </svg>
                ) : (
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
                )}
              </button>
            )}

            {/* Archive confirmation popover */}
            {archiveConfirmId === thread.id && onArchive && (
              <div className="absolute top-0 right-0 z-10 mt-1 mr-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-56">
                <p className="text-xs text-gray-700 mb-2">
                  Archive this thread? You can restore it later.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchiveConfirmId(null);
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchiveConfirmId(null);
                      onArchive(thread.id, true);
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-amber-600 rounded hover:bg-amber-700"
                  >
                    Archive
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
