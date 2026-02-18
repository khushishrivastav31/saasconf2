import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsTenantAdmin, useIsSuperAdmin } from '../useIsAdmin';
import { AuthContext } from '../../contexts/AuthContext';
import type { User } from '../../types';

const createMockUser = (role: User['role']): User => ({
  id: 'user-123',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  pronouns: null,
  role,
  tenant_id: 'tenant-456',
  tenant_name: 'Test Tenant',
  modules: [],
  is_active: true,
});

const createWrapper = (user: User | null) => {
  const mockContextValue = {
    user,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };

  return ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider value={mockContextValue}>{children}</AuthContext.Provider>
  );
};

describe('useIsTenantAdmin', () => {
  it('returns true for tenant_admin role', () => {
    const wrapper = createWrapper(createMockUser('tenant_admin'));
    const { result } = renderHook(() => useIsTenantAdmin(), { wrapper });
    expect(result.current).toBe(true);
  });

  it('returns false for super_admin role', () => {
    const wrapper = createWrapper(createMockUser('super_admin'));
    const { result } = renderHook(() => useIsTenantAdmin(), { wrapper });
    expect(result.current).toBe(false);
  });

  it('returns false for regular user role', () => {
    const wrapper = createWrapper(createMockUser('user'));
    const { result } = renderHook(() => useIsTenantAdmin(), { wrapper });
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const wrapper = createWrapper(null);
    const { result } = renderHook(() => useIsTenantAdmin(), { wrapper });
    expect(result.current).toBe(false);
  });
});

describe('useIsSuperAdmin', () => {
  it('returns true for super_admin role', () => {
    const wrapper = createWrapper(createMockUser('super_admin'));
    const { result } = renderHook(() => useIsSuperAdmin(), { wrapper });
    expect(result.current).toBe(true);
  });

  it('returns false for tenant_admin role', () => {
    const wrapper = createWrapper(createMockUser('tenant_admin'));
    const { result } = renderHook(() => useIsSuperAdmin(), { wrapper });
    expect(result.current).toBe(false);
  });

  it('returns false for regular user role', () => {
    const wrapper = createWrapper(createMockUser('user'));
    const { result } = renderHook(() => useIsSuperAdmin(), { wrapper });
    expect(result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    const wrapper = createWrapper(null);
    const { result } = renderHook(() => useIsSuperAdmin(), { wrapper });
    expect(result.current).toBe(false);
  });
});
