import type { LocationContactPerson } from './common';

// Location types (values come from tenant configuration)
export type LocationType = string;

export interface Location {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  code: string | null;
  location_type: LocationType;
  description: string | null;
  capacity: number | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  full_address: string | null;
  latitude: number | null;
  longitude: number | null;
  building: string | null;
  floor: string | null;
  phone: string | null;
  website: string | null;
  vat_number: string | null;
  amenities: string[];
  accessibility_features: string[];
  virtual_url: string | null;
  virtual_platform: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  contact_persons: LocationContactPerson[];
  created_at: string;
  updated_at: string;
  children_count: number;
  conference_ids: string[];
}

export interface LocationCreate {
  name: string;
  code?: string;
  location_type: LocationType;
  description?: string;
  capacity?: number;
  parent_id?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  building?: string;
  floor?: string;
  phone?: string;
  website?: string;
  vat_number?: string;
  amenities?: string[];
  accessibility_features?: string[];
  virtual_url?: string;
  virtual_platform?: string;
  contact_persons?: LocationContactPerson[];
  conference_id?: string;
}

export interface LocationUpdate {
  name?: string;
  code?: string;
  location_type?: LocationType;
  description?: string;
  capacity?: number;
  parent_id?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  building?: string;
  floor?: string;
  phone?: string;
  website?: string;
  vat_number?: string;
  amenities?: string[];
  accessibility_features?: string[];
  virtual_url?: string;
  virtual_platform?: string;
  contact_persons?: LocationContactPerson[];
  is_active?: boolean;
}

export interface LocationTypeCount {
  slug: string;
  name: string;
  count: number;
}

export interface LocationStats {
  total: number;
  total_capacity: number;
  type_counts: LocationTypeCount[];
}
