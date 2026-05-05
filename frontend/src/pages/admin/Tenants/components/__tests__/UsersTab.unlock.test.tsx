import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersTab from '../UsersTab';

vi.mock('../../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../../config/api';

const mockApi = vi.mocked(api);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const userRow = {
  id: 'user-1',
  email: 'admin2@trendig.com',
  first_name: 'Admin',
  last_name: 'Two',
  pronouns: null,
  role: 'tenant_admin',
  is_active: true,
  tenant_id: 'tenant-1',
  tenant_roles: [{ scope: 'all', level: 'super_user' }],
};

describe('admin Tenants UsersTab — unlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: { items: [userRow], total: 1, page: 1, pages: 1 } });
  });

  it('calls unlock-login when the lock button is clicked and shows the toast', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        message: "Cleared 5 failed login attempt(s) for 'admin2@trendig.com'",
        was_locked: true,
        attempts_cleared: 5,
      },
    });

    renderWithProviders(
      <UsersTab tenantId="tenant-1" onAddUser={vi.fn()} onSuperUserChange={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText('admin2@trendig.com')).toBeInTheDocument());

    const unlockBtn = screen.getByTitle(/Reset failed-login counter/i);
    await userEvent.click(unlockBtn);

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/users/user-1/unlock-login'));
    await waitFor(() =>
      expect(screen.getByText(/Cleared 5 failed login attempt/i)).toBeInTheDocument()
    );
  });

  it('shows the no-attempts toast when the account was not locked', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        message: "No failed login attempts on record for 'admin2@trendig.com'",
        was_locked: false,
        attempts_cleared: 0,
      },
    });

    renderWithProviders(
      <UsersTab tenantId="tenant-1" onAddUser={vi.fn()} onSuperUserChange={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText('admin2@trendig.com')).toBeInTheDocument());

    await userEvent.click(screen.getByTitle(/Reset failed-login counter/i));

    await waitFor(() =>
      expect(screen.getByText(/No failed login attempts on record/i)).toBeInTheDocument()
    );
  });

  it('shows the parsed error message in the toast when the unlock endpoint fails', async () => {
    // Simulate a 500 with a server-detail field — parseApiError extracts it.
    mockApi.post.mockRejectedValue({
      response: {
        status: 500,
        data: { detail: 'Redis is unavailable; cannot lift the lockout' },
      },
    });

    renderWithProviders(
      <UsersTab tenantId="tenant-1" onAddUser={vi.fn()} onSuperUserChange={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText('admin2@trendig.com')).toBeInTheDocument());

    await userEvent.click(screen.getByTitle(/Reset failed-login counter/i));

    // The mutation's onError path runs parseApiError(err) and surfaces it as
    // a toast — verifies the failure path that previously had no test.
    await waitFor(() => expect(screen.getByText(/Redis is unavailable/i)).toBeInTheDocument());
  });
});
