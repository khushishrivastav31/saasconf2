// User types
export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  pronouns: string | null;
  role: 'super_admin' | 'tenant_admin' | 'user';
  tenant_id: string | null;
  tenant_name: string | null;
  modules: string[];
  is_active: boolean;
  is_tenant_super_user: boolean;
  mfa_enabled: boolean;
  message_notifications_enabled: boolean;
  theme_preference: 'light' | 'dark' | null;
  last_login: string | null;
  created_at: string;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface MFALoginResponse {
  mfa_required: boolean;
  mfa_token: string;
}
