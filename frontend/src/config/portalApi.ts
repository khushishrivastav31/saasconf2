import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Extract the company slug from the current URL pathname.
 * Expects URLs of the form `/:companySlug/portal/...`.
 */
export function getCompanySlugFromUrl(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[1] === 'portal') {
    return parts[0];
  }
  return '';
}

export const portalApi = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const TOKEN_KEY = 'applicant_access_token';
const REFRESH_TOKEN_KEY = 'applicant_refresh_token';

export const getApplicantAccessToken = () => localStorage.getItem(TOKEN_KEY);
export const getApplicantRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

export const setApplicantTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearApplicantTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// Request interceptor
portalApi.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getApplicantAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

portalApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only skip token refresh for actual auth endpoints (user account management),
    // not conference registration endpoints like /portal/conferences/{id}/register
    const url = originalRequest.url || '';
    const isAuthEndpoint =
      url.includes('/portal/') &&
      (url.includes('/login') ||
        url.includes('/user/register') ||
        url.includes('/refresh') ||
        url.includes('/verify-email'));

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return portalApi(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getApplicantRefreshToken();

      const slug = getCompanySlugFromUrl();
      if (!refreshToken || !slug) {
        clearApplicantTokens();
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_URL}/api/v1/portal/${slug}/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefreshToken } = response.data;
        setApplicantTokens(access_token, newRefreshToken);

        processQueue(null, access_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return portalApi(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearApplicantTokens();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default portalApi;
