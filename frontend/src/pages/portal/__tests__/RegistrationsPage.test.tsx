import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import RegistrationsPage from '../RegistrationsPage';
import { createTestQueryClient } from '../../../test-utils';

vi.mock('../../../config/portalApi', () => ({
  default: { get: vi.fn() },
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

function createRegistration(
  overrides: Partial<{
    id: string;
    conference_id: string;
    conference_name: string;
    booking_option_name: string | null;
    status: string;
    invoice_id: string | null;
    invoice_number: string | null;
    created_at: string | null;
  }> = {}
) {
  return {
    id: 'reg-1',
    conference_id: 'conf-1',
    conference_name: 'TestConf 2026',
    booking_option_name: 'Full Pass',
    status: 'paid',
    invoice_id: null,
    invoice_number: null,
    created_at: '2026-01-10T09:00:00Z',
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RegistrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows a spinner while loading', () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {}));

      const { container } = renderWithProviders(<RegistrationsPage />);

      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows the empty message when no registrations exist', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: [] });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('No registrations found')).toBeInTheDocument();
      });
    });

    it('shows the helper subtitle in the empty state', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: [] });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(
          screen.getByText("You don't have any conference registrations yet.")
        ).toBeInTheDocument();
      });
    });
  });

  describe('rendering registrations', () => {
    it('renders the heading when registrations exist', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration()],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Registrations')).toBeInTheDocument();
      });
    });

    it('renders rows from the API response', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [
          createRegistration({ id: 'r-1', conference_name: 'Alpha Conf' }),
          createRegistration({ id: 'r-2', conference_name: 'Beta Conf' }),
        ],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Alpha Conf')).toBeInTheDocument();
      });
      expect(screen.getByText('Beta Conf')).toBeInTheDocument();
    });

    it('renders the booking option name', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ booking_option_name: 'Workshop Pass' })],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Workshop Pass')).toBeInTheDocument();
      });
    });

    it('shows a dash when booking option name is null', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ booking_option_name: null })],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Registrations')).toBeInTheDocument();
      });
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('renders the invoice number when present', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ invoice_id: 'inv-1', invoice_number: 'INV-2026-001' })],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
      });
    });

    it('shows a dash in the invoice column when no invoice exists', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ invoice_id: null, invoice_number: null })],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Registrations')).toBeInTheDocument();
      });
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  describe('status badges', () => {
    it('renders a "Paid" badge for paid registrations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ status: 'paid' })],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Paid')).toBeInTheDocument();
      });
    });

    it('renders "Invoiced" for invoiced registrations', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ status: 'invoiced' })],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Invoiced')).toBeInTheDocument();
      });
    });

    it('renders "Pending Invoice" for pending invoice status', async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: [createRegistration({ status: 'registered_pending_invoice' })],
      });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Pending Invoice')).toBeInTheDocument();
      });
    });
  });

  describe('API call', () => {
    it('fetches from the correct unified endpoint', async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: [] });

      renderWithProviders(<RegistrationsPage />);

      await waitFor(() => {
        expect(mockPortalApi.get).toHaveBeenCalledWith('/portal/unified/me/registrations');
      });
    });
  });
});
