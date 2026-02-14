// Paper Assignment types
export interface PaperAssignment {
  id: string;
  paper_id: string;
  paper_title: string;
  committee_member_id: string;
  committee_member_first_name: string;
  committee_member_last_name: string;
  is_anonymous: boolean;
  assigned_at: string;
}

export interface PaperAssignmentCreate {
  paper_id: string;
  committee_member_id: string;
  is_anonymous?: boolean;
}

export interface PaperAssignmentListResponse {
  items: PaperAssignment[];
  total: number;
}

export interface AutoAssignRequest {
  conference_id: string;
  reviewers_per_paper: number;
  is_anonymous: boolean;
  only_submitted?: boolean;
}

export interface AutoAssignResponse {
  assignments_created: number;
  papers_processed: number;
  papers_skipped: number;
  skipped_details: string[];
}

// --- Review Score Scales ---

export interface ReviewScaleOption {
  id: string;
  label: string;
  numeric_value: number | null;
  is_unsure: boolean;
  display_order: number;
}

export interface ReviewScoreScale {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  scale_type: "numeric_range" | "custom" | "binary";
  is_active: boolean;
  options: ReviewScaleOption[];
  created_at: string;
  updated_at: string;
}

export interface ReviewScoreScaleCreate {
  name: string;
  scale_type: "numeric_range" | "custom" | "binary";
  is_active?: boolean;
  options: Omit<ReviewScaleOption, "id">[];
}

export interface ReviewScoreScaleUpdate {
  name?: string;
  scale_type?: "numeric_range" | "custom" | "binary";
  is_active?: boolean;
  options?: Omit<ReviewScaleOption, "id">[];
}

// --- Review Criteria & Questions ---

export interface ReviewQuestion {
  id: string;
  criterion_id: string;
  text: string;
  help_text: string | null;
  question_type: "scored" | "non_scored";
  score_scale_id: string | null;
  score_scale: ReviewScoreScale | null;
  weight: number;
  comment_requirement: "optional" | "required" | "required_if_low_score";
  low_score_threshold: number | null;
  show_to_reviewers: boolean;
  count_in_score: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewQuestionCreate {
  text: string;
  help_text?: string;
  question_type?: "scored" | "non_scored";
  score_scale_id?: string;
  weight?: number;
  comment_requirement?: "optional" | "required" | "required_if_low_score";
  low_score_threshold?: number;
  show_to_reviewers?: boolean;
  count_in_score?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export interface ReviewQuestionUpdate {
  text?: string;
  help_text?: string;
  question_type?: "scored" | "non_scored";
  score_scale_id?: string;
  weight?: number;
  comment_requirement?: "optional" | "required" | "required_if_low_score";
  low_score_threshold?: number;
  show_to_reviewers?: boolean;
  count_in_score?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export interface ReviewCriterion {
  id: string;
  tenant_id: string;
  conference_id: string;
  title: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  questions: ReviewQuestion[];
  created_at: string;
  updated_at: string;
}

export interface ReviewCriterionCreate {
  title: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface ReviewCriterionUpdate {
  title?: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

// Review Form Settings types
export interface ReviewFormSettings {
  id: string;
  conference_id: string;
  enable_speaker_feedback: boolean;
  enable_internal_comment: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewFormSettingsUpdate {
  enable_speaker_feedback?: boolean;
  enable_internal_comment?: boolean;
}
