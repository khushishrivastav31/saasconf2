import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/Toast';
import { CHUNK_RELOAD_FLAG } from './components/common/ErrorBoundary';
import './index.css';

// Boot reached this line, so the current bundle is loading cleanly.
// Clear the one-shot chunk-reload guard so a future post-deploy stale
// chunk can trigger an auto-reload again.
try {
  sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
} catch {
  // sessionStorage may be unavailable in privacy mode / iframes; ignore.
}

// Initialize Sentry (no-ops when DSN is empty)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) || 'development',
    release: `saasconf-frontend@${import.meta.env.VITE_APP_VERSION || '0.1.0'}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
