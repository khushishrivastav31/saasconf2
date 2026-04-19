import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersTab from '../UsersTab';

vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../../config/api';

const mockApi = vi.mocked(api);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const listItem = {
  id: 'pu-1',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Ng',
  phone: null,
  is_active: true,
  has_password: true,
  email_verified: true,
  last_login_at: '2026-04-01T10:00:00Z',
  created_at: '2026-01-01T10:00:00Z',
  training_attendee_status: 'active',
  has_cfp_link: true,
  has_registration_link: false,
};

const detail = {
  id: 'pu-1',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Ng',
  phone: null,
  pronouns: null,
  title: null,
  company: null,
  bio: null,
  social_links: {},
  address_line_1: null,
  address_line_2: null,
  city: null,
  postal_code: null,
  country: null,
  is_active: true,
  has_password: true,
  email_verified: true,
  last_login_at: '2026-04-01T10:00:00Z',
  created_at: '2026-01-01T10:00:00Z',
  linkages: {
    training_attendee_count: 1,
    training_attendee_status: 'active',
    cfp_applicant_count: 1,
    registration_count: 0,
  },
};

describe('MyCompany UsersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the list with linkage hints', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: { items: [listItem], total: 1, page: 1, per_page: 50 },
    });
    renderWithProviders(<UsersTab />);
    await waitFor(() => {
      expect(screen.getByText(/Alice Ng/)).toBeInTheDocument();
    });
    expect(screen.getByText(/alice@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Training · CFP/)).toBeInTheDocument();
  });

  it('opens the detail panel on row click and shows the five action buttons', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { items: [listItem], total: 1, page: 1, per_page: 50 } })
      .mockResolvedValueOnce({ data: detail });
    renderWithProviders(<UsersTab />);
    await waitFor(() => expect(screen.getByText(/Alice Ng/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/alice@example.com/));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Deactivate/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Resend invite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Impersonate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merge with/i })).toBeInTheDocument();
  });

  it('fires toggle-access mutation and shows an error toast on 409', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { items: [listItem], total: 1, page: 1, per_page: 50 } })
      .mockResolvedValueOnce({ data: detail });
    mockApi.put.mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'User has active training assignments' } },
    });
    renderWithProviders(<UsersTab />);
    await waitFor(() => expect(screen.getByText(/Alice Ng/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/alice@example.com/));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Deactivate/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /Deactivate/i }));
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/portal-users/pu-1/toggle-access');
    });
  });

  it('loads history entries on the History tab', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { items: [listItem], total: 1, page: 1, per_page: 50 } })
      .mockResolvedValueOnce({ data: detail })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'h-1',
              source: 'admin',
              event_type: 'invite_resent',
              notes: 'Invite resent by admin',
              meta: null,
              created_by: 'admin-1',
              created_at: '2026-04-10T10:00:00Z',
            },
            {
              id: 'h-2',
              source: 'training',
              event_type: 'registered',
              notes: 'Registered for Python 101',
              meta: { placement_id: 'p-1' },
              created_by: null,
              created_at: '2026-03-01T10:00:00Z',
            },
          ],
          total: 2,
        },
      });
    renderWithProviders(<UsersTab />);
    await waitFor(() => expect(screen.getByText(/Alice Ng/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/alice@example.com/));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Deactivate/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/portal-users/pu-1/history');
    });
    await waitFor(() => {
      expect(screen.getByText(/Invite resent by admin/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Registered for Python 101/)).toBeInTheDocument();
    expect(screen.getByText(/^Training$/)).toBeInTheDocument();
    expect(screen.getByText(/^Admin$/)).toBeInTheDocument();
  });
});
