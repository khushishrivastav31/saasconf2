import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from '../ThemeToggle';
import { ThemeProvider } from '../../contexts/ThemeContext';

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
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersDark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders moon icon in light mode', () => {
    createMockMatchMedia(false);
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(button).toHaveAttribute('title', 'Switch to dark mode');
  });

  it('renders sun icon in dark mode', () => {
    createMockMatchMedia(false);
    localStorage.setItem('theme-preference', 'dark');
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Switch to light mode');
    expect(button).toHaveAttribute('title', 'Switch to light mode');
  });

  it('toggles from light to dark on click', () => {
    createMockMatchMedia(false);
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-label', 'Switch to light mode');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles from dark to light on click', () => {
    createMockMatchMedia(false);
    localStorage.setItem('theme-preference', 'dark');
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('calls onPersist callback with new theme on click', () => {
    createMockMatchMedia(false);
    const onPersist = vi.fn();
    renderWithTheme(<ThemeToggle onPersist={onPersist} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onPersist).toHaveBeenCalledWith('dark');
  });

  it("calls onPersist with 'light' when toggling from dark", () => {
    createMockMatchMedia(false);
    localStorage.setItem('theme-preference', 'dark');
    const onPersist = vi.fn();
    renderWithTheme(<ThemeToggle onPersist={onPersist} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onPersist).toHaveBeenCalledWith('light');
  });

  it('does not call onPersist if not provided', () => {
    createMockMatchMedia(false);
    // No onPersist prop — should not throw
    renderWithTheme(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    // If we get here, no error was thrown
    expect(true).toBe(true);
  });
});
