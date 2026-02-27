import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import MessageFileAttach, { type StagedAttachment } from '../../../../components/MessageFileAttach';
import OverlaySelector from '../../../../components/OverlaySelector';

interface ComposeModalProps {
  conferenceId: string;
  open: boolean;
  onClose: () => void;
  onSend: (data: {
    recipient_applicant_ids: string[];
    subject: string;
    body_html: string;
    attachment_ids: string[];
    screen_overlay_id?: string | null;
  }) => void;
  sending: boolean;
}

interface Applicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export default function ComposeModal({
  conferenceId,
  open,
  onClose,
  onSend,
  sending,
}: ComposeModalProps) {
  const [selectedRecipients, setSelectedRecipients] = useState<Applicant[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [search, setSearch] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [screenOverlayId, setScreenOverlayId] = useState<string | null>(null);

  // Fetch applicants for recipient picker
  const { data: allApplicants } = useQuery({
    queryKey: ['cfp-applicants-for-messaging', conferenceId],
    queryFn: async () => {
      const resp = await api.get(`/cfp/applicants?conference_id=${conferenceId}`);
      return resp.data.items as Applicant[];
    },
    enabled: open,
  });

  // Client-side search filtering, excluding already selected
  const selectedIds = new Set(selectedRecipients.map((r) => r.id));
  const filteredApplicants = allApplicants?.filter((a) => {
    if (selectedIds.has(a.id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.first_name.toLowerCase().includes(q) ||
      a.last_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!open) {
      setSelectedRecipients([]);
      setSubject('');
      setBodyHtml('');
      setSearch('');
      setAttachments([]);
      setScreenOverlayId(null);
    }
  }, [open]);

  if (!open) return null;

  const canSend = selectedRecipients.length > 0 && subject.trim() && bodyHtml.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-gray-100">New Message</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
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
          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              To
            </label>
            {/* Selected recipients chips */}
            {selectedRecipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedRecipients.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 text-sm text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full"
                  >
                    {r.first_name} {r.last_name}
                    <button
                      onClick={() =>
                        setSelectedRecipients((prev) => prev.filter((p) => p.id !== r.id))
                      }
                      className="text-blue-400 hover:text-blue-600 ml-0.5"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Search input */}
            <input
              type="text"
              placeholder="Search applicants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
            />
            {/* Dropdown results */}
            {search.trim() && filteredApplicants && filteredApplicants.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md mt-1">
                {filteredApplicants.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedRecipients((prev) => [...prev, a]);
                      setSearch('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b last:border-b-0 dark:border-gray-700 dark:text-gray-200"
                  >
                    {a.first_name} {a.last_name}{' '}
                    <span className="text-gray-400 dark:text-gray-500">{a.email}</span>
                  </button>
                ))}
              </div>
            )}
            {search.trim() && filteredApplicants && filteredApplicants.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No applicants found</p>
            )}
          </div>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message
            </label>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message..."
              rows={6}
            />
          </div>
          {/* Attachments */}
          <MessageFileAttach
            apiClient={api}
            uploadPath={`/conferences/${conferenceId}/messaging/upload`}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />

          <OverlaySelector
            conferenceId={conferenceId}
            value={screenOverlayId}
            onChange={setScreenOverlayId}
          />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSend({
                recipient_applicant_ids: selectedRecipients.map((r) => r.id),
                subject,
                body_html: bodyHtml,
                attachment_ids: attachments.map((a) => a.id),
                screen_overlay_id: screenOverlayId,
              })
            }
            disabled={!canSend || sending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
