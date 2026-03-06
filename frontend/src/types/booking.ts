// Booking Options types
export interface BookingPeriod {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
  prices: Record<string, number> | null;
  currency: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingPeriodCreate {
  name: string;
  start_date: string;
  end_date: string;
  sort_order?: number;
  prices?: Record<string, number>;
  currency?: string;
  is_active?: boolean;
}

export interface BookingPeriodUpdate {
  name?: string;
  start_date?: string;
  end_date?: string;
  sort_order?: number;
  prices?: Record<string, number>;
  currency?: string;
  is_active?: boolean;
}

export interface BookingOption {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  description: string | null;
  conference_day_id: string | null;
  sort_order: number;
  is_active: boolean;
  attendance_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingOptionCreate {
  name: string;
  description?: string;
  conference_day_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  attendance_type?: string | null;
}

export interface BookingOptionUpdate {
  name?: string;
  description?: string;
  conference_day_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  attendance_type?: string | null;
}

// Booking Package types (bundles of options)
export interface BookingPackage {
  id: string;
  tenant_id: string;
  conference_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  option_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface BookingPackageCreate {
  name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  option_ids: string[];
}

export interface BookingPackageUpdate {
  name?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  option_ids?: string[];
}

export interface BookingMatrix {
  periods: BookingPeriod[];
  options: BookingOption[];
  packages: BookingPackage[];
}

// Discount Code types
export interface DiscountCode {
  id: string;
  tenant_id: string;
  conference_id: string;
  description: string;
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
  max_uses: number;
  usage_count: number;
  is_active: boolean;
  is_combinable: boolean;
  applicable_option_ids: string[];
  applicable_period_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface DiscountCodeCreate {
  description: string;
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_uses?: number;
  is_active?: boolean;
  is_combinable?: boolean;
  applicable_option_ids?: string[];
  applicable_period_ids?: string[];
}

export interface DiscountCodeUpdate {
  description?: string;
  code?: string;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_uses?: number;
  is_active?: boolean;
  is_combinable?: boolean;
  applicable_option_ids?: string[];
  applicable_period_ids?: string[];
}

// Bulk Discount Generation types
export interface BulkDiscountEntry {
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
}

export interface BulkDiscountCodeCreate {
  description_template: string;
  code_template: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_uses?: number;
  is_active?: boolean;
  is_combinable?: boolean;
  applicable_option_ids?: string[];
  applicable_period_ids?: string[];
  entries: BulkDiscountEntry[];
  counter_start: number;
  counter_padding: number;
}
