import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import Modal from '../Modal';
import RichTextEditor from '../common/RichTextEditor';
import { useToast } from '../Toast';
import TrainingRecipientPicker, { type RecipientScope } from './TrainingRecipientPicker';
import TrainingAttendeeSearchPicker, {
  type AttendeeSearchHit,
} from './TrainingAttendeeSearchPicker';
import ComposeRecipientModeToggle, { type RecipientMode } from './ComposeRecipientModeToggle';
import TrainingVariableButtons from './TrainingVariableButtons';
import MessageFileAttach, { type StagedAttachment } from '../MessageFileAttach';

interface BroadcastResponse {
  bulk_id: string;
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

interface AttendeeShape {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface TrainingRegistrationItem {
  id: string;
  placement_id: string;
  training_name: string;
  training_date: string | null;
  attendee_count: number;
  attendees: AttendeeShape[];
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
  attendees: AttendeeShape[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional pre-selected placement (e.g. opened from a TrainingGroupRow button). */
  initialPlacementId?: string;
  /** Optional pre-selected attendees (e.g. opened from a single attendee row).
   *  When provided, the scope defaults to 'specific' and the listed ids are
   *  pre-checked. */
  initialAttendeeIds?: string[];
}

export default function TrainingComposePlacementDialog({
  open,
  onClose,
  initialPlacementId,
  initialAttendeeIds,
}: Props) {
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('session');
  const [placementId, setPlacementId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [recipientScope, setRecipientScope] = useState<RecipientScope>('all');
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(new Set());
  // Search-mode state: full hits (so chips have the display name + email +
  // training context) rather than just ids.
  const [searchSelected, setSearchSelected] = useState<AttendeeSearchHit[]>([]);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Apply initial values when the dialog opens / props change. The state
  // persists between opens (modal stays mounted) so we reset based on the
  // provided initial values each time ``open`` flips on.
  useEffect(() => {
    if (open) {
      // Pre-pinned launches always start in session mode (the entry point
      // is a known training/registration). Search mode is reachable only
      // via the explicit toggle in the dialog header.
      setRecipientMode('session');
      setPlacementId(initialPlacementId ?? '');
      if (initialAttendeeIds && initialAttendeeIds.length > 0) {
        setRecipientScope('specific');
        setSelectedAttendeeIds(new Set(initialAttendeeIds));
      } else {
        setRecipientScope('all');
        setSelectedAttendeeIds(new Set());
      }
      setSearchSelected([]);
      setAttachments([]);
      setSubject('');
      setBodyHtml('');
      setSelectedTemplateId('');
    }
  }, [open, initialPlacementId, initialAttendeeIds]);

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

  // Group registrations by placement; collect every attendee under each
  // placement so the "specific attendees" picker can list them flat.
  const placementOptions: PlacementOption[] = useMemo(() => {
    if (!regs?.items) return [];
    const byPlacement = new Map<string, PlacementOption>();
    for (const r of regs.items) {
      const existing = byPlacement.get(r.placement_id);
      const incoming = r.attendees ?? [];
      if (existing) {
        existing.attendees.push(...incoming);
      } else {
        byPlacement.set(r.placement_id, {
          placement_id: r.placement_id,
          training_name: r.training_name,
          training_date: r.training_date,
          attendees: [...incoming],
        });
      }
    }
    return Array.from(byPlacement.values()).sort((a, b) => {
      const da = a.training_date || '';
      const db = b.training_date || '';
      return da.localeCompare(db);
    });
  }, [regs]);

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
    mutationFn: async (): Promise<BroadcastResponse> => {
      const attachmentIds = attachments.map((a) => a.id);
      // Search mode → cross-placement endpoint with the picked attendee ids.
      if (recipientMode === 'search') {
        const resp = await api.post<BroadcastResponse>(
          '/trainings/messaging/broadcasts/by-attendees',
          {
            subject,
            body_html: bodyHtml,
            attendee_ids: searchSelected.map((s) => s.attendee_id),
            attachment_ids: attachmentIds,
          }
        );
        return resp.data;
      }
      // Session mode → placement broadcast, optionally narrowed by ids.
      const payload: {
        subject: string;
        body_html: string;
        attendee_ids?: string[];
        attachment_ids: string[];
      } = { subject, body_html: bodyHtml, attachment_ids: attachmentIds };
      if (recipientScope === 'specific') {
        payload.attendee_ids = Array.from(selectedAttendeeIds);
      }
      const resp = await api.post<BroadcastResponse>(
        `/trainings/placements/${placementId}/messages/broadcast`,
        payload
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
      onClose();
    },
    onError: () => showToast('Failed to send broadcast', 'error'),
  });

  const insertVariable = (token: string, target: 'subject' | 'body') => {
    if (target === 'subject') setSubject((s) => `${s}${token}`);
    else setBodyHtml((b) => `${b}${token}`);
  };

  const selectedPlacement = placementOptions.find((p) => p.placement_id === placementId);
  const placementAttendees = selectedPlacement?.attendees ?? [];
  const sessionRecipientCount =
    recipientScope === 'all' ? placementAttendees.length : selectedAttendeeIds.size;
  const recipientCount = recipientMode === 'search' ? searchSelected.length : sessionRecipientCount;

  const toggleAttendee = (attendeeId: string) => {
    setSelectedAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(attendeeId)) next.delete(attendeeId);
      else next.add(attendeeId);
      return next;
    });
  };

  const addSearchHit = (hit: AttendeeSearchHit) => {
    setSearchSelected((prev) =>
      prev.some((p) => p.attendee_id === hit.attendee_id) ? prev : [...prev, hit]
    );
  };

  const removeSearchHit = (attendeeId: string) => {
    setSearchSelected((prev) => prev.filter((p) => p.attendee_id !== attendeeId));
  };

  const recipientsReady =
    recipientMode === 'search'
      ? searchSelected.length > 0
      : placementId.length > 0 && sessionRecipientCount > 0;

  const canSend =
    recipientsReady &&
    subject.trim().length > 0 &&
    bodyHtml.trim().length > 0 &&
    bodyHtml.trim() !== '<p></p>' &&
    !sendMutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title="Compose broadcast">
      <div className="px-6 py-4 space-y-4">
        <ComposeRecipientModeToggle mode={recipientMode} onChange={setRecipientMode} />

        {recipientMode === 'search' && (
          <TrainingAttendeeSearchPicker
            selected={searchSelected}
            onAdd={addSearchHit}
            onRemove={removeSearchHit}
          />
        )}

        {recipientMode === 'session' && (
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
              onChange={(e) => {
                setPlacementId(e.target.value);
                setSelectedAttendeeIds(new Set());
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">— Pick a session —</option>
              {placementOptions.map((p) => (
                <option key={p.placement_id} value={p.placement_id}>
                  {p.training_name}
                  {p.training_date ? ` — ${p.training_date}` : ''} ({p.attendees.length} attendee
                  {p.attendees.length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </div>
        )}

        {recipientMode === 'session' && selectedPlacement && (
          <TrainingRecipientPicker
            attendees={placementAttendees}
            scope={recipientScope}
            onScopeChange={setRecipientScope}
            selectedIds={selectedAttendeeIds}
            onToggle={toggleAttendee}
          />
        )}

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

        <TrainingVariableButtons onInsert={insertVariable} />

        <div>
          <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Attachments
          </div>
          <MessageFileAttach
            apiClient={api}
            uploadPath="/trainings/messaging/upload"
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
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
          {sendMutation.isPending ? 'Sending…' : `Send to ${recipientCount}`}
        </button>
      </div>
    </Modal>
  );
}
