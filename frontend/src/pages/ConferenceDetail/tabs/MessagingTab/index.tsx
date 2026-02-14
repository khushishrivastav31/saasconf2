import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../../config/api";
import { useAuth } from "../../../../hooks/useAuth";
import { useToast } from "../../../../components/Toast";
import { parseApiError } from "../../../../utils/apiError";
import type {
  Conference,
  ThreadListResponse,
  ThreadDetailResponse,
  BulkRecipientFilter,
} from "../../../../types";
import ThreadList from "./ThreadList";
import ThreadDetail from "./ThreadDetail";
import ComposeModal from "./ComposeModal";
import BulkComposeModal from "./BulkComposeModal";

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const basePath = `/conferences/${conferenceId}/messaging`;

  // Thread list
  const { data: threadList, isLoading: loadingThreads } = useQuery({
    queryKey: ["messaging-threads", conferenceId, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "50",
      });
      if (search) params.set("search", search);
      const resp = await api.get(`${basePath}/threads?${params}`);
      return resp.data as ThreadListResponse;
    },
  });

  // Thread detail
  const { data: threadDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["messaging-thread", conferenceId, selectedThreadId],
    queryFn: async () => {
      const resp = await api.get(`${basePath}/threads/${selectedThreadId}`);
      return resp.data as ThreadDetailResponse;
    },
    enabled: !!selectedThreadId,
  });

  // Create thread(s)
  const createThread = useMutation({
    mutationFn: async (data: {
      recipient_applicant_ids: string[];
      subject: string;
      body_html: string;
      attachment_ids: string[];
    }) => {
      const resp = await api.post(`${basePath}/threads`, data);
      return resp.data as { threads_created: number; first_thread: ThreadDetailResponse };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["messaging-threads", conferenceId],
      });
      setShowCompose(false);
      setSelectedThreadId(data.first_thread.id);
      showToast(
        data.threads_created === 1
          ? "Message sent"
          : `Message sent to ${data.threads_created} recipients`,
        "success"
      );
    },
    onError: (error) => {
      showToast(parseApiError(error, "Failed to send message"), "error");
    },
  });

  // Reply
  const replyMutation = useMutation({
    mutationFn: async (data: { body_html: string; attachment_ids: string[] }) => {
      const resp = await api.post(
        `${basePath}/threads/${selectedThreadId}/reply`,
        data
      );
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["messaging-thread", conferenceId, selectedThreadId],
      });
      queryClient.invalidateQueries({
        queryKey: ["messaging-threads", conferenceId],
      });
    },
    onError: (error) => {
      showToast(parseApiError(error, "Failed to send reply"), "error");
    },
  });

  // Bulk send
  const bulkSend = useMutation({
    mutationFn: async (data: {
      subject: string;
      body_html: string;
      recipients: BulkRecipientFilter;
    }) => {
      const resp = await api.post(`${basePath}/bulk-send`, data);
      return resp.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["messaging-threads", conferenceId],
      });
      setShowBulkCompose(false);
      showToast(`Sent to ${data.threads_created} recipients`, "success");
    },
    onError: (error) => {
      showToast(parseApiError(error, "Failed to send bulk message"), "error");
    },
  });

  // Mark as read when opening a thread
  const handleSelectThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId);
      try {
        await api.post(`${basePath}/threads/${threadId}/read`);
        queryClient.invalidateQueries({
          queryKey: ["messaging-threads", conferenceId],
        });
      } catch {
        // Silent - read tracking is not critical
      }
    },
    [basePath, conferenceId, queryClient]
  );

  const threads = threadList?.items ?? [];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
          {threadList && (
            <span className="text-sm text-gray-500">
              {threadList.total} thread{threadList.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md w-48"
          />
          <button
            onClick={() => setShowBulkCompose(true)}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Bulk Send
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Compose
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex" style={{ height: "calc(100vh - 200px)" }}>
        {/* Thread list */}
        <div
          className={`w-full lg:w-80 border-r overflow-y-auto flex-shrink-0 ${
            selectedThreadId ? "hidden lg:block" : ""
          }`}
        >
          {loadingThreads ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              Loading...
            </div>
          ) : (
            <ThreadList
              threads={threads}
              selectedId={selectedThreadId}
              onSelect={handleSelectThread}
            />
          )}
          {/* Pagination */}
          {threadList && threadList.total > 50 && (
            <div className="flex items-center justify-center gap-2 p-3 border-t">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm text-gray-500 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-400">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={threads.length < 50}
                className="text-sm text-gray-500 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Thread detail */}
        <div
          className={`flex-1 ${
            selectedThreadId ? "" : "hidden lg:flex"
          } flex flex-col`}
        >
          {selectedThreadId && threadDetail ? (
            <ThreadDetail
              thread={threadDetail}
              conferenceId={conferenceId}
              currentUserId={user?.id ?? ""}
              onReply={(html, attachmentIds) =>
                replyMutation.mutate({ body_html: html, attachment_ids: attachmentIds })
              }
              onBack={() => setSelectedThreadId(null)}
              replying={replyMutation.isPending}
            />
          ) : loadingDetail && selectedThreadId ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Loading...
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select a thread or compose a new message
            </div>
          )}
        </div>
      </div>

      {/* Compose modals */}
      <ComposeModal
        conferenceId={conferenceId}
        open={showCompose}
        onClose={() => setShowCompose(false)}
        onSend={(data) => createThread.mutate(data)}
        sending={createThread.isPending}
      />
      <BulkComposeModal
        conferenceId={conferenceId}
        open={showBulkCompose}
        onClose={() => setShowBulkCompose(false)}
        onSend={(data) => bulkSend.mutate(data)}
        sending={bulkSend.isPending}
      />
    </div>
  );
}
