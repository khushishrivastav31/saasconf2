import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { ThemeContext, ThemeProvider } from '../ThemeContext';

// Mock localStorage (Node.js 22 built-in conflicts with jsdom)
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
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
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();
Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true });

// Mock matchMedia
function createMockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches: prefersDark,
    addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
      listeners.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };

  const trigger = (matches: boolean) => {
    mql.matches = matches;
    listeners.forEach((l) => l({ matches }));
  };

  window.matchMedia = vi.fn().mockReturnValue(mql);
  return { mql, trigger };
}

// Helper component to read context values
function TestConsumer() {
  const ctx = useContext(ThemeContext);
  return (
    <div>
      <span data-testid="theme">{ctx?.theme}</span>
      <span data-testid="preference">{ctx?.preference ?? 'null'}</span>
      <button data-testid="toggle" onClick={() => ctx?.toggleTheme()}>
        Toggle
      </button>
      <button data-testid="set-dark" onClick={() => ctx?.setPreference('dark')}>
        Dark
      </button>
      <button data-testid="set-light" onClick={() => ctx?.setPreference('light')}>
        Light
      </button>
      <button data-testid="set-null" onClick={() => ctx?.setPreference(null)}>
        System
      </button>
      <button data-testid="sync-dark" onClick={() => ctx?.syncFromServer('dark')}>
        Sync Dark
      </button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('defaults to system theme (light) when no saved preference', () => {
      createMockMatchMedia(false);
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(screen.getByTestId('preference')).toHaveTextContent('null');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('defaults to system theme (dark) when OS prefers dark', () => {
      createMockMatchMedia(true);
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(screen.getByTestId('preference')).toHaveTextContent('null');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('reads saved preference from localStorage', () => {
      createMockMatchMedia(false);
      localStorage.setItem('theme-preference', 'dark');
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(screen.getByTestId('preference')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('ignores invalid localStorage values', () => {
      createMockMatchMedia(false);
      localStorage.setItem('theme-preference', 'blue');
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(screen.getByTestId('preference')).toHaveTextContent('null');
    });
  });

  describe('setPreference', () => {
    it('sets dark preference, updates class and localStorage', () => {
      createMockMatchMedia(false);
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('set-dark').click();
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(screen.getByTestId('preference')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('theme-preference')).toBe('dark');
    });

    it('sets light preference, removes dark class', () => {
      createMockMatchMedia(true);
      localStorage.setItem('theme-preference', 'dark');
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('set-light').click();
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('theme-preference')).toBe('light');
    });

    it('sets null preference, removes localStorage and follows system', () => {
      createMockMatchMedia(false);
      localStorage.setItem('theme-preference', 'dark');
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('set-null').click();
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(screen.getByTestId('preference')).toHaveTextContent('null');
      expect(localStorage.getItem('theme-preference')).toBeNull();
    });
  });

  describe('toggleTheme', () => {
    it('toggles from light to dark', () => {
      createMockMatchMedia(false);
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('toggle').click();
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(localStorage.getItem('theme-preference')).toBe('dark');
    });

    it('toggles from dark to light', () => {
      createMockMatchMedia(false);
      localStorage.setItem('theme-preference', 'dark');
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('toggle').click();
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(localStorage.getItem('theme-preference')).toBe('light');
    });
  });

  describe('syncFromServer', () => {
    it('syncs dark preference from server', () => {
      createMockMatchMedia(false);
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('sync-dark').click();
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(screen.getByTestId('preference')).toHaveTextContent('dark');
      expect(localStorage.getItem('theme-preference')).toBe('dark');
    });
  });

  describe('system theme changes', () => {
    it('follows OS change when preference is null', () => {
      const { trigger } = createMockMatchMedia(false);
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme')).toHaveTextContent('light');

      // Simulate OS switching to dark
      act(() => {
        trigger(true);
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('context not available', () => {
    it('returns null when used outside provider', () => {
      let contextValue: unknown = 'not-set';
      function Bare() {
        contextValue = useContext(ThemeContext);
        return null;
      }
      render(<Bare />);
      expect(contextValue).toBeNull();
    });
  });
});
