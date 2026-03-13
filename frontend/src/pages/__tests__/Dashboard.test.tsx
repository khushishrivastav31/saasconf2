import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';
import type { User } from '../../types';

// Mock react-router
const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock useAuth hook
let mockUser: User | null = null;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 'user-123',
      email: 'admin@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      pronouns: null,
      role: 'tenant_admin',
      tenant_id: 'tenant-456',
      tenant_name: 'Acme Corp',
      modules: ['conferences', 'cfp'],
      is_active: true,
      is_tenant_super_user: false,
      message_notifications_enabled: true,
      last_login: null,
      created_at: '2024-01-01T00:00:00Z',
    };
  });

  describe('rendering', () => {
    it('renders the Welcome heading', () => {
      render(<Dashboard />);

      expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    });

    it("renders a welcome message with the user's full name", () => {
      render(<Dashboard />);

      expect(screen.getByText('Welcome back, Jane Doe')).toBeInTheDocument();
    });

    it('renders a welcome message with email when name is not available', () => {
      mockUser = {
        ...mockUser!,
        first_name: null,
        last_name: null,
      };

      render(<Dashboard />);

      expect(screen.getByText('Welcome back, admin@example.com')).toBeInTheDocument();
    });

    it('renders a welcome message with first name only when last name is null', () => {
      mockUser = {
        ...mockUser!,
        last_name: null,
      };

      render(<Dashboard />);

      expect(screen.getByText('Welcome back, Jane')).toBeInTheDocument();
    });

    it('renders a welcome message with last name only when first name is null', () => {
      mockUser = {
        ...mockUser!,
        first_name: null,
      };

      render(<Dashboard />);

      expect(screen.getByText('Welcome back, Doe')).toBeInTheDocument();
    });
  });

  describe('super_admin view', () => {
    beforeEach(() => {
      mockUser = {
        ...mockUser!,
        role: 'super_admin',
      };
    });

    it('renders Companies card with correct link', () => {
      render(<Dashboard />);

      const companiesLink = screen.getByRole('link', { name: /companies/i });
      expect(companiesLink).toBeInTheDocument();
      expect(companiesLink).toHaveAttribute('href', '/admin/tenants');
    });

    it('renders Audit Logs card with correct link', () => {
      render(<Dashboard />);

      const auditLogsLink = screen.getByRole('link', {
        name: /audit logs/i,
      });
      expect(auditLogsLink).toBeInTheDocument();
      expect(auditLogsLink).toHaveAttribute('href', '/admin/audit-logs');
    });

    it('renders card descriptions', () => {
      render(<Dashboard />);

      expect(screen.getByText('Manage tenant companies')).toBeInTheDocument();
      expect(screen.getByText('View system activity')).toBeInTheDocument();
    });
  });

  describe('tenant_admin view', () => {
    beforeEach(() => {
      mockUser = {
        ...mockUser!,
        role: 'tenant_admin',
      };
    });

    it('renders getting started section', () => {
      render(<Dashboard />);

      expect(screen.getByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
    });

    it('does not render super_admin cards', () => {
      render(<Dashboard />);

      expect(screen.queryByRole('link', { name: /companies/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /audit logs/i })).not.toBeInTheDocument();
    });
  });

  describe('regular user view', () => {
    beforeEach(() => {
      mockUser = {
        ...mockUser!,
        role: 'user',
      };
    });

    it('renders getting started section for regular users', () => {
      render(<Dashboard />);

      expect(screen.getByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
    });

    it('does not render super_admin navigation cards', () => {
      render(<Dashboard />);

      expect(screen.queryByText('Manage tenant companies')).not.toBeInTheDocument();
      expect(screen.queryByText('View system activity')).not.toBeInTheDocument();
    });
  });
});
