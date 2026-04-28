import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import RichTextEditor, {
  type RichTextEditorHandle,
} from '../../../../components/common/RichTextEditor';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';
import MessageFileAttach, { type StagedAttachment } from '../../../../components/MessageFileAttach';
import { useToast } from '../../../../components/Toast';
import { formatDateTime } from '../../../../utils/formatDate';
import type { ThreadDetailResponse } from './types';

interface Props {
  detail: ThreadDetailResponse;
}

/**
 * Right-pane view of a single training thread for admins.
 *
 * Shows the message history (with self-side bubble styling driven by
 * the BE-provided ``sender.is_me``), an Archive/Unarchive button, and
 * a reply box that supports rich-text + attachments. Mark-as-read is
 * handled by the parent so the list query can refresh on selection.
 */
export default function ThreadDetailPane({ detail }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [replyHtml, setReplyHtml] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const replyMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/trainings/messaging/threads/${detail.id}/reply`, {
        body_html: replyHtml,
        attachment_ids: attachments.map((a) => a.id),
      });
    },
    onSuccess: () => {
      setReplyHtml('');
      setAttachments([]);
      queryClient.invalidateQueries({ queryKey: ['training-admin-thread', detail.id] });
      queryClient.invalidateQueries({ queryKey: ['training-admin-threads'] });
      showToast('Reply sent', 'success');
    },
    onError: () => showToast('Failed to send reply', 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: async (archive: boolean) => {
      const path = archive ? 'archive' : 'unarchive';
      await api.post(`/trainings/messaging/threads/${detail.id}/${path}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-admin-threads'] });
      queryClient.invalidateQueries({ queryKey: ['training-admin-thread', detail.id] });
    },
    onError: () => showToast('Failed to update thread', 'error'),
  });

  const replyDisabled =
    replyHtml.trim().length === 0 || replyHtml.trim() === '<p></p>' || replyMutation.isPending;

  return (
    <>
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
            {detail.subject}
          </h3>
          {detail.domain_entity_name && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {detail.domain_entity_name}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => archiveMutation.mutate(detail.archived_at == null)}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {detail.archived_at ? 'Unarchive' : 'Archive'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50 dark:bg-gray-900">
        {detail.messages.map((m) => {
          const mine = m.sender.is_me ?? false;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-4 py-3 ${
                  mine
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-medium ${
                      mine ? 'text-blue-100' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {mine
                      ? 'You'
                      : `${m.sender.first_name} ${m.sender.last_name}`.trim() || m.sender.email}
                  </span>
                  <span
                    className={`text-xs ${mine ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}
                  >
                    {formatDateTime(m.created_at)}
                  </span>
                </div>
                <div className={`text-sm ${mine ? 'prose-invert' : ''}`}>
                  <RichTextDisplay content={m.body_html} />
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {m.attachments.map((att) => (
                      <li
                        key={att.id}
                        className={`text-xs ${
                          mine ? 'text-blue-100' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        📎 {att.filename}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 space-y-2 bg-white dark:bg-gray-900">
        <RichTextEditor
          ref={editorRef}
          value={replyHtml}
          onChange={setReplyHtml}
          placeholder="Write a reply…"
          rows={3}
        />
        <MessageFileAttach
          apiClient={api}
          uploadPath="/trainings/messaging/upload"
          attachments={attachments}
          onAttachmentsChange={setAttachments}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => replyMutation.mutate()}
            disabled={replyDisabled}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
          >
            {replyMutation.isPending ? 'Sending…' : 'Reply'}
          </button>
        </div>
      </div>
    </>
  );
}
