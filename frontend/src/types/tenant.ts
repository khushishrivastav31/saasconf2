// Tenant types
export interface ContactPerson {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  // Address fields
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  // Business fields
  vat_number: string | null;
  website: string | null;
  logo_url: string | null;
  email_domain: string | null;
  // Contact persons
  contact_persons: ContactPerson[];
  // Comments
  comments: string | null;
  // Super user (designated by SaaS admin to delete conferences)
  super_user_id: string | null;
  created_at: string;
  updated_at: string;
  user_count: number;
  module_count: number;
}

export interface TenantCreate {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  // Address fields
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  // Business fields
  vat_number?: string;
  website?: string;
  email_domain?: string;
  // Contact persons
  contact_persons?: ContactPerson[];
  // Comments
  comments?: string;
  // Admin user
  admin_email?: string;
  admin_first_name?: string;
  admin_last_name?: string;
}

export interface TenantUpdate {
  name?: string;
  slug?: string;
  is_active?: boolean;
  settings?: Record<string, unknown>;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  vat_number?: string;
  website?: string;
  email_domain?: string;
  contact_persons?: ContactPerson[];
  comments?: string;
}

// Module types
export interface Module {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  config_schema: Record<string, unknown>;
  created_at: string;
  tenant_count: number;
}

export interface TenantModule {
  id: string;
  tenant_id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  granted_at: string;
  granted_by: string | null;
  // Subscription dates
  start_date: string | null;
  end_date: string | null;
  // Pricing
  price: number | null;
  currency: string | null;
  // Resource limits
  max_papers: number | null;
  max_speakers: number | null;
  max_attendees: number | null;
  max_volunteers: number | null;
  // Computed field
  is_active_subscription: boolean;
}

export interface TenantModuleAssign {
  module_id: string;
  config?: Record<string, unknown>;
  start_date?: string;
  end_date?: string;
  price?: number;
  currency?: string;
  max_papers?: number;
  max_speakers?: number;
  max_attendees?: number;
  max_volunteers?: number;
}

export interface TenantModuleUpdate {
  is_enabled?: boolean;
  config?: Record<string, unknown>;
  start_date?: string;
  end_date?: string;
  price?: number;
  currency?: string;
  max_papers?: number;
  max_speakers?: number;
  max_attendees?: number;
  max_volunteers?: number;
}

// Tenant User types
export interface TenantUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  pronouns: string | null;
  role: 'tenant_admin' | 'user';
  is_active: boolean;
  has_all_conference_access: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantUserCreate {
  email: string;
  first_name?: string;
  last_name?: string;
  pronouns?: string;
  role?: 'tenant_admin' | 'user';
}

export interface TenantUserUpdate {
  email?: string;
  first_name?: string;
  last_name?: string;
  pronouns?: string;
  role?: 'tenant_admin' | 'user';
  is_active?: boolean;
  has_all_conference_access?: boolean;
  password?: string;
}

// User Conference Access types
export interface UserConferenceAccess {
  id: string;
  user_id: string;
  conference_id: string;
  access_level: 'admin' | 'read_only';
  granted_by: string | null;
  granted_at: string;
}

export interface UserConferenceAccessWithDetails extends UserConferenceAccess {
  conference_name: string;
  conference_abbreviation: string | null;
  user_email: string;
  user_name: string | null;
}
