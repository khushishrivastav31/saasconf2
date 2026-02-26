import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import MessageFileAttach, { type StagedAttachment } from '../../../../components/MessageFileAttach';
import type { MessageTemplateListResponse } from '../../../../types/messaging';
import OverlaySelector from '../../../../components/OverlaySelector';

const TEMPLATE_VARIABLES = [
  { label: 'First Name', token: '[First Name]' },
  { label: 'Last Name', token: '[Last Name]' },
  { label: 'Email', token: '[Email]' },
  { label: 'Conference', token: '[Conference Name]' },
  { label: 'Paper Title', token: '[Paper Title]' },
];

interface Applicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface FullComposeModalProps {
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
  /** Pre-fill data for edit/forward mode (double-click a message) */
  prefill?: {
    subject?: string;
    body_html?: string;
  } | null;
  emailOnlyMode?: boolean;
}

export default function FullComposeModal({
  conferenceId,
  open,
  onClose,
  onSend,
  sending,
  prefill,
  emailOnlyMode,
}: FullComposeModalProps) {
  const [selectedRecipients, setSelectedRecipients] = useState<Applicant[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [search, setSearch] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [screenOverlayId, setScreenOverlayId] = useState<string | null>(null);

  // Fetch applicants
  const { data: allApplicants } = useQuery({
    queryKey: ['cfp-applicants-for-messaging', conferenceId],
    queryFn: async () => {
      const resp = await api.get(`/cfp/applicants?conference_id=${conferenceId}`);
      return resp.data.items as Applicant[];
    },
    enabled: open,
  });

  // Fetch templates
  const { data: templatesData } = useQuery<MessageTemplateListResponse>({
    queryKey: ['message-templates', conferenceId],
    queryFn: () => api.get(`/conferences/${conferenceId}/messaging/templates`).then((r) => r.data),
    enabled: open,
  });

  const templates = templatesData?.items ?? [];

  // Filter applicants
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

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setSelectedRecipients([]);
      setSubject('');
      setBodyHtml('');
      setSearch('');
      setAttachments([]);
      setSelectedTemplate('');
      setScreenOverlayId(null);
    }
  }, [open]);

  // Apply prefill when opened
  useEffect(() => {
    if (open && prefill) {
      if (prefill.subject) setSubject(prefill.subject);
      if (prefill.body_html) setBodyHtml(prefill.body_html);
    }
  }, [open, prefill]);

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplate(templateId);
    setSubject(tmpl.subject);
    setBodyHtml(tmpl.body_html);
  };

  if (!open) return null;

  const canSend = selectedRecipients.length > 0 && subject.trim() && bodyHtml.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col"
        style={{ height: 'min(85vh, 800px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {prefill ? 'Forward Message' : 'New Message'}
            </h2>
            {emailOnlyMode && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Email only
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template picker */}
          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600 flex-shrink-0">Template:</label>
              <select
                value={selectedTemplate}
                onChange={(e) => handleApplyTemplate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm flex-1 max-w-xs"
              >
                <option value="">Use a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
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
            <input
              type="text"
              placeholder="Search applicants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            {search.trim() && filteredApplicants && filteredApplicants.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md mt-1">
                {filteredApplicants.slice(0, 20).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedRecipients((prev) => [...prev, a]);
                      setSearch('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0"
                  >
                    {a.first_name} {a.last_name} <span className="text-gray-400">{a.email}</span>
                  </button>
                ))}
              </div>
            )}
            {search.trim() && filteredApplicants && filteredApplicants.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">No applicants found</p>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Message subject"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              maxLength={500}
            />
          </div>

          {/* Variable pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">Insert variable:</span>
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() =>
                  setBodyHtml((prev) => {
                    if (!prev || prev === '<p></p>') return `<p>${v.token}</p>`;
                    if (prev.endsWith('</p>')) return prev.slice(0, -4) + v.token + '</p>';
                    return prev + v.token;
                  })
                }
                className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Body — takes up remaining space */}
          <div className="flex-1 min-h-0">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message... Use variables like [First Name] for personalization."
              rows={12}
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

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
