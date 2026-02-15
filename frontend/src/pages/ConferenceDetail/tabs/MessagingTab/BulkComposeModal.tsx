import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../config/api";
import RichTextEditor from "../../../../components/common/RichTextEditor";
import type { BulkRecipientFilter } from "../../../../types";
import type {
  MessageTemplateListResponse,
  RecipientListListResponse,
} from "../../../../types/messaging";

const TEMPLATE_VARIABLES = [
  { label: "First Name", token: "[First Name]" },
  { label: "Last Name", token: "[Last Name]" },
  { label: "Email", token: "[Email]" },
  { label: "Conference", token: "[Conference Name]" },
  { label: "Paper Title", token: "[Paper Title]" },
];

interface BulkComposeModalProps {
  conferenceId: string;
  open: boolean;
  onClose: () => void;
  onSend: (data: {
    subject: string;
    body_html: string;
    recipients: BulkRecipientFilter;
  }) => void;
  sending: boolean;
}

type RecipientCategory = "all" | "paper_status" | "committee_role" | "recipient_list";

const PAPER_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "in_evaluation", label: "In Evaluation" },
  { value: "evaluated", label: "Evaluated" },
  { value: "final_consideration", label: "Final Consideration" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
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
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [category, setCategory] = useState<RecipientCategory | "">("");
  const [paperStatus, setPaperStatus] = useState("");
  const [committeeRole, setCommitteeRole] = useState("");
  const [recipientListId, setRecipientListId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const { data: roles } = useQuery({
    queryKey: ["committee-roles", conferenceId],
    queryFn: async () => {
      const resp = await api.get(
        `/conferences/${conferenceId}/settings/committee-roles`
      );
      return resp.data.items as CommitteeRole[];
    },
    enabled: open,
  });

  // Fetch templates
  const { data: templatesData } = useQuery<MessageTemplateListResponse>({
    queryKey: ["message-templates", conferenceId],
    queryFn: () =>
      api
        .get(`/conferences/${conferenceId}/messaging/templates`)
        .then((r) => r.data),
    enabled: open,
  });

  // Fetch recipient lists
  const { data: recipientListsData } = useQuery<RecipientListListResponse>({
    queryKey: ["recipient-lists", conferenceId],
    queryFn: () =>
      api
        .get(`/conferences/${conferenceId}/messaging/recipient-lists`)
        .then((r) => r.data),
    enabled: open,
  });

  const templates = templatesData?.items ?? [];
  const recipientLists = recipientListsData?.items ?? [];

  useEffect(() => {
    if (!open) {
      setSubject("");
      setBodyHtml("");
      setCategory("");
      setPaperStatus("");
      setCommitteeRole("");
      setRecipientListId("");
      setSelectedTemplate("");
    }
  }, [open]);

  if (!open) return null;

  const hasFilter =
    category === "all" ||
    (category === "paper_status" && paperStatus) ||
    (category === "committee_role" && committeeRole) ||
    (category === "recipient_list" && recipientListId);

  const canSend = hasFilter && subject.trim() && bodyHtml.trim();

  const buildRecipients = (): BulkRecipientFilter => {
    if (category === "all") return { all_applicants: true };
    if (category === "paper_status") return { paper_status: paperStatus };
    if (category === "committee_role") return { committee_role: committeeRole };
    if (category === "recipient_list") return { recipient_list_id: recipientListId };
    return {};
  };

  const recipientLabel = () => {
    if (category === "all") return "All applicants";
    if (category === "paper_status" && paperStatus) {
      const s = PAPER_STATUSES.find((ps) => ps.value === paperStatus);
      return `Applicants with ${s?.label ?? paperStatus} papers`;
    }
    if (category === "committee_role" && committeeRole) {
      return `Committee members: ${committeeRole}`;
    }
    if (category === "recipient_list" && recipientListId) {
      const list = recipientLists.find((l) => l.id === recipientListId);
      return `List: ${list?.name ?? "Unknown"} (${list?.member_count ?? 0} members)`;
    }
    return "";
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
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Bulk Message</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template picker */}
          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600 flex-shrink-0">
                Template:
              </label>
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

          {/* Recipient category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipients
            </label>
            <select
              value={category === "recipient_list" && recipientListId ? `list:${recipientListId}` : category}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith("list:")) {
                  setCategory("recipient_list");
                  setRecipientListId(val.slice(5));
                  setPaperStatus("");
                  setCommitteeRole("");
                } else {
                  setCategory(val as RecipientCategory | "");
                  setPaperStatus("");
                  setCommitteeRole("");
                  setRecipientListId("");
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select recipient group...</option>
              <option value="all">All applicants</option>
              <option value="paper_status">By paper status</option>
              <option value="committee_role">By committee role</option>
              {recipientLists.length > 0 && (
                <optgroup label="Recipient Lists">
                  {recipientLists.map((l) => (
                    <option key={l.id} value={`list:${l.id}`}>
                      {l.name} ({l.member_count} members)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Paper status sub-select */}
          {category === "paper_status" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Paper Status
              </label>
              <select
                value={paperStatus}
                onChange={(e) => setPaperStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
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
          {category === "committee_role" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Committee Role
              </label>
              <select
                value={committeeRole}
                onChange={(e) => setCommitteeRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
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

          {/* Selected summary */}
          {hasFilter && (
            <div className="text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-md">
              Sending to: <span className="font-medium">{recipientLabel()}</span>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
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
                    if (!prev || prev === "<p></p>") return `<p>${v.token}</p>`;
                    if (prev.endsWith("</p>")) return prev.slice(0, -4) + v.token + "</p>";
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message... Use variables like [First Name] for personalization."
              rows={6}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSend({
                subject,
                body_html: bodyHtml,
                recipients: buildRecipients(),
              })
            }
            disabled={!canSend || sending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send to All"}
          </button>
        </div>
      </div>
    </div>
  );
}
