import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PortalAccountCard from '../PortalAccountCard';

vi.mock('../../config/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../config/api';

const mockApi = vi.mocked(api);

function renderCard(portalUserId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PortalAccountCard portalUserId={portalUserId} />
    </QueryClientProvider>
  );
}

const detail = {
  id: 'pu-42',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Speaker',
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
    training_attendee_count: 0,
    training_attendee_status: null,
    cfp_applicant_count: 1,
    registration_count: 0,
  },
};

describe('PortalAccountCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and renders the status row plus the five action buttons', async () => {
    mockApi.get.mockResolvedValueOnce({ data: detail });

    renderCard('pu-42');

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/portal-users/pu-42');
    });
    await waitFor(() => {
      expect(screen.getByText(/Portal Account/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/^Active$/)).toBeInTheDocument();
    expect(screen.getByText(/^Set$/)).toBeInTheDocument();
    expect(screen.getByText(/^Password$/)).toBeInTheDocument();
    expect(screen.getByText(/Email verified/)).toBeInTheDocument();
    expect(screen.getByText(/Last login/)).toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Deactivate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend invite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Impersonate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merge with/i })).toBeInTheDocument();
  });

  it('disables Impersonate when the portal user is inactive and shows Activate', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { ...detail, is_active: false } });

    renderCard('pu-42');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Activate/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /Impersonate/i })).toBeDisabled();
    expect(screen.getByText(/^Inactive$/)).toBeInTheDocument();
  });

  it('renders every action button with type="button" (safe to embed in a form)', async () => {
    mockApi.get.mockResolvedValueOnce({ data: detail });

    renderCard('pu-42');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Deactivate/i })).toBeInTheDocument()
    );
    for (const name of [
      /Deactivate/i,
      /Resend invite/i,
      /Reset password/i,
      /Impersonate/i,
      /Merge with/i,
    ]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('type', 'button');
    }
  });
});
