import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConferenceStatisticsTab from '../ConferenceStatisticsTab';
import type { Conference } from '../../../../../types';

const mockGet = vi.fn();

vi.mock('../../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

// Suppress recharts resize observer errors in jsdom
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

// Suppress react-simple-maps SVG rendering in jsdom
vi.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composable-map">{children}</div>
  ),
  Geographies: ({
    children,
  }: {
    children: (args: { geographies: unknown[] }) => React.ReactNode;
  }) => children({ geographies: [] }),
  Geography: () => null,
  Marker: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-marker">{children}</div>
  ),
  ZoomableGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="zoomable-group">{children}</div>
  ),
}));

const MOCK_CONFERENCE: Conference = {
  id: 'conf-123',
  name: 'TestConf 2026',
  abbreviation: 'TC26',
  status: 'upcoming',
  tenant_id: 'tenant-123',
} as Conference;

const MOCK_REGISTRATIONS_OVER_TIME = {
  data_points: [
    { date: '2026-01-15', count: 3, cumulative: 3 },
    { date: '2026-01-20', count: 2, cumulative: 5 },
  ],
};

const MOCK_LOCATION = {
  by_country: [
    { country: 'Germany', country_code: 'DE', count: 4 },
    { country: 'Netherlands', country_code: 'NL', count: 1 },
  ],
  by_city: [
    { city: 'Berlin', country: 'Germany', country_code: 'DE', count: 3, lat: 52.52, lng: 13.405 },
    { city: 'Munich', country: 'Germany', country_code: 'DE', count: 1, lat: 48.1351, lng: 11.582 },
    {
      city: 'Amsterdam',
      country: 'Netherlands',
      country_code: 'NL',
      count: 1,
      lat: 52.3676,
      lng: 4.9041,
    },
  ],
};

const MOCK_COMPANY = {
  companies: [
    { company: 'Acme Corp', count: 3 },
    { company: 'Beta Ltd', count: 1 },
  ],
  total_unique_companies: 2,
};

const MOCK_PAPERS_NO_CFP = {
  data_points: [],
  has_cfp: false,
};

const MOCK_PAPERS_WITH_DATA = {
  data_points: [
    { month: '2026-01', count: 5, cumulative: 5 },
    { month: '2026-02', count: 3, cumulative: 8 },
  ],
  has_cfp: true,
};

const MOCK_DAYS_NO_DAYS = {
  days: [],
  has_program_days: false,
};

const MOCK_TUTORIALS_NONE = {
  tutorials: [],
  has_tutorials: false,
  total_revenue: 0.0,
};

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ConferenceStatisticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all endpoints return empty/no-data responses
    mockGet.mockImplementation((url: string) => {
      if (url.includes('stats/registrations-over-time'))
        return Promise.resolve({ data: MOCK_REGISTRATIONS_OVER_TIME });
      if (url.includes('stats/attendees-location')) return Promise.resolve({ data: MOCK_LOCATION });
      if (url.includes('stats/attendees-company')) return Promise.resolve({ data: MOCK_COMPANY });
      if (url.includes('stats/papers-over-time'))
        return Promise.resolve({ data: MOCK_PAPERS_NO_CFP });
      if (url.includes('stats/attendees-per-day'))
        return Promise.resolve({ data: MOCK_DAYS_NO_DAYS });
      if (url.includes('stats/tutorials')) return Promise.resolve({ data: MOCK_TUTORIALS_NONE });
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
  });

  it('renders the section heading', () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    expect(screen.getByText('Conference Statistics')).toBeTruthy();
  });

  it('renders all 6 sub-tab buttons', () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    expect(screen.getByText('Registrations Over Time')).toBeTruthy();
    expect(screen.getByText('Attendees Location')).toBeTruthy();
    expect(screen.getByText('Attendees Company')).toBeTruthy();
    expect(screen.getByText('Papers Over Time')).toBeTruthy();
    expect(screen.getByText('Attendees per Day')).toBeTruthy();
    expect(screen.getByText('Tutorials')).toBeTruthy();
  });

  it('shows registrations chart on default sub-tab', async () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeTruthy();
    });
  });

  it('switches to location view on click and shows map', async () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Attendees Location'));
    await waitFor(() => {
      expect(screen.getByTestId('composable-map')).toBeTruthy();
    });
  });

  it('switches to company view and shows bar chart', async () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Attendees Company'));
    await waitFor(() => {
      expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });
  });

  it('shows not-applicable message when has_cfp=false', async () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Papers Over Time'));
    await waitFor(() => {
      expect(screen.getByText(/This conference has no Call for Papers configured/i)).toBeTruthy();
    });
  });

  it('shows papers chart when has_cfp=true', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('stats/papers-over-time'))
        return Promise.resolve({ data: MOCK_PAPERS_WITH_DATA });
      if (url.includes('stats/registrations-over-time'))
        return Promise.resolve({ data: MOCK_REGISTRATIONS_OVER_TIME });
      if (url.includes('stats/attendees-location')) return Promise.resolve({ data: MOCK_LOCATION });
      if (url.includes('stats/attendees-company')) return Promise.resolve({ data: MOCK_COMPANY });
      if (url.includes('stats/attendees-per-day'))
        return Promise.resolve({ data: MOCK_DAYS_NO_DAYS });
      if (url.includes('stats/tutorials')) return Promise.resolve({ data: MOCK_TUTORIALS_NONE });
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Papers Over Time'));
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeTruthy();
    });
  });

  it('shows not-applicable message when has_program_days=false', async () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Attendees per Day'));
    await waitFor(() => {
      expect(screen.getByText(/This conference has no program days configured/i)).toBeTruthy();
    });
  });

  it('shows not-applicable message when has_tutorials=false', async () => {
    wrapper(<ConferenceStatisticsTab conference={MOCK_CONFERENCE} isAdmin={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Tutorials'));
    await waitFor(() => {
      expect(screen.getByText(/No tutorial registrations found/i)).toBeTruthy();
    });
  });
});
