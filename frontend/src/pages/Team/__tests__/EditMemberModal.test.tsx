import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditMemberModal from '../EditMemberModal';
import type { User } from '../../../types';
import type { TenantUser } from '../../../types';

vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [], total: 0, page: 1, pages: 1 } }),
    put: vi.fn(),
  },
}));

let mockCurrentUser: User | null = null;

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

const baseTenantUser: TenantUser = {
  id: 'user-456',
  email: 'other@example.com',
  first_name: 'Other',
  last_name: 'User',
  pronouns: null,
  role: 'user',
  is_active: true,
  has_all_conference_access: false,
  tenant_roles: [{ scope: 'conferences', level: 'member' }],
  last_login: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const baseCurrentUser: User = {
  id: 'admin-123',
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'User',
  pronouns: null,
  role: 'tenant_admin',
  tenant_id: 'tenant-1',
  tenant_name: 'Acme',
  modules: ['conferences'],
  is_active: true,
  is_tenant_super_user: false,
  tenant_roles: [{ scope: 'conferences', level: 'admin' }],
  mfa_enabled: false,
  message_notifications_enabled: true,
  theme_preference: null,
  last_login: null,
  created_at: '2026-01-01T00:00:00Z',
};

function renderModal(targetUser: TenantUser = baseTenantUser) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditMemberModal user={targetUser} onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('EditMemberModal — self-role guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = baseCurrentUser;
  });

  describe('editing another user', () => {
    it('renders role buttons enabled when target is a different user', () => {
      renderModal(baseTenantUser); // baseTenantUser.id !== admin-123

      const roleButtons = screen.getAllByRole('button', { name: /admin|member/i });
      roleButtons.forEach((btn) => {
        expect(btn).not.toBeDisabled();
      });
    });

    it('does not show the self-guard notice when editing another user', () => {
      renderModal(baseTenantUser);

      expect(screen.queryByText(/you cannot modify your own roles/i)).not.toBeInTheDocument();
    });
  });

  describe('editing yourself', () => {
    it('disables role buttons when target is the current user', () => {
      const selfUser: TenantUser = {
        ...baseTenantUser,
        id: 'admin-123',
        email: 'admin@example.com',
      };
      renderModal(selfUser);

      const roleButtons = screen.getAllByRole('button', { name: /admin|member/i });
      roleButtons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });

    it('shows the self-guard notice when target is the current user', () => {
      const selfUser: TenantUser = {
        ...baseTenantUser,
        id: 'admin-123',
        email: 'admin@example.com',
      };
      renderModal(selfUser);

      expect(screen.getByText(/you cannot modify your own roles/i)).toBeInTheDocument();
    });
  });
});
