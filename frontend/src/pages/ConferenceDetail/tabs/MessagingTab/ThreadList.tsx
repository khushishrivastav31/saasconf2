import type { ThreadListItem } from "../../../../types";

interface ThreadListProps {
  threads: ThreadListItem[];
  selectedId: string | null;
  onSelect: (threadId: string) => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ThreadList({
  threads,
  selectedId,
  onSelect,
}: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        No messages yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {threads.map((thread) => {
        const recipientName = thread.other_participants.length > 0
          ? thread.other_participants
              .map((p) => `${p.first_name} ${p.last_name}`.trim())
              .join(", ")
          : "Unknown";

        return (
          <button
            key={thread.id}
            onClick={() => onSelect(thread.id)}
            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
              selectedId === thread.id ? "bg-blue-50 border-l-2 border-l-blue-600" : ""
            } ${thread.unread ? "bg-blue-50/40" : ""}`}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {thread.unread && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                )}
                <span
                  className={`text-sm truncate ${
                    thread.unread ? "font-semibold text-gray-900" : "font-medium text-gray-800"
                  }`}
                >
                  {recipientName}
                </span>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatDate(thread.last_message_at)}
              </span>
            </div>
            <p className={`text-xs truncate ${thread.unread ? "font-medium text-gray-700" : "text-gray-500"}`}>
              {thread.subject}
            </p>
            {thread.last_message_preview && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {thread.last_message_preview}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
