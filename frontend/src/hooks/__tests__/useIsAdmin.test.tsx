import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsAdmin } from "../useIsAdmin";
import { AuthContext } from "../../contexts/AuthContext";
import type { User } from "../../types";

describe("useIsAdmin", () => {
  const createMockUser = (role: User["role"]): User => ({
    id: "user-123",
    email: "test@example.com",
    first_name: "Test",
    last_name: "User",
    pronouns: null,
    role,
    tenant_id: "tenant-456",
    tenant_name: "Test Tenant",
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
      <AuthContext.Provider value={mockContextValue}>
        {children}
      </AuthContext.Provider>
    );
  };

  describe("admin detection", () => {
    it("returns true for super_admin role", () => {
      const superAdminUser = createMockUser("super_admin");
      const wrapper = createWrapper(superAdminUser);

      const { result } = renderHook(() => useIsAdmin(), { wrapper });

      expect(result.current).toBe(true);
    });

    it("returns true for tenant_admin role", () => {
      const tenantAdminUser = createMockUser("tenant_admin");
      const wrapper = createWrapper(tenantAdminUser);

      const { result } = renderHook(() => useIsAdmin(), { wrapper });

      expect(result.current).toBe(true);
    });

    it("returns false for regular user role", () => {
      const regularUser = createMockUser("user");
      const wrapper = createWrapper(regularUser);

      const { result } = renderHook(() => useIsAdmin(), { wrapper });

      expect(result.current).toBe(false);
    });

    it("returns false when user is null", () => {
      const wrapper = createWrapper(null);

      const { result } = renderHook(() => useIsAdmin(), { wrapper });

      expect(result.current).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("throws error when used outside AuthProvider", () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useIsAdmin());
      }).toThrow("useAuth must be used within an AuthProvider");

      consoleSpy.mockRestore();
    });
  });
});
