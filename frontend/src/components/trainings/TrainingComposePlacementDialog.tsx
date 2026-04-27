import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import Modal from '../Modal';
import RichTextEditor from '../common/RichTextEditor';
import { useToast } from '../Toast';

interface PlacementBroadcastResponse {
  bulk_id: string;
  placement_id: string;
  sent_count: number;
  skipped_count: number;
  recipients: { thread_id: string; email: string }[];
}

interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
}

interface MessageTemplateListResponse {
  items: MessageTemplate[];
  total: number;
}

interface TrainingRegistrationItem {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
  attendee_count: number;
}

interface TrainingRegistrationsResponse {
  items: TrainingRegistrationItem[];
  total: number;
  page: number;
  per_page: number;
}

interface PlacementOption {
  placement_id: string;
  training_name: string;
  training_date: string | null;
  attendee_count: number;
}

// Variables backend's substitute_training_variables() recognises.
const TRAINING_TEMPLATE_VARIABLES: { label: string; token: string }[] = [
  { label: 'First Name', token: '[First Name]' },
  { label: 'Last Name', token: '[Last Name]' },
  { label: 'Email', token: '[Email]' },
  { label: 'Training Name', token: '[Training Name]' },
  { label: 'Placement Date', token: '[Placement Date]' },
  { label: 'Company Name', token: '[Company Name]' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TrainingComposePlacementDialog({ open, onClose }: Props) {
  const [placementId, setPlacementId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Derive placement options from the registrations list (each registration
  // carries placement_id + training_name + training_date). Group by placement
  // and sum attendee counts so the picker shows "ITIL Foundation — 17.8.2026
  // (4 attendees)". Lazy-loaded only when the dialog is open.
  const { data: regs } = useQuery({
    queryKey: ['training-registrations-for-compose'],
    queryFn: async (): Promise<TrainingRegistrationsResponse> => {
      const resp = await api.get<TrainingRegistrationsResponse>('/trainings/registrations', {
        params: { per_page: 200 },
      });
      return resp.data;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const placementOptions: PlacementOption[] = useMemo(() => {
    if (!regs?.items) return [];
    const byPlacement = new Map<string, PlacementOption>();
    for (const r of regs.items) {
      const existing = byPlacement.get(r.placement_id);
      if (existing) {
        existing.attendee_count += r.attendee_count;
      } else {
        byPlacement.set(r.placement_id, {
          placement_id: r.placement_id,
          training_name: r.training_name,
          training_date: r.training_date,
          attendee_count: r.attendee_count,
        });
      }
    }
    return Array.from(byPlacement.values()).sort((a, b) => {
      const da = a.training_date || '';
      const db = b.training_date || '';
      return da.localeCompare(db);
    });
  }, [regs]);

  // Templates: shared pool with conference admin, reused via the trainings endpoint.
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

  const sendMutation = useMutation({
    mutationFn: async (): Promise<PlacementBroadcastResponse> => {
      const resp = await api.post<PlacementBroadcastResponse>(
        `/trainings/placements/${placementId}/messages/broadcast`,
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
      queryClient.invalidateQueries({ queryKey: ['training-broadcasts'] });
      setPlacementId('');
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

  const selectedPlacement = placementOptions.find((p) => p.placement_id === placementId);
  const recipientHint = selectedPlacement
    ? `${selectedPlacement.attendee_count} attendee${selectedPlacement.attendee_count === 1 ? '' : 's'} across registrations on this session`
    : 'Pick a training session above.';

  const canSend =
    placementId.length > 0 &&
    subject.trim().length > 0 &&
    bodyHtml.trim().length > 0 &&
    bodyHtml.trim() !== '<p></p>' &&
    !sendMutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title="Compose broadcast">
      <div className="px-6 py-4 space-y-4">
        <div>
          <label
            htmlFor="training-compose-placement"
            className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Training session
          </label>
          <select
            id="training-compose-placement"
            value={placementId}
            onChange={(e) => setPlacementId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">— Pick a session —</option>
            {placementOptions.map((p) => (
              <option key={p.placement_id} value={p.placement_id}>
                {p.training_name}
                {p.training_date ? ` — ${p.training_date}` : ''} ({p.attendee_count} attendee
                {p.attendee_count === 1 ? '' : 's'})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{recipientHint}</p>
        </div>

        {templates && templates.items.length > 0 && (
          <div>
            <label
              htmlFor="training-compose-template"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Use template
            </label>
            <select
              id="training-compose-template"
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
            htmlFor="training-compose-subject"
            className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Subject
          </label>
          <input
            id="training-compose-subject"
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
            htmlFor="training-compose-body"
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
          {sendMutation.isPending
            ? 'Sending…'
            : selectedPlacement
              ? `Send to ${selectedPlacement.attendee_count}`
              : 'Send'}
        </button>
      </div>
    </Modal>
  );
}
