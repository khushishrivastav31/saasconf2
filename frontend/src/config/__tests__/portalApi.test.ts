import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

// Mock axios before importing the module
vi.mock("axios", () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
    defaults: {
      headers: {
        common: {},
      },
    },
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      post: vi.fn(),
    },
  };
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock window.location
const mockLocation = {
  href: "",
  pathname: "/company-slug/portal/dashboard",
};

Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

describe("portalApi.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockLocation.href = "";
    mockLocation.pathname = "/company-slug/portal/dashboard";
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("axios instance creation", () => {
    it("creates axios instance with correct base URL", async () => {
      await import("../portalApi");

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: expect.stringContaining("/api/v1"),
        headers: {
          "Content-Type": "application/json",
        },
      });
    });

    it("uses default URL when VITE_API_URL is not set", async () => {
      await import("../portalApi");

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: "http://localhost:8000/api/v1",
        headers: {
          "Content-Type": "application/json",
        },
      });
    });
  });

  describe("getCompanySlugFromUrl", () => {
    it("extracts company slug from portal URL", async () => {
      mockLocation.pathname = "/my-company/portal/dashboard";
      const { getCompanySlugFromUrl } = await import("../portalApi");

      const slug = getCompanySlugFromUrl();

      expect(slug).toBe("my-company");
    });

    it("extracts company slug from nested portal URL", async () => {
      mockLocation.pathname = "/acme-corp/portal/papers/123";
      const { getCompanySlugFromUrl } = await import("../portalApi");

      const slug = getCompanySlugFromUrl();

      expect(slug).toBe("acme-corp");
    });

    it("returns empty string for non-portal URLs", async () => {
      mockLocation.pathname = "/admin/dashboard";
      const { getCompanySlugFromUrl } = await import("../portalApi");

      const slug = getCompanySlugFromUrl();

      expect(slug).toBe("");
    });

    it("returns empty string for root URL", async () => {
      mockLocation.pathname = "/";
      const { getCompanySlugFromUrl } = await import("../portalApi");

      const slug = getCompanySlugFromUrl();

      expect(slug).toBe("");
    });

    it("returns empty string when portal is not second segment", async () => {
      mockLocation.pathname = "/company/other/portal";
      const { getCompanySlugFromUrl } = await import("../portalApi");

      const slug = getCompanySlugFromUrl();

      expect(slug).toBe("");
    });
  });

  describe("applicant token management functions", () => {
    it("setApplicantTokens stores both access and refresh tokens", async () => {
      const { setApplicantTokens } = await import("../portalApi");

      setApplicantTokens("test-access-token", "test-refresh-token");

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "applicant_access_token",
        "test-access-token"
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "applicant_refresh_token",
        "test-refresh-token"
      );
    });

    it("getApplicantAccessToken retrieves access token from localStorage", async () => {
      localStorageMock.setItem("applicant_access_token", "my-access-token");
      const { getApplicantAccessToken } = await import("../portalApi");

      const token = getApplicantAccessToken();

      expect(localStorageMock.getItem).toHaveBeenCalledWith(
        "applicant_access_token"
      );
      expect(token).toBe("my-access-token");
    });

    it("getApplicantAccessToken returns null when no token is stored", async () => {
      const { getApplicantAccessToken } = await import("../portalApi");

      const token = getApplicantAccessToken();

      expect(token).toBeNull();
    });

    it("getApplicantRefreshToken retrieves refresh token from localStorage", async () => {
      localStorageMock.setItem("applicant_refresh_token", "my-refresh-token");
      const { getApplicantRefreshToken } = await import("../portalApi");

      const token = getApplicantRefreshToken();

      expect(localStorageMock.getItem).toHaveBeenCalledWith(
        "applicant_refresh_token"
      );
      expect(token).toBe("my-refresh-token");
    });

    it("getApplicantRefreshToken returns null when no token is stored", async () => {
      const { getApplicantRefreshToken } = await import("../portalApi");

      const token = getApplicantRefreshToken();

      expect(token).toBeNull();
    });

    it("clearApplicantTokens removes both tokens from localStorage", async () => {
      localStorageMock.setItem("applicant_access_token", "access-token");
      localStorageMock.setItem("applicant_refresh_token", "refresh-token");
      const { clearApplicantTokens } = await import("../portalApi");

      clearApplicantTokens();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "applicant_access_token"
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "applicant_refresh_token"
      );
    });
  });

  describe("request interceptor", () => {
    it("registers a request interceptor", async () => {
      const { portalApi } = await import("../portalApi");

      expect(portalApi.interceptors.request.use).toHaveBeenCalled();
    });

    it("adds Authorization header when applicant token exists", async () => {
      localStorageMock.setItem("applicant_access_token", "applicant-token");
      const { portalApi } = await import("../portalApi");

      const requestInterceptor = vi.mocked(portalApi.interceptors.request.use)
        .mock.calls[0][0] as (config: {
        headers: Record<string, string>;
      }) => { headers: Record<string, string> };

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      expect(result.headers.Authorization).toBe("Bearer applicant-token");
    });

    it("does not add Authorization header when no token exists", async () => {
      const { portalApi } = await import("../portalApi");

      const requestInterceptor = vi.mocked(portalApi.interceptors.request.use)
        .mock.calls[0][0] as (config: {
        headers: Record<string, string>;
      }) => { headers: Record<string, string> };

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe("response interceptor", () => {
    it("registers a response interceptor", async () => {
      const { portalApi } = await import("../portalApi");

      expect(portalApi.interceptors.response.use).toHaveBeenCalled();
    });

    it("passes through successful responses", async () => {
      const { portalApi } = await import("../portalApi");

      const responseInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][0] as (response: unknown) => unknown;

      const mockResponse = { data: { success: true }, status: 200 };
      const result = responseInterceptor(mockResponse);

      expect(result).toEqual(mockResponse);
    });

    it("handles 401 error when no refresh token exists", async () => {
      mockLocation.pathname = "/company-slug/portal/dashboard";
      const { portalApi } = await import("../portalApi");

      const errorInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string; _retry?: boolean };
      }) => Promise<never>;

      const mockError = {
        response: { status: 401 },
        config: { url: "/some-endpoint", _retry: false },
      };

      localStorageMock.clear();

      await expect(errorInterceptor(mockError)).rejects.toEqual(mockError);
    });

    it("skips token refresh for portal auth endpoints", async () => {
      const { portalApi } = await import("../portalApi");

      const errorInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string; _retry?: boolean };
      }) => Promise<never>;

      // Test login endpoint
      const loginError = {
        response: { status: 401 },
        config: { url: "/portal/company-slug/login", _retry: false },
      };

      await expect(errorInterceptor(loginError)).rejects.toEqual(loginError);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it("skips token refresh for portal register endpoint", async () => {
      const { portalApi } = await import("../portalApi");

      const errorInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string; _retry?: boolean };
      }) => Promise<never>;

      const registerError = {
        response: { status: 401 },
        config: { url: "/portal/company-slug/register", _retry: false },
      };

      await expect(errorInterceptor(registerError)).rejects.toEqual(
        registerError
      );
      expect(axios.post).not.toHaveBeenCalled();
    });

    it("skips token refresh for portal verify-email endpoint", async () => {
      const { portalApi } = await import("../portalApi");

      const errorInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string; _retry?: boolean };
      }) => Promise<never>;

      const verifyError = {
        response: { status: 401 },
        config: { url: "/portal/company-slug/verify-email", _retry: false },
      };

      await expect(errorInterceptor(verifyError)).rejects.toEqual(verifyError);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it("attempts token refresh on 401 when refresh token and slug exist", async () => {
      mockLocation.pathname = "/company-slug/portal/dashboard";
      localStorageMock.setItem(
        "applicant_refresh_token",
        "valid-refresh-token"
      );

      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        },
      });

      const { portalApi } = await import("../portalApi");

      const mockAxiosInstance = vi.mocked(axios.create).mock.results[0]
        .value as {
        interceptors: { response: { use: ReturnType<typeof vi.fn> } };
      };

      const errorInterceptor = vi.mocked(
        mockAxiosInstance.interceptors.response.use
      ).mock.calls[0][1] as (error: {
        response?: { status: number };
        config: {
          url?: string;
          _retry?: boolean;
          headers: Record<string, string>;
        };
      }) => Promise<unknown>;

      const mockError = {
        response: { status: 401 },
        config: {
          url: "/some-protected-endpoint",
          _retry: false,
          headers: {} as Record<string, string>,
        },
      };

      try {
        await errorInterceptor(mockError);
      } catch {
        // Expected to potentially throw during test
      }

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/portal/company-slug/refresh"),
        { refresh_token: "valid-refresh-token" }
      );
    });

    it("clears tokens on refresh failure without redirect", async () => {
      mockLocation.pathname = "/company-slug/portal/dashboard";
      localStorageMock.setItem(
        "applicant_refresh_token",
        "expired-refresh-token"
      );

      vi.mocked(axios.post).mockRejectedValueOnce(new Error("Refresh failed"));

      const { portalApi } = await import("../portalApi");

      const errorInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][1] as (error: {
        response?: { status: number };
        config: {
          url?: string;
          _retry?: boolean;
          headers: Record<string, string>;
        };
      }) => Promise<never>;

      const mockError = {
        response: { status: 401 },
        config: {
          url: "/some-endpoint",
          _retry: false,
          headers: {} as Record<string, string>,
        },
      };

      await expect(errorInterceptor(mockError)).rejects.toThrow(
        "Refresh failed"
      );

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "applicant_access_token"
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "applicant_refresh_token"
      );
      // Portal API does not redirect, unlike main API
      expect(mockLocation.href).toBe("");
    });

    it("rejects non-401 errors without token refresh", async () => {
      const { portalApi } = await import("../portalApi");

      const errorInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string };
      }) => Promise<never>;

      const mockError = {
        response: { status: 500 },
        config: { url: "/some-endpoint" },
      };

      await expect(errorInterceptor(mockError)).rejects.toEqual(mockError);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it("handles 401 when no company slug can be extracted", async () => {
      mockLocation.pathname = "/admin/dashboard"; // Not a portal URL
      localStorageMock.setItem(
        "applicant_refresh_token",
        "valid-refresh-token"
      );

      const { portalApi } = await import("../portalApi");

      const errorInterceptor = vi.mocked(portalApi.interceptors.response.use)
        .mock.calls[0][1] as (error: {
        response?: { status: number };
        config: {
          url?: string;
          _retry?: boolean;
          headers: Record<string, string>;
        };
      }) => Promise<never>;

      const mockError = {
        response: { status: 401 },
        config: {
          url: "/some-endpoint",
          _retry: false,
          headers: {} as Record<string, string>,
        },
      };

      // Should reject without attempting refresh when slug is empty
      await expect(errorInterceptor(mockError)).rejects.toEqual(mockError);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "applicant_access_token"
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "applicant_refresh_token"
      );
    });
  });

  describe("default export", () => {
    it("exports the portalApi instance as default", async () => {
      const module = await import("../portalApi");

      expect(module.default).toBeDefined();
      expect(module.portalApi).toBeDefined();
      expect(module.default).toBe(module.portalApi);
    });
  });

  describe("different token keys than main API", () => {
    it("uses different localStorage keys than main API", async () => {
      const { setApplicantTokens } = await import("../portalApi");

      setApplicantTokens("applicant-access", "applicant-refresh");

      // Verify it uses applicant-specific keys
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "applicant_access_token",
        "applicant-access"
      );
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        "access_token",
        expect.anything()
      );
    });
  });
});
