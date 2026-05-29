import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PaymentReminderSettingsTab from '../PaymentReminderSettingsTab';
import type { Conference } from '../../../../../types';

vi.mock('../../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import api from '../../../../../config/api';
const mockedApi = vi.mocked(api);

const SETTINGS_RESPONSE = {
  payment_reminders_enabled: true,
  first_reminder_days: 2,
  second_reminder_days: 17,
  notify_admin_after_second: true,
};

const mockConference: Conference = {
  id: 'conf-123',
  name: 'Test Conference',
  abbreviation: 'TC',
  tenant_id: 'tenant-1',
  tenant_slug: 'demo',
  status: 'active',
  currency: null,
  invoice_currency: null,
  country: 'DE',
  city: null,
  state: null,
  postal_code: null,
  start_date: null,
  end_date: null,
  timezone: null,
  description: null,
  website: null,
  support_email: null,
  contact_email: null,
  phone: null,
  venue_name: null,
  venue_address: null,
  venue_type: 'in_person',
  venue_url: null,
  virtual_platform_url: null,
  logo_url: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('PaymentReminderSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.get.mockResolvedValue({ data: SETTINGS_RESPONSE });
  });

  it('renders the heading after settings load', async () => {
    render(<PaymentReminderSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Payment Reminders')).toBeInTheDocument();
    });
  });

  it('shows the enable-reminders checkbox after settings load', async () => {
    render(<PaymentReminderSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/enable automatic payment reminders/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/enable automatic payment reminders/i)).toBeChecked();
  });

  it('toggling the checkbox marks the form dirty and enables save', async () => {
    render(<PaymentReminderSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/enable automatic payment reminders/i)).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText(/enable automatic payment reminders/i);
    fireEvent.click(checkbox);

    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
  });

  it('calls PUT on save with toggled value', async () => {
    mockedApi.put.mockResolvedValue({ data: {} });

    render(<PaymentReminderSettingsTab conference={mockConference} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/enable automatic payment reminders/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/enable automatic payment reminders/i));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedApi.put).toHaveBeenCalledWith(
        `/conferences/${mockConference.id}/settings/payment-reminder-settings`,
        expect.objectContaining({ payment_reminders_enabled: false })
      );
    });
  });

  it('disables the checkbox when isAdmin is false', async () => {
    render(<PaymentReminderSettingsTab conference={mockConference} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/enable automatic payment reminders/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/enable automatic payment reminders/i)).toBeDisabled();
  });
});
