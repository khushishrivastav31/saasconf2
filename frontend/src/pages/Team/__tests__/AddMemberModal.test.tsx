import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddMemberModal from '../AddMemberModal';
import type { User } from '../../../types';

vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [], total: 0, page: 1, pages: 1 } }),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

let mockUser: User | null = null;

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddMemberModal onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

const baseUser: User = {
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

describe('AddMemberModal access-control gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the Super User toggle when inviter is a plain tenant admin (QA 0.5.1.5)', async () => {
    mockUser = { ...baseUser, role: 'tenant_admin', is_tenant_super_user: false };

    renderWithProviders();

    await waitFor(() => expect(screen.getByText('Roles')).toBeInTheDocument());
    expect(screen.queryByText('Super User')).not.toBeInTheDocument();
  });

  it('shows the Super User toggle for a tenant super user', async () => {
    mockUser = { ...baseUser, role: 'tenant_admin', is_tenant_super_user: true };

    renderWithProviders();

    await waitFor(() => expect(screen.getByText('Super User')).toBeInTheDocument());
  });

  it('shows the Super User toggle for a SaaS super_admin', async () => {
    mockUser = { ...baseUser, role: 'super_admin', is_tenant_super_user: false };

    renderWithProviders();

    await waitFor(() => expect(screen.getByText('Super User')).toBeInTheDocument());
  });

  it('hides scope rows for modules not enabled on the tenant (QA 0.5.1.6)', async () => {
    mockUser = { ...baseUser, modules: ['conferences'] };

    renderWithProviders();

    await waitFor(() => expect(screen.getByText('Roles')).toBeInTheDocument());
    expect(screen.getByText('Conferences')).toBeInTheDocument();
    expect(screen.queryByText('Trainings')).not.toBeInTheDocument();
    expect(screen.queryByText('Accounting')).not.toBeInTheDocument();
  });

  it('shows all scope rows for super_admin even with empty modules', async () => {
    mockUser = { ...baseUser, role: 'super_admin', modules: [] };

    renderWithProviders();

    await waitFor(() => expect(screen.getByText('Conferences')).toBeInTheDocument());
    expect(screen.getByText('Trainings')).toBeInTheDocument();
    expect(screen.getByText('Accounting')).toBeInTheDocument();
  });
});
