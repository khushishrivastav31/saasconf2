import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import * as Sentry from '@sentry/react';

// Matches the error.message strings emitted when a dynamic ``import()``
// can't fetch its chunk — typically because a deploy invalidated the
// content-hashed asset filename our index.html points at.
// Chrome / Safari emit the first form; Firefox emits the second; the
// last two cover historical bundler output.
const CHUNK_LOAD_PATTERNS: readonly RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
];

export function isChunkLoadError(error: Error): boolean {
  return CHUNK_LOAD_PATTERNS.some((re) => re.test(error.message));
}

// One-shot guard. Stored in sessionStorage so a refresh clears it; a
// failed reload after we already tried once falls through to the normal
// error UI instead of looping.
export const CHUNK_RELOAD_FLAG = 'saasconf:chunk-reload';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });

    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
          sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // sessionStorage can throw in privacy mode / iframes — fall
        // through to the normal error UI rather than crashing.
      }
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md">
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
