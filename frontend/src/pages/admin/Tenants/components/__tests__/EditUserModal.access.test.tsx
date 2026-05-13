import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditUserModal } from '../UsersTab';
import type { TenantUser, User } from '../../../../../types';

vi.mock('../../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

let mockUser: User | null = null;

vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function renderWithProviders(target: TenantUser) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditUserModal
        user={target}
        tenantId="tenant-1"
        onSuperUserChange={vi.fn()}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  );
}

const baseInviter: User = {
  id: 'inviter-1',
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'User',
  pronouns: null,
  role: 'tenant_admin',
  tenant_id: 'tenant-1',
  tenant_name: 'Acme',
  modules: ['conferences', 'trainings', 'accounting'],
  is_active: true,
  is_tenant_super_user: false,
  tenant_roles: [],
  mfa_enabled: false,
  message_notifications_enabled: true,
  theme_preference: null,
  last_login: null,
  created_at: '2026-01-01T00:00:00Z',
};

const targetUser: TenantUser = {
  id: 'target-1',
  email: 'member@example.com',
  first_name: 'Member',
  last_name: 'Person',
  pronouns: null,
  role: 'user',
  is_active: true,
  has_all_conference_access: true,
  tenant_roles: [],
  last_login: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const targetSuperUser: TenantUser = {
  ...targetUser,
  id: 'target-su',
  email: 'su@example.com',
  tenant_roles: [{ scope: 'all', level: 'super_user' }],
};

describe('EditUserModal access-control gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the Super User toggle when current user is a plain tenant admin (QA 0.5.1.5)', async () => {
    mockUser = { ...baseInviter, role: 'tenant_admin', is_tenant_super_user: false };

    renderWithProviders(targetUser);

    await waitFor(() => expect(screen.getByText('Roles')).toBeInTheDocument());
    expect(screen.queryByText('Super User')).not.toBeInTheDocument();
  });

  it('shows the read-only banner when a non-su admin opens a Super User profile', async () => {
    mockUser = { ...baseInviter, role: 'tenant_admin', is_tenant_super_user: false };

    renderWithProviders(targetSuperUser);

    await waitFor(() => expect(screen.getByText(/This user is a Super User/i)).toBeInTheDocument());
    // Toggle isn't rendered for non-su admins.
    expect(screen.queryByText(/Full access \+ Stripe keys/i)).not.toBeInTheDocument();
  });

  it('shows the Super User toggle for a tenant super user', async () => {
    mockUser = { ...baseInviter, is_tenant_super_user: true };

    renderWithProviders(targetUser);

    await waitFor(() => expect(screen.getByText('Super User')).toBeInTheDocument());
    expect(screen.getByText(/Full access \+ Stripe keys/i)).toBeInTheDocument();
  });

  it('hides scope rows for modules not enabled on the tenant (QA 0.5.1.6)', async () => {
    mockUser = { ...baseInviter, modules: ['conferences'] };

    renderWithProviders(targetUser);

    await waitFor(() => expect(screen.getByText('Roles')).toBeInTheDocument());
    expect(screen.getByText('Conferences')).toBeInTheDocument();
    expect(screen.queryByText('Trainings')).not.toBeInTheDocument();
    expect(screen.queryByText('Accounting')).not.toBeInTheDocument();
  });

  it('shows all scope rows for super_admin even with empty modules', async () => {
    mockUser = { ...baseInviter, role: 'super_admin', modules: [] };

    renderWithProviders(targetUser);

    await waitFor(() => expect(screen.getByText('Conferences')).toBeInTheDocument());
    expect(screen.getByText('Trainings')).toBeInTheDocument();
    expect(screen.getByText('Accounting')).toBeInTheDocument();
  });
});
