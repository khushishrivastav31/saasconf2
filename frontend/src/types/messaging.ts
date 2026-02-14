// Messaging types
export interface SenderInfo {
  id: string;
  type: "user" | "applicant";
  first_name: string;
  last_name: string;
  email: string;
}

export interface MessageAttachmentInfo {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
}

export interface MessageResponse {
  id: string;
  thread_id: string;
  sender: SenderInfo;
  body_html: string;
  attachments: MessageAttachmentInfo[];
  created_at: string;
}

export interface ParticipantInfo {
  id: string;
  type: "user" | "applicant";
  first_name: string;
  last_name: string;
  email: string;
  last_read_at: string | null;
}

export interface ThreadListItem {
  id: string;
  subject: string;
  last_message_at: string;
  last_message_preview: string;
  last_message_sender: SenderInfo;
  other_participants: SenderInfo[];
  unread: boolean;
  message_count: number;
  created_at: string;
  bulk_id: string | null;
}

export interface ThreadListResponse {
  items: ThreadListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ThreadDetailResponse {
  id: string;
  subject: string;
  bulk_id: string | null;
  participants: ParticipantInfo[];
  messages: MessageResponse[];
  created_at: string;
  updated_at: string;
}

export interface BulkThreadSummary {
  bulk_id: string;
  subject: string;
  threads_created: number;
  created_at: string;
}

export interface BulkRecipientFilter {
  all_applicants?: boolean;
  paper_status?: string;
  committee_role?: string;
  applicant_ids?: string[];
}
