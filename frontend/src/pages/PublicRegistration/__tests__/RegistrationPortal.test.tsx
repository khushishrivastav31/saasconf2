import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '../../../components/Toast';

// Mock heavy dependencies
vi.mock('react-google-recaptcha-v3', () => ({
  GoogleReCaptchaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGoogleReCaptcha: () => ({ executeRecaptcha: null }),
}));

vi.mock('../hooks/usePortalCSS', () => ({ usePortalCSS: () => {} }));
vi.mock('../hooks/useConferencePublic', () => ({ useConferencePublic: vi.fn() }));

import { useConferencePublic } from '../hooks/useConferencePublic';
import RegistrationPortal from '../index';

const mockUseConferencePublic = vi.mocked(useConferencePublic);

const baseConference = {
  id: 'conf-1',
  name: 'Test Conference',
  abbreviation: 'tc2026',
  description: null,
  start_date: '2026-11-20',
  end_date: '2026-11-23',
  location: null,
  website: null,
  logo_url: null,
  booking_options: [],
  booking_periods: [],
  currency: 'EUR',
  country: 'DE',
  venue_type: 'onsite' as const,
  registration_start_date: null,
  registration_end_date: null,
  success_message: null,
  policies: null,
  stripe_enabled: false,
  stripe_publishable_key: null,
  bank_transfer_countries: [],
};

function renderPortal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/test-tenant/register/tc2026']}>
          <Routes>
            <Route path=":tenantSlug/register/:conferenceSlug/*" element={<RegistrationPortal />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('RegistrationPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while fetching', () => {
    mockUseConferencePublic.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useConferencePublic>);

    renderPortal();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error state when conference not found', () => {
    mockUseConferencePublic.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Not found'),
    } as ReturnType<typeof useConferencePublic>);

    renderPortal();
    expect(screen.getByText('Conference Not Found')).toBeInTheDocument();
  });

  it('shows coming-soon message when booking_options is empty', () => {
    mockUseConferencePublic.mockReturnValue({
      data: { ...baseConference, booking_options: [] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useConferencePublic>);

    renderPortal();
    expect(screen.getByText('Test Conference')).toBeInTheDocument();
    expect(screen.getByText(/Registration is not open yet/i)).toBeInTheDocument();
  });

  it('shows coming-soon message when booking_options is undefined', () => {
    mockUseConferencePublic.mockReturnValue({
      data: { ...baseConference, booking_options: undefined as never },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useConferencePublic>);

    renderPortal();
    expect(screen.getByText(/Registration is not open yet/i)).toBeInTheDocument();
  });

  it('does not crash when booking_periods is empty', () => {
    mockUseConferencePublic.mockReturnValue({
      data: { ...baseConference, booking_options: [], booking_periods: [] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useConferencePublic>);

    expect(() => renderPortal()).not.toThrow();
  });

  it('does not crash when booking_periods is undefined', () => {
    mockUseConferencePublic.mockReturnValue({
      data: { ...baseConference, booking_options: [], booking_periods: undefined as never },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useConferencePublic>);

    expect(() => renderPortal()).not.toThrow();
  });

  it('renders the registration form when booking options and an active period are configured', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const bookingOption = {
      id: 'opt-1',
      name: 'Standard Pass',
      description: 'Full conference access',
      price: 599,
      currency: 'EUR',
      capacity: null,
      is_sold_out: false,
      requires_session_selection: false,
      session_slots: [],
    };

    const activePeriod = {
      id: 'period-1',
      name: 'Regular',
      start_date: yesterday,
      end_date: tomorrow,
      prices: { 'opt-1': 599 },
      sort_order: 1,
    };

    mockUseConferencePublic.mockReturnValue({
      data: {
        ...baseConference,
        booking_options: [bookingOption],
        booking_periods: [activePeriod],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useConferencePublic>);

    renderPortal();

    // Coming-soon placeholder must NOT appear
    expect(screen.queryByText(/Registration is not open yet/i)).not.toBeInTheDocument();
    // Booking option name should be visible in the form
    expect(screen.getByText('Standard Pass')).toBeInTheDocument();
    // Today falls within the active period — price should render
    expect(screen.getByText(/599/)).toBeInTheDocument();
  });
});
