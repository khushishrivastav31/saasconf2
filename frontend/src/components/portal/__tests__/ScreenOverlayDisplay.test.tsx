import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScreenOverlayDisplay from '../ScreenOverlayDisplay';

// Mock portalApi
const mockGet = vi.fn();
vi.mock('../../../config/portalApi', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    defaults: { baseURL: 'http://test-api' },
  },
}));

// Mock richText utilities
vi.mock('../../../utils/richText', () => ({
  sanitizeHtml: (html: string) => html,
}));

// Mock sessionStorage and localStorage
const sessionStorageMock: Record<string, string> = {};
const localStorageMock: Record<string, string> = {};

const originalSessionStorage = globalThis.sessionStorage;
const originalLocalStorage = globalThis.localStorage;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const sampleOverlay = {
  id: 'overlay-1',
  conference_id: 'conf-1',
  conference_name: 'TestConf 2026',
  trigger_type: 'always' as const,
  title: 'Welcome!',
  body_text: '<p>Hello world</p>',
  animation_style: 'confetti' as const,
  duration_seconds: 10,
  image_url: null,
  source: 'standalone',
};

describe('ScreenOverlayDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock storage
    Object.keys(sessionStorageMock).forEach((k) => delete sessionStorageMock[k]);
    Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);

    // Mock sessionStorage
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: (key: string) => sessionStorageMock[key] ?? null,
        setItem: (key: string, value: string) => {
          sessionStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete sessionStorageMock[key];
        },
        clear: () => Object.keys(sessionStorageMock).forEach((k) => delete sessionStorageMock[k]),
      },
      writable: true,
      configurable: true,
    });

    // Mock localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] ?? null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageMock[key];
        },
        clear: () => Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]),
      },
      writable: true,
      configurable: true,
    });
  });

  // Restore original storage after all tests
  afterAll(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: originalSessionStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('renders nothing when just_logged_in is not set', () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    const { container } = render(<ScreenOverlayDisplay />, { wrapper });
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when API returns empty items', async () => {
    sessionStorageMock['just_logged_in'] = 'true';
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    const { container } = render(<ScreenOverlayDisplay />, { wrapper });

    // Wait for query to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders overlay body text when data arrives', async () => {
    sessionStorageMock['just_logged_in'] = 'true';
    mockGet.mockResolvedValue({
      data: { items: [sampleOverlay], total: 1 },
    });

    render(<ScreenOverlayDisplay />, { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Body text is rendered via dangerouslySetInnerHTML
    expect(document.body.textContent).toContain('Hello world');
  });

  it('renders image when image_url is set', async () => {
    sessionStorageMock['just_logged_in'] = 'true';
    const overlayWithImage = {
      ...sampleOverlay,
      image_url: '/conferences/1/screen-overlays/1/image',
    };
    mockGet.mockResolvedValue({
      data: { items: [overlayWithImage], total: 1 },
    });

    render(<ScreenOverlayDisplay />, { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.src).toContain('image');
  });

  it('dismisses on backdrop click', async () => {
    sessionStorageMock['just_logged_in'] = 'true';
    mockGet.mockResolvedValue({
      data: { items: [sampleOverlay], total: 1 },
    });
    const user = userEvent.setup();

    render(<ScreenOverlayDisplay />, { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Click the backdrop (the fixed overlay container)
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) {
      await user.click(backdrop);
    }

    // After fade-out, overlay should be removed
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  it('marks first_registration as seen in localStorage on dismiss', async () => {
    sessionStorageMock['just_logged_in'] = 'true';
    const firstRegOverlay = {
      ...sampleOverlay,
      trigger_type: 'first_registration' as const,
      source: 'standalone',
    };
    mockGet.mockResolvedValue({
      data: { items: [firstRegOverlay], total: 1 },
    });
    const user = userEvent.setup();

    render(<ScreenOverlayDisplay />, { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Click close button
    const closeBtn = document.querySelector('button');
    if (closeBtn) {
      await user.click(closeBtn);
    }

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(localStorageMock['overlay_seen_overlay-1']).toBe('true');
  });

  it('does not persist always trigger to localStorage', async () => {
    sessionStorageMock['just_logged_in'] = 'true';
    mockGet.mockResolvedValue({
      data: { items: [sampleOverlay], total: 1 },
    });
    const user = userEvent.setup();

    render(<ScreenOverlayDisplay />, { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    const closeBtn = document.querySelector('button');
    if (closeBtn) {
      await user.click(closeBtn);
    }

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(localStorageMock['overlay_seen_overlay-1']).toBeUndefined();
  });

  it('shows progress bar', async () => {
    sessionStorageMock['just_logged_in'] = 'true';
    mockGet.mockResolvedValue({
      data: { items: [sampleOverlay], total: 1 },
    });

    render(<ScreenOverlayDisplay />, { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    const progressBar = document.querySelector('.bg-primary-500');
    expect(progressBar).toBeTruthy();
  });
});
