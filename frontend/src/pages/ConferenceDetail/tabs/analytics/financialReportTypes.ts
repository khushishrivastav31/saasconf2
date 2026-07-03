export interface PLSummary {
  total_revenue: string;
  outstanding_revenue: string;
  total_costs: string;
  net_result: string;
  currency: string;
  as_of_date: string;
}

export interface VarianceLine {
  category_name: string;
  category_color: string | null;
  planned: string;
  actual: string;
  variance: string;
  variance_percent: number;
}

export interface CostPerAttendee {
  total_paid_attendees: number;
  total_costs: string;
  cost_per_attendee: string;
  revenue_per_attendee: string;
  currency: string;
}

export interface PeriodBreakdown {
  booking_period_id: string | null;
  period_name: string;
  period_start: string | null;
  period_end: string | null;
  attendee_count: number;
  total_revenue: string;
}

export interface BookingOptionRevenue {
  booking_option_id: string;
  booking_option_name: string;
  category: 'ticket' | 'day_pass';
  attendee_count: number;
  total_revenue: string;
  currency: string;
  periods: PeriodBreakdown[];
}

export interface FinancialReportData {
  pl_summary: PLSummary;
  variance_by_category: VarianceLine[];
  cost_per_attendee: CostPerAttendee;
  revenue: {
    total_revenue: string;
    registration_revenue: string;
    sponsor_revenue: string;
    outstanding_revenue: string;
    other_revenue: string;
    currency: string;
    by_booking_option: BookingOptionRevenue[];
    total_registrations: number;
    paid_registrations: number;
    active_registrations: number;
    multiple_currencies: boolean;
  };
  budget_id: string | null;
  budget_name: string | null;
  generated_at: string;
}
