import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScreenOverlaysTab from '../ScreenOverlaysTab';

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

vi.mock('../../../../utils/richText', () => ({
  stripHtml: (html: string) => html.replace(/<[^>]*>/g, ''),
  sanitizeHtml: (html: string) => html,
}));

vi.mock('../../../../components/common/RichTextEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../../../../components/common/RichTextDisplay', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../../../../components/ConfirmDialog', () => ({
  default: ({
    open,
    title,
    onCancel,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

vi.mock('../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../icons', () => ({
  EyeIcon: () => <span>eye</span>,
  EditIcon: () => <span>edit</span>,
  DeleteIcon: () => <span>delete</span>,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const sampleOverlays = [
  {
    id: 'ov-1',
    tenant_id: 't-1',
    conference_id: 'conf-1',
    trigger_type: 'first_registration',
    title: 'Welcome Overlay',
    body_text: '<p>Hello!</p>',
    animation_style: 'confetti',
    duration_seconds: 5,
    is_active: true,
    schedule_date: null,
    display_order: 0,
    image_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ov-2',
    tenant_id: 't-1',
    conference_id: 'conf-1',
    trigger_type: 'always',
    title: 'Always Overlay',
    body_text: null,
    animation_style: 'fireworks',
    duration_seconds: 10,
    is_active: false,
    schedule_date: null,
    display_order: 1,
    image_url: null,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

const mockConference = {
  id: 'conf-1',
  tenant_id: 't-1',
  name: 'TestConf 2026',
  abbreviation: 'TC26',
  is_active: true,
};

describe('ScreenOverlaysTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no overlays exist', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('No screen overlays configured yet.')).toBeInTheDocument();
    });
  });

  it('shows "Add Overlay" button for admin', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('+ Add Overlay')).toBeInTheDocument();
    });
  });

  it('hides "Add Overlay" button for non-admin', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('No screen overlays configured yet.')).toBeInTheDocument();
    });

    expect(screen.queryByText('+ Add Overlay')).not.toBeInTheDocument();
  });

  it('renders overlay titles in table', async () => {
    mockGet.mockResolvedValue({
      data: { items: sampleOverlays, total: 2 },
    });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Welcome Overlay')).toBeInTheDocument();
    });

    expect(screen.getByText('Always Overlay')).toBeInTheDocument();
  });

  it('shows create form when clicking Add Overlay', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('+ Add Overlay')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Overlay'));

    expect(screen.getByText('New Screen Overlay')).toBeInTheDocument();
    expect(screen.getByText('Create Overlay')).toBeInTheDocument();
  });

  it('hides create form when clicking Cancel', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('+ Add Overlay')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Overlay'));
    expect(screen.getByText('New Screen Overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Screen Overlay')).not.toBeInTheDocument();
  });

  it('displays trigger type badges', async () => {
    mockGet.mockResolvedValue({
      data: { items: sampleOverlays, total: 2 },
    });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('first registration')).toBeInTheDocument();
    });

    expect(screen.getByText('always')).toBeInTheDocument();
  });

  it('displays animation style in table', async () => {
    mockGet.mockResolvedValue({
      data: { items: sampleOverlays, total: 2 },
    });

    render(<ScreenOverlaysTab conference={mockConference as never} isAdmin={true} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('confetti')).toBeInTheDocument();
    });

    expect(screen.getByText('fireworks')).toBeInTheDocument();
  });
});
