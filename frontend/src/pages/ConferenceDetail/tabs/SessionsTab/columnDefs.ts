import { formatDate } from "../../../../utils/formatDate";
import type { EnrichedSession, CustomFieldMeta } from "../../../../types";

export type ColumnGroup = "session" | "paper" | "speaker" | "custom";

export interface ColumnDef {
  key: string;
  label: string;
  group: ColumnGroup;
  defaultVisible: boolean;
  getValue: (session: EnrichedSession) => string;
}

function formatSlotTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5); // HH:MM
}

export const BUILTIN_COLUMNS: ColumnDef[] = [
  {
    key: "day",
    label: "Day",
    group: "session",
    defaultVisible: true,
    getValue: (s) => s.day_name || formatDate(s.day_date) || "",
  },
  {
    key: "time",
    label: "Time",
    group: "session",
    defaultVisible: true,
    getValue: (s) => {
      const start = formatSlotTime(s.start_time);
      const end = formatSlotTime(s.end_time);
      return end ? `${start} - ${end}` : start;
    },
  },
  {
    key: "track",
    label: "Track",
    group: "session",
    defaultVisible: true,
    getValue: (s) => (s.is_general_event ? "All Tracks" : s.track_name || "-"),
  },
  {
    key: "title",
    label: "Session",
    group: "session",
    defaultVisible: true,
    getValue: (s) => s.title,
  },
  {
    key: "type",
    label: "Type",
    group: "session",
    defaultVisible: true,
    getValue: (s) => s.session_type_name || "-",
  },
  {
    key: "speaker",
    label: "Speaker",
    group: "speaker",
    defaultVisible: true,
    getValue: (s) => s.speaker_name || "-",
  },
  {
    key: "speaker_email",
    label: "Speaker Email",
    group: "speaker",
    defaultVisible: false,
    getValue: (s) => s.speaker_email || "-",
  },
  {
    key: "speaker_company",
    label: "Speaker Company",
    group: "speaker",
    defaultVisible: false,
    getValue: (s) => s.speaker_company || "-",
  },
  {
    key: "cospeakers",
    label: "Co-Speakers",
    group: "speaker",
    defaultVisible: false,
    getValue: (s) => s.cospeakers || "-",
  },
  {
    key: "abstract",
    label: "Abstract",
    group: "paper",
    defaultVisible: false,
    getValue: (s) => s.paper_abstract_short || "-",
  },
  {
    key: "level",
    label: "Level",
    group: "paper",
    defaultVisible: false,
    getValue: (s) => s.paper_level || "-",
  },
  {
    key: "learning_objectives",
    label: "Learning Objectives",
    group: "paper",
    defaultVisible: false,
    getValue: (s) => s.paper_learning_objectives || "-",
  },
  {
    key: "importance",
    label: "Importance",
    group: "paper",
    defaultVisible: false,
    getValue: (s) => s.paper_importance || "-",
  },
  {
    key: "paper_status",
    label: "Paper Status",
    group: "paper",
    defaultVisible: false,
    getValue: (s) => s.paper_status || "-",
  },
  {
    key: "description",
    label: "Description",
    group: "session",
    defaultVisible: false,
    getValue: (s) => s.description || "-",
  },
  {
    key: "notes",
    label: "Notes",
    group: "session",
    defaultVisible: false,
    getValue: (s) => s.notes || "-",
  },
];

/**
 * Build the full column list including dynamic custom form fields.
 */
export function buildColumns(customFields: CustomFieldMeta[]): ColumnDef[] {
  const columns = [...BUILTIN_COLUMNS];

  for (const cf of customFields) {
    columns.push({
      key: `custom_${cf.field_key}`,
      label: cf.label,
      group: "custom",
      defaultVisible: false,
      getValue: (s) => {
        const answers = s.paper_custom_field_answers;
        if (!answers) return "-";
        const val = answers[cf.field_key];
        if (val == null) return "-";
        if (Array.isArray(val)) return val.join(", ");
        if (typeof val === "boolean") return val ? "Yes" : "No";
        return String(val);
      },
    });
  }

  return columns;
}
