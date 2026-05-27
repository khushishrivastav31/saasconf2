import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewsTab from '../NewsTab';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../components/common/RichTextEditor', () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));

vi.mock('../../../../components/common/RichTextDisplay', () => ({
  default: () => <div data-testid="rich-text-display" />,
}));

vi.mock('../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock('../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../components/OverlaySelector', () => ({
  default: () => <div data-testid="overlay-selector" />,
}));

vi.mock('../SendNewsModal', () => ({
  default: () => <div data-testid="send-news-modal" />,
}));

vi.mock('../../../../components/ConfirmDialog', () => ({
  default: ({
    open,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const publishedArticle = {
  id: 'art-1',
  title: 'Big Announcement',
  body_html: '<p>Hello</p>',
  is_published: true,
  published_at: '2026-01-01T10:00:00Z',
  created_at: '2026-01-01T09:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  created_by: 'user-1',
  screen_overlay_id: null,
};

const listResponse = { items: [publishedArticle], total: 1 };
const emptyListResponse = { items: [], total: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderTab(isAdmin = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NewsTab conference={{ id: 'conf-1', name: 'TestConf' }} isAdmin={isAdmin} />
    </QueryClientProvider>
  );
}

// ── Phase 3: Unpublish confirmation modal copy ────────────────────────────────

describe('NewsTab — unpublish modal copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: listResponse });
  });

  it('unpublish confirmation contains "removed from the portal feed"', async () => {
    renderTab();
    const unpublishBtn = await screen.findByRole('button', { name: /unpublish/i });
    fireEvent.click(unpublishBtn);
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog.textContent).toMatch(/removed from the portal feed/i);
  });

  it('unpublish confirmation mentions the 30-second window', async () => {
    renderTab();
    const unpublishBtn = await screen.findByRole('button', { name: /unpublish/i });
    fireEvent.click(unpublishBtn);
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog.textContent).toMatch(/30 seconds/i);
  });
});

// ── Phase 2: Portal news staleTime documented ─────────────────────────────────

describe('NewsTab — admin news list loads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: emptyListResponse });
  });

  it('renders the News Articles section heading', async () => {
    renderTab();
    expect(await screen.findByText('News Articles')).toBeTruthy();
  });
});
