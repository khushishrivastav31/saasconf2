import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinancialReportingTab from '../FinancialReportingTab';
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
  Cell: () => null,
  ReferenceLine: () => null,
}));

const MOCK_CONFERENCE: Conference = {
  id: 'conf-123',
  name: 'TestConf 2026',
  abbreviation: 'TC26',
  status: 'upcoming',
  tenant_id: 'tenant-123',
} as Conference;

const MOCK_FINANCIAL_DATA = {
  pl_summary: {
    total_revenue: '5000.00',
    outstanding_revenue: '500.00',
    total_costs: '3000.00',
    net_result: '2000.00',
    currency: 'EUR',
    as_of_date: '2026-03-11',
  },
  variance_by_category: [
    {
      category_name: 'Marketing',
      category_color: '#3b82f6',
      planned: '1000.00',
      actual: '900.00',
      variance: '100.00',
      variance_percent: 10.0,
    },
  ],
  cost_per_attendee: {
    total_paid_attendees: 50,
    total_costs: '3000.00',
    cost_per_attendee: '60.00',
    revenue_per_attendee: '100.00',
    currency: 'EUR',
  },
  revenue: {
    total_revenue: '5000.00',
    registration_revenue: '4000.00',
    sponsor_revenue: '1000.00',
    outstanding_revenue: '500.00',
    currency: 'EUR',
    total_registrations: 55,
    paid_registrations: 50,
    multiple_currencies: false,
  },
  budget_id: 'budget-1',
  budget_name: 'TC26 Main Budget',
  generated_at: '2026-03-11T10:00:00Z',
};

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FinancialReportingTab conference={MOCK_CONFERENCE} isAdmin={true} />
    </QueryClientProvider>
  );
}

describe('FinancialReportingTab', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ data: MOCK_FINANCIAL_DATA });
  });

  it('shows loading spinner initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders P&L KPI cards', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Financial Reports')).toBeInTheDocument();
    });
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Total Costs')).toBeInTheDocument();
    expect(screen.getByText('Net Result')).toBeInTheDocument();
  });

  it('shows budget name when provided', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/TC26 Main Budget/)).toBeInTheDocument();
    });
  });

  it('renders variance table with categories', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });
    // Variance should show positive (under budget)
    expect(screen.getAllByText('+10.0%').length).toBeGreaterThan(0);
  });

  it('shows empty budget state when no variance data', async () => {
    mockGet.mockResolvedValue({
      data: {
        ...MOCK_FINANCIAL_DATA,
        variance_by_category: [],
        budget_id: null,
        budget_name: null,
      },
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/No active budget found/)).toBeInTheDocument();
    });
  });

  it('shows multi-currency warning when flag is set', async () => {
    mockGet.mockResolvedValue({
      data: {
        ...MOCK_FINANCIAL_DATA,
        revenue: { ...MOCK_FINANCIAL_DATA.revenue, multiple_currencies: true },
      },
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

  it('renders export PDF button', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Export PDF')).toBeInTheDocument();
    });
  });

  it('shows cost per attendee KPIs', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Paid Attendees')).toBeInTheDocument();
    });
    expect(screen.getByText('Cost per Attendee')).toBeInTheDocument();
    expect(screen.getByText('Revenue per Attendee')).toBeInTheDocument();
  });
});
