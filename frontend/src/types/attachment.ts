// Attachment types
export interface Attachment {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  content_type: string;
  file_size: number;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}
