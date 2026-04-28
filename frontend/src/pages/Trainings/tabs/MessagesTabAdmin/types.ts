/** Shared shapes for the trainings admin Messages tab. */

export interface SenderInfo {
  id: string;
  type: string;
  first_name: string;
  last_name: string;
  email: string;
  is_me?: boolean;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
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
  has_attachments: boolean;
  archived_at: string | null;
  domain_entity_name: string | null;
}

export interface ThreadListResponse {
  items: ThreadListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface MessageInfo {
  id: string;
  thread_id: string;
  sender: SenderInfo;
  body_html: string;
  attachments: AttachmentInfo[];
  created_at: string;
  is_internal_note?: boolean;
}

export interface ParticipantInfo extends SenderInfo {
  last_read_at: string | null;
}

export interface ThreadDetailResponse {
  id: string;
  subject: string;
  archived_at: string | null;
  participants: ParticipantInfo[];
  messages: MessageInfo[];
  domain_entity_name: string | null;
  updated_at: string;
}

export function recipientLabel(thread: ThreadListItem): string {
  const others = thread.other_participants;
  if (others.length === 0) return 'Unknown';
  return others.map((p) => `${p.first_name} ${p.last_name}`.trim() || p.email).join(', ');
}
