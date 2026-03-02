export interface Alumni {
  id: string;
  conference_id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string | null;
  source: 'manual' | 'import' | 'registration';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlumniImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface AlumniCheckResponse {
  is_alumni: boolean;
  conferences: Array<{ conference_id: string; conference_name: string }>;
}
