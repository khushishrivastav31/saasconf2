import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RevenueTrackingTab from '../RevenueTrackingTab';
import type { Conference } from '../../../../../types';

const mockGet = vi.fn();

vi.mock('../../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Recharts uses SVG/canvas - suppress resize observer errors in jsdom
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div data-testid="pie" />,
  Cell: () => null,
  Legend: () => null,
}));

const MOCK_CONFERENCE: Conference = {
  id: 'conf-123',
  name: 'TestConf 2026',
  abbreviation: 'TC26',
  status: 'upcoming',
  tenant_id: 'tenant-123',
} as Conference;

const MOCK_REVENUE_DATA = {
  total_revenue: '1190.00',
  registration_revenue: '1000.00',
  sponsor_revenue: '190.00',
  outstanding_revenue: '0.00',
  currency: 'EUR',
  by_booking_option: [
    {
      booking_option_id: 'bo-1',
      booking_option_name: 'Standard Ticket',
      category: 'ticket',
      conference_day_id: null,
      attendee_count: 10,
      total_revenue: '1000.00',
      subtotal_revenue: '840.34',
      tax_amount: '159.66',
      currency: 'EUR',
      periods: [
        {
          booking_period_id: 'bp-1',
          period_name: 'Early Bird',
          period_start: '2026-01-01',
          period_end: '2026-02-28',
          attendee_count: 6,
          total_revenue: '600.00',
          subtotal_revenue: '504.20',
          tax_amount: '95.80',
        },
        {
          booking_period_id: 'bp-2',
          period_name: 'Regular',
          period_start: '2026-03-01',
          period_end: '2026-04-30',
          attendee_count: 4,
          total_revenue: '400.00',
          subtotal_revenue: '336.14',
          tax_amount: '63.86',
        },
      ],
    },
  ],
  sponsor_invoice_count: 1,
  total_registrations: 12,
  paid_registrations: 10,
  cancelled_registrations: 2,
  multiple_currencies: false,
};

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RevenueTrackingTab conference={MOCK_CONFERENCE} isAdmin={true} />
    </QueryClientProvider>
  );
}

describe('RevenueTrackingTab', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ data: MOCK_REVENUE_DATA });
  });

  it('shows loading spinner initially', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderTab();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders KPI cards after data loads', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Revenue Tracking')).toBeInTheDocument();
    });
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Registration Revenue')).toBeInTheDocument();
    expect(screen.getByText('Sponsor Revenue')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
  });

  it('renders booking option row with data', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Standard Ticket')).toBeInTheDocument();
    });
    expect(screen.getByText('Ticket')).toBeInTheDocument();
  });

  it('shows period sub-rows when option is expanded', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Standard Ticket')).toBeInTheDocument();
    });
    // Period sub-rows not visible before click
    expect(screen.queryByText('Early Bird')).not.toBeInTheDocument();
    // Click the option row to expand
    await user.click(screen.getByText('Standard Ticket').closest('tr')!);
    // Now period rows should be visible
    expect(screen.getByText('Early Bird')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
  });

  it('shows empty state when no booking options', async () => {
    mockGet.mockResolvedValue({
      data: {
        ...MOCK_REVENUE_DATA,
        by_booking_option: [],
        total_revenue: '0.00',
        registration_revenue: '0.00',
      },
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/No paid invoices found/)).toBeInTheDocument();
    });
  });

  it('shows multi-currency warning when flag is set', async () => {
    mockGet.mockResolvedValue({
      data: { ...MOCK_REVENUE_DATA, multiple_currencies: true },
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/Multi-currency invoices/)).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it('renders export buttons', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });
    expect(screen.getByText('Export XLSX')).toBeInTheDocument();
  });
});
