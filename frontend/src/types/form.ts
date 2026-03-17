// Paper Form Schema types
export type PaperFormFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'checkbox'
  | 'checkbox_group'
  | 'dropdown'
  | 'file_upload';

export interface FieldOption {
  value: string;
  label: string;
}

export interface ValidationRules {
  min_length?: number;
  max_length?: number;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
}

export interface BuiltinFieldConfig {
  visible: boolean;
  required: boolean;
  display_order?: number;
  help_text?: string | null;
  min_chars?: number | null;
  max_chars?: number | null;
  options?: { value: string; label: string }[] | null;
}

export interface PaperFormField {
  id: string;
  tenant_id: string;
  schema_id: string;
  field_key: string;
  field_type: PaperFormFieldType;
  label: string;
  description: string | null;
  placeholder: string | null;
  help_text: string | null;
  display_order: number;
  is_visible: boolean;
  is_required: boolean;
  validation_rules: ValidationRules | null;
  options: FieldOption[] | null;
  created_at: string;
  updated_at: string;
}

export interface PaperFormFieldCreate {
  field_key: string;
  field_type: PaperFormFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  help_text?: string;
  display_order?: number;
  is_visible?: boolean;
  is_required?: boolean;
  validation_rules?: ValidationRules;
  options?: FieldOption[];
}

export interface PaperFormFieldUpdate {
  field_key?: string;
  field_type?: PaperFormFieldType;
  label?: string;
  description?: string;
  placeholder?: string;
  help_text?: string;
  display_order?: number;
  is_visible?: boolean;
  is_required?: boolean;
  validation_rules?: ValidationRules;
  options?: FieldOption[];
}

export interface PaperFormVariantField {
  id: string;
  tenant_id: string;
  variant_id: string;
  field_key: string;
  field_type: PaperFormFieldType;
  label: string;
  description: string | null;
  placeholder: string | null;
  help_text: string | null;
  display_order: number;
  is_visible: boolean;
  is_required: boolean;
  validation_rules: ValidationRules | null;
  options: FieldOption[] | null;
  created_at: string;
  updated_at: string;
}

export interface PaperFormVariant {
  id: string;
  tenant_id: string;
  schema_id: string;
  user_role_id: string;
  role_name: string;
  name: string;
  description: string | null;
  builtin_fields_config: Record<string, BuiltinFieldConfig>;
  is_active: boolean;
  fields: PaperFormVariantField[];
  created_at: string;
  updated_at: string;
}

export interface PaperFormVariantCreate {
  user_role_id: string;
  name: string;
  description?: string;
  builtin_fields_config?: Record<string, BuiltinFieldConfig>;
  is_active?: boolean;
}

export interface PaperFormVariantUpdate {
  name?: string;
  description?: string;
  builtin_fields_config?: Record<string, BuiltinFieldConfig>;
  is_active?: boolean;
}

export interface PaperFormSchema {
  id: string;
  tenant_id: string;
  conference_id: string;
  version: number;
  builtin_fields_config: Record<string, BuiltinFieldConfig>;
  fields: PaperFormField[];
  variants: PaperFormVariant[];
  created_at: string;
  updated_at: string;
}

export interface PaperFormSchemaUpdate {
  builtin_fields_config?: Record<string, BuiltinFieldConfig>;
}

export interface FieldReorderItem {
  id: string;
  display_order: number;
}

export interface HasSubmissionsResponse {
  has_submissions: boolean;
  submission_count: number;
}
