import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import OverlaySelector from '../../../../components/OverlaySelector';
import type { BulkRecipientFilter } from '../../../../types';
import type {
  MessageTemplateListResponse,
  RecipientListListResponse,
  SystemRecipientGroup,
  DynamicRecipientListListResponse,
  RecipientPreviewResponse,
} from '../../../../types/messaging';

const TEMPLATE_VARIABLES = [
  { label: 'First Name', token: '[First Name]' },
  { label: 'Last Name', token: '[Last Name]' },
  { label: 'Email', token: '[Email]' },
  { label: 'Conference', token: '[Conference Name]' },
  { label: 'Paper Title', token: '[Paper Title]' },
  { label: 'Company Name', token: '[Company Name]' },
  { label: 'Booking Option', token: '[Booking Option]' },
];

interface BulkComposeModalProps {
  conferenceId: string;
  open: boolean;
  onClose: () => void;
  onSend: (data: {
    subject: string;
    body_html: string;
    recipients: BulkRecipientFilter;
    screen_overlay_id?: string | null;
  }) => void;
  sending: boolean;
}

type RecipientCategory =
  | 'all'
  | 'paper_status'
  | 'committee_role'
  | 'recipient_list'
  | 'user_role'
  | 'all_registrations'
  | 'all_sponsors'
  | 'sponsor_package'
  | 'dynamic_list';

const PAPER_STATUSES = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_evaluation', label: 'In Evaluation' },
  { value: 'evaluated', label: 'Evaluated' },
  { value: 'final_consideration', label: 'Final Consideration' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

interface CommitteeRole {
  id: string;
  name: string;
}

export default function BulkComposeModal({
  conferenceId,
  open,
  onClose,
  onSend,
  sending,
}: BulkComposeModalProps) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [category, setCategory] = useState<RecipientCategory | ''>('');
  const [paperStatus, setPaperStatus] = useState('');
  const [committeeRole, setCommitteeRole] = useState('');
  const [recipientListId, setRecipientListId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(''); // user_role, sponsor_package, dynamic_list ID
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [screenOverlayId, setScreenOverlayId] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: queryKeys.messaging.committeeRoles(conferenceId),
    queryFn: async () => {
      const resp = await api.get(`/conferences/${conferenceId}/settings/committee-roles`);
      return resp.data.items as CommitteeRole[];
    },
    enabled: open,
  });

  // Fetch templates
  const { data: templatesData } = useQuery<MessageTemplateListResponse>({
    queryKey: queryKeys.messaging.templates(conferenceId),
    queryFn: () => api.get(`/conferences/${conferenceId}/messaging/templates`).then((r) => r.data),
    enabled: open,
  });

  // Fetch recipient lists
  const { data: recipientListsData } = useQuery<RecipientListListResponse>({
    queryKey: queryKeys.messaging.recipientLists(conferenceId),
    queryFn: () =>
      api.get(`/conferences/${conferenceId}/messaging/recipient-lists`).then((r) => r.data),
    enabled: open,
  });

  // Fetch system lists (user roles, sponsors, registrations)
  const { data: systemLists } = useQuery<SystemRecipientGroup[]>({
    queryKey: queryKeys.messaging.systemLists(conferenceId),
    queryFn: () =>
      api.get(`/conferences/${conferenceId}/messaging/system-lists`).then((r) => r.data),
    enabled: open,
  });

  // Fetch dynamic lists
  const { data: dynamicListsData } = useQuery<DynamicRecipientListListResponse>({
    queryKey: queryKeys.messaging.dynamicLists(conferenceId),
    queryFn: () =>
      api.get(`/conferences/${conferenceId}/messaging/dynamic-lists`).then((r) => r.data),
    enabled: open,
  });

  const templates = templatesData?.items ?? [];
  const recipientLists = recipientListsData?.items ?? [];
  const dynamicLists = dynamicListsData?.items ?? [];

  // Group system lists by category
  const userRoleGroups = useMemo(
    () => (systemLists ?? []).filter((g) => g.category === 'user_role'),
    [systemLists]
  );
  const sponsorGroups = useMemo(
    () => (systemLists ?? []).filter((g) => g.category === 'sponsor'),
    [systemLists]
  );
  const registrationGroups = useMemo(
    () => (systemLists ?? []).filter((g) => g.category === 'registration'),
    [systemLists]
  );

  // Build the filter for recipient count preview
  const currentFilter = useMemo((): BulkRecipientFilter | null => {
    if (category === 'all') return { all_applicants: true };
    if (category === 'paper_status' && paperStatus) return { paper_status: paperStatus };
    if (category === 'committee_role' && committeeRole) return { committee_role: committeeRole };
    if (category === 'recipient_list' && recipientListId)
      return { recipient_list_id: recipientListId };
    if (category === 'user_role' && selectedGroupId) return { user_role_id: selectedGroupId };
    if (category === 'all_registrations') return { all_registrations: true };
    if (category === 'all_sponsors') return { all_sponsors: true };
    if (category === 'sponsor_package' && selectedGroupId)
      return { sponsor_package_id: selectedGroupId };
    if (category === 'dynamic_list' && selectedGroupId) return { dynamic_list_id: selectedGroupId };
    return null;
  }, [category, paperStatus, committeeRole, recipientListId, selectedGroupId]);

  // Fetch recipient count preview
  const { data: recipientPreview, isFetching: previewLoading } = useQuery<RecipientPreviewResponse>(
    {
      queryKey: [...queryKeys.messaging.recipientCount(conferenceId), currentFilter],
      queryFn: () =>
        api
          .post(`/conferences/${conferenceId}/messaging/recipient-count`, currentFilter)
          .then((r) => r.data),
      enabled: open && currentFilter !== null,
      staleTime: 30_000,
    }
  );

  useEffect(() => {
    if (!open) {
      setSubject('');
      setBodyHtml('');
      setCategory('');
      setPaperStatus('');
      setCommitteeRole('');
      setRecipientListId('');
      setSelectedGroupId('');
      setSelectedTemplate('');
      setScreenOverlayId(null);
    }
  }, [open]);

  if (!open) return null;

  const hasFilter = currentFilter !== null;
  const canSend = hasFilter && subject.trim() && bodyHtml.trim();

  const buildRecipients = (): BulkRecipientFilter => {
    return currentFilter ?? {};
  };

  const recipientLabel = () => {
    if (category === 'all') return 'All applicants';
    if (category === 'paper_status' && paperStatus) {
      const s = PAPER_STATUSES.find((ps) => ps.value === paperStatus);
      return `Applicants with ${s?.label ?? paperStatus} papers`;
    }
    if (category === 'committee_role' && committeeRole) {
      return `Committee members: ${committeeRole}`;
    }
    if (category === 'recipient_list' && recipientListId) {
      const list = recipientLists.find((l) => l.id === recipientListId);
      return `List: ${list?.name ?? 'Unknown'} (${list?.member_count ?? 0} members)`;
    }
    if (category === 'user_role' && selectedGroupId) {
      const group = userRoleGroups.find((g) => g.key === `user_role:${selectedGroupId}`);
      return group?.label ?? 'User role members';
    }
    if (category === 'all_registrations') return 'All registrations (email only)';
    if (category === 'all_sponsors') return 'All sponsors (email only)';
    if (category === 'sponsor_package' && selectedGroupId) {
      const group = sponsorGroups.find((g) => g.key === `sponsor_package:${selectedGroupId}`);
      return group?.label ?? 'Sponsor package members';
    }
    if (category === 'dynamic_list' && selectedGroupId) {
      const dl = dynamicLists.find((l) => l.id === selectedGroupId);
      return `Dynamic: ${dl?.name ?? 'Unknown'} (${dl?.recipient_count ?? 0} recipients)`;
    }
    return '';
  };

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplate(templateId);
    setSubject(tmpl.subject);
    setBodyHtml(tmpl.body_html);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-gray-100">Bulk Message</h2>
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
          {/* Template picker */}
          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
                Template:
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => handleApplyTemplate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm flex-1 max-w-xs dark:bg-gray-800 dark:text-gray-100"
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

          {/* Recipient category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Recipients
            </label>
            <select
              value={(() => {
                if (category === 'recipient_list' && recipientListId)
                  return `list:${recipientListId}`;
                if (category === 'user_role' && selectedGroupId)
                  return `user_role:${selectedGroupId}`;
                if (category === 'sponsor_package' && selectedGroupId)
                  return `sponsor_package:${selectedGroupId}`;
                if (category === 'dynamic_list' && selectedGroupId)
                  return `dynamic_list:${selectedGroupId}`;
                return category;
              })()}
              onChange={(e) => {
                const val = e.target.value;
                // Reset all sub-selectors
                setPaperStatus('');
                setCommitteeRole('');
                setRecipientListId('');
                setSelectedGroupId('');

                if (val.startsWith('list:')) {
                  setCategory('recipient_list');
                  setRecipientListId(val.slice(5));
                } else if (val.startsWith('user_role:')) {
                  setCategory('user_role');
                  setSelectedGroupId(val.slice(10));
                } else if (val.startsWith('sponsor_package:')) {
                  setCategory('sponsor_package');
                  setSelectedGroupId(val.slice(16));
                } else if (val.startsWith('dynamic_list:')) {
                  setCategory('dynamic_list');
                  setSelectedGroupId(val.slice(13));
                } else {
                  setCategory(val as RecipientCategory | '');
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select recipient group...</option>
              <optgroup label="Applicants">
                <option value="all">All applicants</option>
                <option value="paper_status">By paper status</option>
                <option value="committee_role">By committee role</option>
              </optgroup>
              {userRoleGroups.length > 0 && (
                <optgroup label="By User Role">
                  {userRoleGroups.map((g) => (
                    <option key={g.key} value={`user_role:${g.key.split(':')[1]}`}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {registrationGroups.length > 0 && (
                <optgroup label="Registrations">
                  {registrationGroups.map((g) => (
                    <option key={g.key} value="all_registrations">
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {sponsorGroups.length > 0 && (
                <optgroup label="Sponsors">
                  {sponsorGroups.map((g) => {
                    if (g.key === 'all_sponsors')
                      return (
                        <option key={g.key} value="all_sponsors">
                          {g.label}
                        </option>
                      );
                    return (
                      <option key={g.key} value={`sponsor_package:${g.key.split(':')[1]}`}>
                        {g.label}
                      </option>
                    );
                  })}
                </optgroup>
              )}
              {(recipientLists.length > 0 || dynamicLists.length > 0) && (
                <optgroup label="Saved Lists">
                  {recipientLists.map((l) => (
                    <option key={l.id} value={`list:${l.id}`}>
                      {l.name} ({l.member_count} members)
                    </option>
                  ))}
                  {dynamicLists.map((dl) => (
                    <option key={dl.id} value={`dynamic_list:${dl.id}`}>
                      {dl.name} ({dl.recipient_count} recipients)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Paper status sub-select */}
          {category === 'paper_status' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Paper Status
              </label>
              <select
                value={paperStatus}
                onChange={(e) => setPaperStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select status...</option>
                {PAPER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Committee role sub-select */}
          {category === 'committee_role' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Committee Role
              </label>
              <select
                value={committeeRole}
                onChange={(e) => setCommitteeRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select role...</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selected summary with recipient count */}
          {hasFilter && (
            <div className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-md">
              Sending to: <span className="font-medium">{recipientLabel()}</span>
              {previewLoading && (
                <span className="ml-2 text-blue-400 dark:text-blue-500">(counting...)</span>
              )}
              {!previewLoading && recipientPreview && (
                <span className="ml-2 font-semibold">
                  — {recipientPreview.total} recipient{recipientPreview.total !== 1 ? 's' : ''}
                </span>
              )}
              {(category === 'all_registrations' ||
                category === 'all_sponsors' ||
                category === 'sponsor_package' ||
                (category === 'dynamic_list' &&
                  dynamicLists.find((dl) => dl.id === selectedGroupId)?.target_type)) && (
                <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                  (email only — no in-app thread)
                </span>
              )}
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

          {/* Variable pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Insert variable:</span>
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

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message
            </label>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message... Use variables like [First Name] for personalization."
              rows={6}
            />
          </div>

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
                subject,
                body_html: bodyHtml,
                recipients: buildRecipients(),
                screen_overlay_id: screenOverlayId,
              })
            }
            disabled={!canSend || sending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send to All'}
          </button>
        </div>
      </div>
    </div>
  );
}
