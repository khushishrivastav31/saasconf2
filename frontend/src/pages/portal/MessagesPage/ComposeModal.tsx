import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import portalApi from '../../../config/portalApi';
import RichTextEditor from '../../../components/common/RichTextEditor';
import MessageFileAttach, { type StagedAttachment } from '../../../components/MessageFileAttach';
import type { PortalConferenceSummary } from '../../../types/portal';

export default function PortalComposeModal({
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
