import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import axios from 'axios';

// Mock axios before importing the module
vi.mock('axios', () => {
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

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock window.location
const mockLocation = {
  href: '',
  pathname: '/',
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('api.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockLocation.href = '';
    // Reset module cache to ensure fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('axios instance creation', () => {
    it('creates axios instance with correct base URL', async () => {
      await import('../api');

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: expect.stringContaining('/api/v1'),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('uses default URL when VITE_API_URL is not set', async () => {
      await import('../api');

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8000/api/v1',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('token management functions', () => {
    it('setTokens stores both access and refresh tokens', async () => {
      const { setTokens } = await import('../api');

      setTokens('test-access-token', 'test-refresh-token');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', 'test-access-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refresh_token', 'test-refresh-token');
    });

    it('getAccessToken retrieves access token from localStorage', async () => {
      localStorageMock.setItem('access_token', 'my-access-token');
      const { getAccessToken } = await import('../api');

      const token = getAccessToken();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('access_token');
      expect(token).toBe('my-access-token');
    });

    it('getAccessToken returns null when no token is stored', async () => {
      const { getAccessToken } = await import('../api');

      const token = getAccessToken();

      expect(token).toBeNull();
    });

    it('getRefreshToken retrieves refresh token from localStorage', async () => {
      localStorageMock.setItem('refresh_token', 'my-refresh-token');
      const { getRefreshToken } = await import('../api');

      const token = getRefreshToken();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('refresh_token');
      expect(token).toBe('my-refresh-token');
    });

    it('getRefreshToken returns null when no token is stored', async () => {
      const { getRefreshToken } = await import('../api');

      const token = getRefreshToken();

      expect(token).toBeNull();
    });

    it('clearTokens removes both tokens from localStorage', async () => {
      localStorageMock.setItem('access_token', 'access-token');
      localStorageMock.setItem('refresh_token', 'refresh-token');
      const { clearTokens } = await import('../api');

      clearTokens();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
    });
  });

  describe('request interceptor', () => {
    it('registers a request interceptor', async () => {
      const { api } = await import('../api');

      expect(api.interceptors.request.use).toHaveBeenCalled();
    });

    it('adds Authorization header when token exists', async () => {
      localStorageMock.setItem('access_token', 'test-token');
      const { api } = await import('../api');

      // Get the request interceptor callback
      const requestInterceptor = vi.mocked(api.interceptors.request.use).mock
        .calls[0][0] as (config: { headers: Record<string, string> }) => {
        headers: Record<string, string>;
      };

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      expect(result.headers.Authorization).toBe('Bearer test-token');
    });

    it('does not add Authorization header when no token exists', async () => {
      const { api } = await import('../api');

      const requestInterceptor = vi.mocked(api.interceptors.request.use).mock
        .calls[0][0] as (config: { headers: Record<string, string> }) => {
        headers: Record<string, string>;
      };

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('response interceptor', () => {
    it('registers a response interceptor', async () => {
      const { api } = await import('../api');

      expect(api.interceptors.response.use).toHaveBeenCalled();
    });

    it('passes through successful responses', async () => {
      const { api } = await import('../api');

      const responseInterceptor = vi.mocked(api.interceptors.response.use).mock.calls[0][0] as (
        response: unknown
      ) => unknown;

      const mockResponse = { data: { success: true }, status: 200 };
      const result = responseInterceptor(mockResponse);

      expect(result).toEqual(mockResponse);
    });

    it('handles 401 error when no refresh token exists', async () => {
      const { api, clearTokens: _clearTokens } = await import('../api');

      const errorInterceptor = vi.mocked(api.interceptors.response.use).mock
        .calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string; _retry?: boolean };
      }) => Promise<never>;

      const mockError = {
        response: { status: 401 },
        config: { url: '/some-endpoint', _retry: false },
      };

      // Ensure no refresh token is stored
      localStorageMock.clear();

      await expect(errorInterceptor(mockError)).rejects.toEqual(mockError);
      expect(mockLocation.href).toBe('/login');
    });

    it('skips token refresh for auth endpoints', async () => {
      const { api } = await import('../api');

      const errorInterceptor = vi.mocked(api.interceptors.response.use).mock
        .calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string; _retry?: boolean };
      }) => Promise<never>;

      const mockError = {
        response: { status: 401 },
        config: { url: '/auth/login', _retry: false },
      };

      await expect(errorInterceptor(mockError)).rejects.toEqual(mockError);

      // Should not redirect for auth endpoints
      expect(mockLocation.href).toBe('');
    });

    it('attempts token refresh on 401 when refresh token exists', async () => {
      localStorageMock.setItem('refresh_token', 'valid-refresh-token');

      (axios.post as Mock).mockResolvedValueOnce({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        },
      });

      const { api: _api } = await import('../api');

      const mockAxiosInstance = vi.mocked(axios.create).mock.results[0].value as {
        interceptors: { response: { use: ReturnType<typeof vi.fn> } };
      };

      // Get the error interceptor
      const errorInterceptor = vi.mocked(mockAxiosInstance.interceptors.response.use).mock
        .calls[0][1] as (error: {
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
          url: '/some-protected-endpoint',
          _retry: false,
          headers: {} as Record<string, string>,
        },
      };

      // The interceptor should attempt to refresh and retry
      try {
        await errorInterceptor(mockError);
      } catch {
        // Expected to potentially throw during test
      }

      // Verify refresh was attempted
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/v1/auth/refresh'), {
        refresh_token: 'valid-refresh-token',
      });
    });

    it('clears tokens and redirects on refresh failure', async () => {
      localStorageMock.setItem('refresh_token', 'expired-refresh-token');

      (axios.post as Mock).mockRejectedValueOnce(new Error('Refresh failed'));

      const { api } = await import('../api');

      const errorInterceptor = vi.mocked(api.interceptors.response.use).mock
        .calls[0][1] as (error: {
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
          url: '/some-endpoint',
          _retry: false,
          headers: {} as Record<string, string>,
        },
      };

      await expect(errorInterceptor(mockError)).rejects.toThrow('Refresh failed');

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
      expect(mockLocation.href).toBe('/login');
    });

    it('rejects non-401 errors without token refresh', async () => {
      const { api } = await import('../api');

      const errorInterceptor = vi.mocked(api.interceptors.response.use).mock
        .calls[0][1] as (error: {
        response?: { status: number };
        config: { url?: string };
      }) => Promise<never>;

      const mockError = {
        response: { status: 500 },
        config: { url: '/some-endpoint' },
      };

      await expect(errorInterceptor(mockError)).rejects.toEqual(mockError);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('default export', () => {
    it('exports the api instance as default', async () => {
      const module = await import('../api');

      expect(module.default).toBeDefined();
      expect(module.api).toBeDefined();
      expect(module.default).toBe(module.api);
    });
  });
});
