import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import Modal from '../Modal';
import RichTextEditor from '../common/RichTextEditor';
import { useToast } from '../Toast';

interface AttendeePreview {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface BroadcastResponse {
  bulk_id: string;
  registration_id: string;
  sent_count: number;
  skipped_count: number;
  recipients: { thread_id: string; email: string }[];
}

interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

interface MessageTemplateListResponse {
  items: MessageTemplate[];
  total: number;
}

interface TrainingBroadcastDialogProps {
  open: boolean;
  onClose: () => void;
  registrationId: string;
  trainingName: string;
  attendees: AttendeePreview[];
}

// The variables the backend's substitute_training_variables() recognises.
// Keep in sync with backend/app/services/training_messaging.py — there's a
// vitest contract test that fails if this list and the backend diverge.
const TRAINING_TEMPLATE_VARIABLES: { label: string; token: string }[] = [
  { label: 'First Name', token: '[First Name]' },
  { label: 'Last Name', token: '[Last Name]' },
  { label: 'Email', token: '[Email]' },
  { label: 'Training Name', token: '[Training Name]' },
  { label: 'Placement Date', token: '[Placement Date]' },
  { label: 'Company Name', token: '[Company Name]' },
];

export default function TrainingBroadcastDialog({
  open,
  onClose,
  registrationId,
  trainingName,
  attendees,
}: TrainingBroadcastDialogProps) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Templates pool is shared with the conference admin's templates — same
  // tenant, same row set. Lazy-load only when the dialog is open so we
  // don't fetch during the first render of every RegistrationRow.
  const { data: templates } = useQuery({
    queryKey: ['training-message-templates'],
    queryFn: async (): Promise<MessageTemplateListResponse> => {
      const resp = await api.get<MessageTemplateListResponse>('/trainings/messaging/templates');
      return resp.data;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const t = templates?.items.find((x) => x.id === templateId);
    if (t) {
      setSubject(t.subject);
      setBodyHtml(t.body_html);
    }
  };

  const eligibleRecipients = useMemo(
    () => attendees.filter((a) => a.email && a.email.trim().length > 0),
    [attendees]
  );

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string): Promise<MessageTemplate> => {
      const resp = await api.post<MessageTemplate>('/trainings/messaging/templates', {
        name,
        subject,
        body_html: bodyHtml,
      });
      return resp.data;
    },
    onSuccess: (saved) => {
      showToast(`Saved template "${saved.name}"`, 'success');
      queryClient.invalidateQueries({ queryKey: ['training-message-templates'] });
      setSelectedTemplateId(saved.id);
    },
    onError: (err: unknown) => {
      // axios error shape: err.response?.data?.detail typically holds a 400 message
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      showToast(detail || 'Failed to save template', 'error');
    },
  });

  const handleSaveTemplate = () => {
    const name = window.prompt('Template name?');
    if (name && name.trim().length > 0) {
      saveTemplateMutation.mutate(name.trim());
    }
  };

  const sendMutation = useMutation({
    mutationFn: async (): Promise<BroadcastResponse> => {
      const resp = await api.post<BroadcastResponse>(
        `/trainings/registrations/${registrationId}/messages/broadcast`,
        { subject, body_html: bodyHtml }
      );
      return resp.data;
    },
    onSuccess: (data) => {
      const sent = data.sent_count;
      const skipped = data.skipped_count;
      showToast(
        skipped > 0
          ? `Sent to ${sent} attendees (${skipped} skipped — missing or duplicate email)`
          : `Sent to ${sent} attendee${sent === 1 ? '' : 's'}`,
        'success'
      );
      queryClient.invalidateQueries({ queryKey: ['training-registrations'] });
      setSubject('');
      setBodyHtml('');
      setSelectedTemplateId('');
      onClose();
    },
    onError: () => showToast('Failed to send broadcast', 'error'),
  });

  const insertVariable = (token: string, target: 'subject' | 'body') => {
    if (target === 'subject') setSubject((s) => `${s}${token}`);
    else setBodyHtml((b) => `${b}${token}`);
  };

  const canSend =
    subject.trim().length > 0 &&
    bodyHtml.trim().length > 0 &&
    bodyHtml.trim() !== '<p></p>' &&
    eligibleRecipients.length > 0 &&
    !sendMutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title={`Message attendees — ${trainingName}`}>
      <div className="px-6 py-4 space-y-4">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Sending to {eligibleRecipients.length} attendee
          {eligibleRecipients.length === 1 ? '' : 's'}
          {attendees.length !== eligibleRecipients.length && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              ({attendees.length - eligibleRecipients.length} skipped — no email)
            </span>
          )}
          .
        </div>

        {templates && templates.items.length > 0 && (
          <div>
            <label
              htmlFor="training-broadcast-template"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Use template
            </label>
            <select
              id="training-broadcast-template"
              value={selectedTemplateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">— Start from scratch —</option>
              {templates.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label
            htmlFor="training-broadcast-subject"
            className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Subject
          </label>
          <input
            id="training-broadcast-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={500}
            placeholder="e.g. Reminder: [Training Name] starts soon"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label
            htmlFor="training-broadcast-body"
            className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Body
          </label>
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            placeholder="Write your message. Click a variable below to insert it."
          />
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Variables (click to insert)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRAINING_TEMPLATE_VARIABLES.map((v) => (
              <div key={v.token} className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => insertVariable(v.token, 'subject')}
                  title={`Insert ${v.token} into subject`}
                  className="px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {v.label}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable(v.token, 'body')}
                  title={`Insert ${v.token} into body`}
                  className="px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleSaveTemplate}
          disabled={
            !subject.trim() ||
            !bodyHtml.trim() ||
            bodyHtml.trim() === '<p></p>' ||
            saveTemplateMutation.isPending
          }
          className="mr-auto px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          title="Save the current subject + body as a reusable template"
        >
          {saveTemplateMutation.isPending ? 'Saving…' : 'Save as template'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={sendMutation.isPending}
          className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => sendMutation.mutate()}
          disabled={!canSend}
          className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
        >
          {sendMutation.isPending ? 'Sending…' : `Send to ${eligibleRecipients.length}`}
        </button>
      </div>
    </Modal>
  );
}

export { TRAINING_TEMPLATE_VARIABLES };
