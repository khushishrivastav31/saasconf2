/**
 * Public API Client
 *
 * Separate Axios instance for public endpoints (no authentication required).
 * Used by public registration portal.
 */
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const publicApi = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for logging (dev only)
if (import.meta.env.DEV) {
  publicApi.interceptors.request.use(
    (config) => {
      return config;
    },
    (error) => {
      console.error('[Public API Request Error]', error);
      return Promise.reject(error);
    }
  );
}

// Add response interceptor for error handling
publicApi.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log errors in development
    if (import.meta.env.DEV) {
      console.error('[Public API Response Error]', {
        url: error.config?.url,
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // Return formatted error
    const message = error.response?.data?.detail || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

export default publicApi;
