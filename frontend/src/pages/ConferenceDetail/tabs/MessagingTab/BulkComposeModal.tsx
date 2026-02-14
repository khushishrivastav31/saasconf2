import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../config/api";
import RichTextEditor from "../../../../components/common/RichTextEditor";
import type { BulkRecipientFilter } from "../../../../types";

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

type RecipientCategory = "all" | "paper_status" | "committee_role";

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

  useEffect(() => {
    if (!open) {
      setSubject("");
      setBodyHtml("");
      setCategory("");
      setPaperStatus("");
      setCommitteeRole("");
    }
  }, [open]);

  if (!open) return null;

  const hasFilter =
    category === "all" ||
    (category === "paper_status" && paperStatus) ||
    (category === "committee_role" && committeeRole);

  const canSend = hasFilter && subject.trim() && bodyHtml.trim();

  const buildRecipients = (): BulkRecipientFilter => {
    if (category === "all") return { all_applicants: true };
    if (category === "paper_status") return { paper_status: paperStatus };
    if (category === "committee_role") return { committee_role: committeeRole };
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
    return "";
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
          {/* Recipient category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipients
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as RecipientCategory | "");
                setPaperStatus("");
                setCommitteeRole("");
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select recipient group...</option>
              <option value="all">All applicants</option>
              <option value="paper_status">By paper status</option>
              <option value="committee_role">By committee role</option>
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
          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message..."
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
