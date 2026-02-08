import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext, AuthProvider } from "../AuthContext";
import { useContext } from "react";

// Mock the api module
vi.mock("../../config/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(),
}));

// Import mocked functions
import api, { setTokens, clearTokens, getAccessToken } from "../../config/api";

// Helper to create wrapped provider with QueryClient
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  // Spy on the clear method
  const clearSpy = vi.spyOn(queryClient, "clear");

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  return { Wrapper, queryClient, clearSpy };
}

// Helper component to access context values
function TestConsumer({
  onMount,
}: {
  onMount?: (context: ReturnType<typeof useContext<typeof AuthContext>>) => void;
}) {
  const context = useContext(AuthContext);
  if (onMount) {
    onMount(context);
  }
  return (
    <div>
      <span data-testid="user">{context?.user ? context.user.email : "null"}</span>
      <span data-testid="loading">{context?.isLoading ? "true" : "false"}</span>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("initial state", () => {
    it("sets user to null and isLoading to false when no token exists", async () => {
      vi.mocked(getAccessToken).mockReturnValue(null);
      const { Wrapper } = createTestWrapper();

      render(
        <Wrapper>
          <TestConsumer />
        </Wrapper>,
      );

      // Wait for initialization to complete
      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      expect(screen.getByTestId("user")).toHaveTextContent("null");
      // Should not attempt to fetch user when no token
      expect(api.get).not.toHaveBeenCalled();
    });

    it("starts with isLoading true and fetches user when token exists", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        first_name: "Test",
        last_name: "User",
        pronouns: null,
        role: "user" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: ["cfp"],
        is_active: true,
        last_login: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue("valid-token");
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });
      const { Wrapper } = createTestWrapper();

      render(
        <Wrapper>
          <TestConsumer />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      expect(screen.getByTestId("user")).toHaveTextContent("test@example.com");
      expect(api.get).toHaveBeenCalledWith("/auth/me");
    });
  });

  describe("login function", () => {
    it("authenticates user and fetches user data on successful login", async () => {
      const mockTokenResponse = {
        access_token: "access-token-123",
        refresh_token: "refresh-token-123",
        token_type: "bearer",
        expires_in: 3600,
      };

      const mockUser = {
        id: "user-123",
        email: "logged-in@example.com",
        first_name: "Logged",
        last_name: "In",
        pronouns: null,
        role: "tenant_admin" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: ["cfp", "volunteers"],
        is_active: true,
        last_login: "2024-01-01T00:00:00Z",
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue(null);
      vi.mocked(api.post).mockResolvedValue({ data: mockTokenResponse });
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });
      const { Wrapper } = createTestWrapper();

      let loginFn: ((credentials: { email: string; password: string }) => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              loginFn = context?.login;
              return (
                <div>
                  <span data-testid="user">
                    {context?.user ? context.user.email : "null"}
                  </span>
                  <span data-testid="loading">
                    {context?.isLoading ? "true" : "false"}
                  </span>
                </div>
              );
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      // Perform login
      await act(async () => {
        await loginFn?.({ email: "test@example.com", password: "password123" });
      });

      expect(api.post).toHaveBeenCalledWith("/auth/login", {
        email: "test@example.com",
        password: "password123",
      });

      expect(setTokens).toHaveBeenCalledWith("access-token-123", "refresh-token-123");
      expect(api.get).toHaveBeenCalledWith("/auth/me");

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("logged-in@example.com");
      });
    });

    it("throws error on login failure", async () => {
      vi.mocked(getAccessToken).mockReturnValue(null);
      vi.mocked(api.post).mockRejectedValue(new Error("Invalid credentials"));
      const { Wrapper } = createTestWrapper();

      let loginFn: ((credentials: { email: string; password: string }) => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              loginFn = context?.login;
              return <div data-testid="loading">{context?.isLoading ? "true" : "false"}</div>;
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      await expect(
        act(async () => {
          await loginFn?.({ email: "test@example.com", password: "wrong" });
        }),
      ).rejects.toThrow("Invalid credentials");

      expect(setTokens).not.toHaveBeenCalled();
    });
  });

  describe("logout function", () => {
    it("clears user and tokens on logout", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        first_name: "Test",
        last_name: "User",
        pronouns: null,
        role: "user" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: [],
        is_active: true,
        last_login: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue("valid-token");
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });
      vi.mocked(api.post).mockResolvedValue({});
      const { Wrapper } = createTestWrapper();

      let logoutFn: (() => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              logoutFn = context?.logout;
              return (
                <div>
                  <span data-testid="user">
                    {context?.user ? context.user.email : "null"}
                  </span>
                  <span data-testid="loading">
                    {context?.isLoading ? "true" : "false"}
                  </span>
                </div>
              );
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      // Wait for user to be loaded
      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("test@example.com");
      });

      // Perform logout
      await act(async () => {
        await logoutFn?.();
      });

      expect(api.post).toHaveBeenCalledWith("/auth/logout");
      expect(clearTokens).toHaveBeenCalled();
      expect(screen.getByTestId("user")).toHaveTextContent("null");
    });

    it("clears tokens and user even when logout API call fails", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        first_name: "Test",
        last_name: "User",
        pronouns: null,
        role: "user" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: [],
        is_active: true,
        last_login: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue("valid-token");
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });
      // Set up post to fail from the beginning
      vi.mocked(api.post).mockRejectedValue(new Error("Network error"));
      const { Wrapper } = createTestWrapper();

      let logoutFn: (() => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              logoutFn = context?.logout;
              return (
                <div>
                  <span data-testid="user">
                    {context?.user ? context.user.email : "null"}
                  </span>
                </div>
              );
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("test@example.com");
      });

      // Perform logout - error will be thrown but cleanup still happens via finally
      // We need to catch the error inside act to prevent it from failing the test
      await act(async () => {
        try {
          await logoutFn?.();
        } catch {
          // Expected - the error propagates after finally block runs
        }
      });

      // Despite the error, cleanup still happens in the finally block
      expect(clearTokens).toHaveBeenCalled();
      expect(screen.getByTestId("user")).toHaveTextContent("null");
    });
  });

  describe("user fetch on mount with existing token", () => {
    it("fetches user data when token exists on mount", async () => {
      const mockUser = {
        id: "user-123",
        email: "existing@example.com",
        first_name: "Existing",
        last_name: "User",
        pronouns: "they/them",
        role: "super_admin" as const,
        tenant_id: null,
        tenant_name: null,
        modules: ["cfp", "volunteers", "locations"],
        is_active: true,
        last_login: "2024-01-15T10:30:00Z",
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue("existing-token");
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });
      const { Wrapper } = createTestWrapper();

      render(
        <Wrapper>
          <TestConsumer />
        </Wrapper>,
      );

      expect(screen.getByTestId("loading")).toHaveTextContent("true");

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      expect(screen.getByTestId("user")).toHaveTextContent("existing@example.com");
      expect(api.get).toHaveBeenCalledWith("/auth/me");
    });

    it("clears tokens when user fetch fails with existing token", async () => {
      vi.mocked(getAccessToken).mockReturnValue("invalid-token");
      vi.mocked(api.get).mockRejectedValue(new Error("Unauthorized"));
      const { Wrapper } = createTestWrapper();

      render(
        <Wrapper>
          <TestConsumer />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      expect(clearTokens).toHaveBeenCalled();
      expect(screen.getByTestId("user")).toHaveTextContent("null");
    });

    it("does not fetch user when no token exists", async () => {
      vi.mocked(getAccessToken).mockReturnValue(null);
      const { Wrapper } = createTestWrapper();

      render(
        <Wrapper>
          <TestConsumer />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      expect(api.get).not.toHaveBeenCalled();
      expect(screen.getByTestId("user")).toHaveTextContent("null");
    });
  });

  describe("refreshUser function", () => {
    it("refreshes user data when called", async () => {
      const initialUser = {
        id: "user-123",
        email: "initial@example.com",
        first_name: "Initial",
        last_name: "User",
        pronouns: null,
        role: "user" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: [],
        is_active: true,
        last_login: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      const updatedUser = {
        ...initialUser,
        email: "updated@example.com",
        first_name: "Updated",
      };

      vi.mocked(getAccessToken).mockReturnValue("valid-token");
      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: initialUser })
        .mockResolvedValueOnce({ data: updatedUser });
      const { Wrapper } = createTestWrapper();

      let refreshUserFn: (() => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              refreshUserFn = context?.refreshUser;
              return (
                <div>
                  <span data-testid="user">
                    {context?.user ? context.user.email : "null"}
                  </span>
                  <span data-testid="loading">
                    {context?.isLoading ? "true" : "false"}
                  </span>
                </div>
              );
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("initial@example.com");
      });

      // Refresh user
      await act(async () => {
        await refreshUserFn?.();
      });

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("user")).toHaveTextContent("updated@example.com");
    });
  });

  describe("context value", () => {
    it("provides all expected context values", async () => {
      vi.mocked(getAccessToken).mockReturnValue(null);
      const { Wrapper } = createTestWrapper();

      let contextValue: ReturnType<typeof useContext<typeof AuthContext>> = null;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              contextValue = context;
              return <div data-testid="loading">{context?.isLoading ? "true" : "false"}</div>;
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      expect(contextValue).not.toBeNull();
      expect(contextValue).toHaveProperty("user");
      expect(contextValue).toHaveProperty("isLoading");
      expect(contextValue).toHaveProperty("login");
      expect(contextValue).toHaveProperty("logout");
      expect(contextValue).toHaveProperty("refreshUser");
      expect(typeof contextValue?.login).toBe("function");
      expect(typeof contextValue?.logout).toBe("function");
      expect(typeof contextValue?.refreshUser).toBe("function");
    });
  });

  describe("query cache clearing", () => {
    it("clears query cache on login to prevent stale data from previous sessions", async () => {
      const mockTokenResponse = {
        access_token: "access-token-123",
        refresh_token: "refresh-token-123",
        token_type: "bearer",
        expires_in: 3600,
      };

      const mockUser = {
        id: "user-123",
        email: "new-user@example.com",
        first_name: "New",
        last_name: "User",
        pronouns: null,
        role: "user" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: ["cfp"],
        is_active: true,
        last_login: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue(null);
      vi.mocked(api.post).mockResolvedValue({ data: mockTokenResponse });
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });

      const { Wrapper, clearSpy } = createTestWrapper();
      let loginFn: ((credentials: { email: string; password: string }) => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              loginFn = context?.login;
              return <div data-testid="loading">{context?.isLoading ? "true" : "false"}</div>;
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("false");
      });

      // Perform login
      await act(async () => {
        await loginFn?.({ email: "new-user@example.com", password: "password123" });
      });

      // Verify query cache was cleared before login to ensure no stale data
      expect(clearSpy).toHaveBeenCalled();
    });

    it("clears query cache on logout to prevent data leakage between users", async () => {
      const mockUser = {
        id: "user-123",
        email: "current-user@example.com",
        first_name: "Current",
        last_name: "User",
        pronouns: null,
        role: "user" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: [],
        is_active: true,
        last_login: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue("valid-token");
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });
      vi.mocked(api.post).mockResolvedValue({});

      const { Wrapper, clearSpy } = createTestWrapper();
      let logoutFn: (() => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              logoutFn = context?.logout;
              return (
                <div>
                  <span data-testid="user">{context?.user ? context.user.email : "null"}</span>
                </div>
              );
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("current-user@example.com");
      });

      // Perform logout
      await act(async () => {
        await logoutFn?.();
      });

      // Verify query cache was cleared to prevent stale data when next user logs in
      expect(clearSpy).toHaveBeenCalled();
      expect(screen.getByTestId("user")).toHaveTextContent("null");
    });

    it("clears query cache on logout even when API call fails", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        first_name: "Test",
        last_name: "User",
        pronouns: null,
        role: "user" as const,
        tenant_id: "tenant-123",
        tenant_name: "Test Tenant",
        modules: [],
        is_active: true,
        last_login: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      vi.mocked(getAccessToken).mockReturnValue("valid-token");
      vi.mocked(api.get).mockResolvedValue({ data: mockUser });
      vi.mocked(api.post).mockRejectedValue(new Error("Network error"));

      const { Wrapper, clearSpy } = createTestWrapper();
      let logoutFn: (() => Promise<void>) | undefined;

      render(
        <Wrapper>
          <AuthContext.Consumer>
            {(context) => {
              logoutFn = context?.logout;
              return <div data-testid="user">{context?.user ? context.user.email : "null"}</div>;
            }}
          </AuthContext.Consumer>
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("test@example.com");
      });

      // Logout with API failure - cache should still be cleared via finally block
      await act(async () => {
        try {
          await logoutFn?.();
        } catch {
          // Expected error
        }
      });

      // Cache should still be cleared even when logout API fails
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
