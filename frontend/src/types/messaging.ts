// Messaging types
export interface SenderInfo {
  id: string;
  type: 'user' | 'applicant';
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
  is_internal_note: boolean;
  attachments: MessageAttachmentInfo[];
  created_at: string;
}

export interface ParticipantInfo {
  id: string;
  type: 'user' | 'applicant';
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
  is_flagged: boolean;
  has_attachments: boolean;
  created_at: string;
  bulk_id: string | null;
  archived_at: string | null;
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
  archived_at: string | null;
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
  recipient_list_id?: string;
}

// Message Templates
export interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  screen_overlay_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageTemplateListResponse {
  items: MessageTemplate[];
  total: number;
}

// Recipient Lists
export interface RecipientListMemberInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface RecipientListResponse {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface RecipientListDetailResponse {
  id: string;
  name: string;
  description: string | null;
  members: RecipientListMemberInfo[];
  created_at: string;
  updated_at: string;
}

export interface RecipientListListResponse {
  items: RecipientListResponse[];
  total: number;
}

// Global unread count
export interface ConferenceUnreadCount {
  conference_id: string;
  conference_name: string;
  unread_count: number;
}

export interface GlobalUnreadCountResponse {
  total_unread_count: number;
  conferences: ConferenceUnreadCount[];
}
