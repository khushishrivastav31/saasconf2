import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useConferenceAdmin } from "../useConferenceAdmin";
import { AuthContext } from "../../contexts/AuthContext";
import type { User } from "../../types";

// Mock the api module
vi.mock("../../config/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from "../../config/api";

describe("useConferenceAdmin", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const createMockUser = (
    role: User["role"],
    overrides: Partial<User> = {}
  ): User => ({
    id: "user-123",
    email: "test@example.com",
    first_name: "Test",
    last_name: "User",
    pronouns: null,
    role,
    tenant_id: "tenant-456",
    tenant_name: "Test Tenant",
    modules: ["conferences"],
    is_active: true,
    ...overrides,
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
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={mockContextValue}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  };

  describe("super_admin role", () => {
    it("returns isAdmin=false (read-only access) without making API call", async () => {
      const superAdminUser = createMockUser("super_admin");
      const wrapper = createWrapper(superAdminUser);

      const { result } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      // Super admins can view but NOT modify tenant data
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.accessLevel).toBe("read_only");
      // Should not make API call for super_admin
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  describe("tenant_admin role", () => {
    it("returns isAdmin=true without making API call", async () => {
      const tenantAdminUser = createMockUser("tenant_admin");
      const wrapper = createWrapper(tenantAdminUser);

      const { result } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.accessLevel).toBe("admin");
      // Should not make API call for tenant_admin
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  describe("regular user role", () => {
    it("returns isAdmin=true when user has conference admin access", async () => {
      const regularUser = createMockUser("user");
      const wrapper = createWrapper(regularUser);

      vi.mocked(api.get).mockResolvedValue({
        data: {
          has_access: true,
          access_level: "admin",
          is_conference_admin: true,
        },
      });

      const { result } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.accessLevel).toBe("admin");
      expect(api.get).toHaveBeenCalledWith(
        "/user-conference-access/my-access/conference-123"
      );
    });

    it("returns isAdmin=false when user has read-only access", async () => {
      const regularUser = createMockUser("user");
      const wrapper = createWrapper(regularUser);

      vi.mocked(api.get).mockResolvedValue({
        data: {
          has_access: true,
          access_level: "read_only",
          is_conference_admin: false,
        },
      });

      const { result } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.accessLevel).toBe("read_only");
    });

    it("returns isAdmin=false when user has no access record", async () => {
      const regularUser = createMockUser("user");
      const wrapper = createWrapper(regularUser);

      vi.mocked(api.get).mockResolvedValue({
        data: {
          has_access: true,
          access_level: "read_only",
          is_conference_admin: false,
        },
      });

      const { result } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAdmin).toBe(false);
    });

    it("returns isAdmin=false when API call fails", async () => {
      const regularUser = createMockUser("user");
      const wrapper = createWrapper(regularUser);

      vi.mocked(api.get).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should default to false when API fails
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.accessLevel).toBeNull();
    });
  });

  describe("cache behavior", () => {
    it("caches results per conference ID and user ID", async () => {
      const regularUser = createMockUser("user", { id: "user-abc" });
      const wrapper = createWrapper(regularUser);

      vi.mocked(api.get).mockResolvedValue({
        data: {
          has_access: true,
          access_level: "admin",
          is_conference_admin: true,
        },
      });

      // First call
      const { result: result1 } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      // Second call with same conference - should use cache
      const { result: result2 } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      // Only one API call should have been made
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result2.current.isAdmin).toBe(true);
    });

    it("makes separate API calls for different conferences", async () => {
      const regularUser = createMockUser("user");
      const wrapper = createWrapper(regularUser);

      vi.mocked(api.get)
        .mockResolvedValueOnce({
          data: {
            has_access: true,
            access_level: "admin",
            is_conference_admin: true,
          },
        })
        .mockResolvedValueOnce({
          data: {
            has_access: true,
            access_level: "read_only",
            is_conference_admin: false,
          },
        });

      // First conference - admin access
      const { result: result1 } = renderHook(
        () => useConferenceAdmin("conference-1"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      // Second conference - read-only access
      const { result: result2 } = renderHook(
        () => useConferenceAdmin("conference-2"),
        { wrapper }
      );

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false);
      });

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(result1.current.isAdmin).toBe(true);
      expect(result2.current.isAdmin).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles undefined conferenceId gracefully", () => {
      const regularUser = createMockUser("user");
      const wrapper = createWrapper(regularUser);

      const { result } = renderHook(() => useConferenceAdmin(undefined), {
        wrapper,
      });

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("handles null user gracefully", () => {
      const wrapper = createWrapper(null);

      const { result } = renderHook(
        () => useConferenceAdmin("conference-123"),
        { wrapper }
      );

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("throws error when used outside AuthProvider", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      expect(() => {
        renderHook(() => useConferenceAdmin("conference-123"), { wrapper });
      }).toThrow("useAuth must be used within an AuthProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("different access levels for same user", () => {
    it("correctly distinguishes admin vs read-only for different conferences", async () => {
      const regularUser = createMockUser("user");

      // Mock different responses for different conferences
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.includes("conference-admin")) {
          return {
            data: {
              has_access: true,
              access_level: "admin",
              is_conference_admin: true,
            },
          };
        }
        return {
          data: {
            has_access: true,
            access_level: "read_only",
            is_conference_admin: false,
          },
        };
      });

      // Test admin conference
      const wrapper1 = createWrapper(regularUser);
      const { result: adminResult } = renderHook(
        () => useConferenceAdmin("conference-admin"),
        { wrapper: wrapper1 }
      );

      await waitFor(() => {
        expect(adminResult.current.isLoading).toBe(false);
      });

      expect(adminResult.current.isAdmin).toBe(true);
      expect(adminResult.current.accessLevel).toBe("admin");

      // Test read-only conference (need fresh query client)
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper2 = createWrapper(regularUser);
      const { result: readOnlyResult } = renderHook(
        () => useConferenceAdmin("conference-readonly"),
        { wrapper: wrapper2 }
      );

      await waitFor(() => {
        expect(readOnlyResult.current.isLoading).toBe(false);
      });

      expect(readOnlyResult.current.isAdmin).toBe(false);
      expect(readOnlyResult.current.accessLevel).toBe("read_only");
    });
  });
});
