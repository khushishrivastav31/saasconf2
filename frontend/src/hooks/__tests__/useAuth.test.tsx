import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "../useAuth";
import { AuthContext } from "../../contexts/AuthContext";
import type { User } from "../../types";

describe("useAuth", () => {
  describe("when used outside AuthProvider", () => {
    it("throws an error", () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow("useAuth must be used within an AuthProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("when used inside AuthProvider", () => {
    const mockUser: User = {
      id: "user-123",
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
      pronouns: "they/them",
      role: "user",
      tenant_id: "tenant-456",
      tenant_name: "Test Tenant",
      modules: ["module1", "module2"],
      is_active: true,
    };

    const mockContextValue = {
      user: mockUser,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    it("returns the context value", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value={mockContextValue}>
          {children}
        </AuthContext.Provider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current).toBe(mockContextValue);
    });

    it("returns the user from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value={mockContextValue}>
          {children}
        </AuthContext.Provider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.user?.email).toBe("test@example.com");
      expect(result.current.user?.role).toBe("user");
    });

    it("returns isLoading state from context", () => {
      const loadingContext = {
        ...mockContextValue,
        isLoading: true,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value={loadingContext}>
          {children}
        </AuthContext.Provider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it("returns login function from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value={mockContextValue}>
          {children}
        </AuthContext.Provider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.login).toBe(mockContextValue.login);
      expect(typeof result.current.login).toBe("function");
    });

    it("returns logout function from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value={mockContextValue}>
          {children}
        </AuthContext.Provider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.logout).toBe(mockContextValue.logout);
      expect(typeof result.current.logout).toBe("function");
    });

    it("returns refreshUser function from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value={mockContextValue}>
          {children}
        </AuthContext.Provider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.refreshUser).toBe(mockContextValue.refreshUser);
      expect(typeof result.current.refreshUser).toBe("function");
    });

    it("returns null user when not authenticated", () => {
      const unauthenticatedContext = {
        ...mockContextValue,
        user: null,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value={unauthenticatedContext}>
          {children}
        </AuthContext.Provider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.user).toBeNull();
    });
  });
});
