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
  created_at: string;
  updated_at: string;
}

export interface BookingOptionCreate {
  name: string;
  description?: string;
  conference_day_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface BookingOptionUpdate {
  name?: string;
  description?: string;
  conference_day_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
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
  name: string;
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
  max_uses: number;
  usage_count: number;
  is_active: boolean;
  applicable_option_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface DiscountCodeCreate {
  name: string;
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_uses?: number;
  is_active?: boolean;
  applicable_option_ids?: string[];
}

export interface DiscountCodeUpdate {
  name?: string;
  code?: string;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_uses?: number;
  is_active?: boolean;
  applicable_option_ids?: string[];
}
