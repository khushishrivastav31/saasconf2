import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PendingVerificationsTab from '../PendingVerificationsTab';
import type { Conference } from '../../../../../types';

const mockShowToast = vi.fn();
vi.mock('../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../../../../config/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    defaults: { baseURL: 'http://test' },
  },
}));

vi.mock('../../../../../utils/apiError', () => ({
  parseApiError: (_err: unknown, fallback: string) => fallback,
}));

vi.mock('../../../../../components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../../../../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

const mockConference = { id: 'conf-1', name: 'TestConf 2026' } as Conference;

const APPLICANTS = [
  {
    id: 'app-1',
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@example.com',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'app-2',
    first_name: 'Bob',
    last_name: 'Jones',
    email: 'bob@example.com',
    created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('PendingVerificationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PendingVerificationsTab conference={mockConference} isAdmin={true} />
      </Wrapper>
    );
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders the list of pending applicants', async () => {
    mockGet.mockResolvedValue({ data: { items: APPLICANTS, total: 2 } });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PendingVerificationsTab conference={mockConference} isAdmin={true} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows empty state when no pending applicants', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PendingVerificationsTab conference={mockConference} isAdmin={true} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/all applicants have verified/i)).toBeInTheDocument();
    });
  });

  it('clicking Resend calls the API and shows success toast', async () => {
    mockGet.mockResolvedValue({ data: { items: [APPLICANTS[0]], total: 1 } });
    mockPost.mockResolvedValue({ data: { message: 'Verification email resent.' } });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PendingVerificationsTab conference={mockConference} isAdmin={true} />
      </Wrapper>
    );

    await waitFor(() => screen.getByText('Alice Smith'));
    // "Resend All (N)" is also present; pick the row-level button which has no "all"
    const buttons = screen.getAllByRole('button', { name: /resend/i });
    const rowResend = buttons.find((b) => !/all/i.test(b.textContent ?? ''))!;
    fireEvent.click(rowResend);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/cfp/pending-verifications/app-1/resend');
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('alice@example.com'),
        'success'
      );
    });
  });

  it('shows error toast when resend API call fails', async () => {
    mockGet.mockResolvedValue({ data: { items: [APPLICANTS[0]], total: 1 } });
    mockPost.mockRejectedValue(new Error('Network error'));

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PendingVerificationsTab conference={mockConference} isAdmin={true} />
      </Wrapper>
    );

    await waitFor(() => screen.getByText('Alice Smith'));
    const buttons = screen.getAllByRole('button', { name: /resend/i });
    const rowResend = buttons.find((b) => !/all/i.test(b.textContent ?? ''))!;
    fireEvent.click(rowResend);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resend'),
        'error'
      );
    });
  });

  it('clicking Resend All calls the bulk endpoint', async () => {
    mockGet.mockResolvedValue({ data: { items: APPLICANTS, total: 2 } });
    mockPost.mockResolvedValue({ data: { sent: 2, failed: 0 } });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PendingVerificationsTab conference={mockConference} isAdmin={true} />
      </Wrapper>
    );

    await waitFor(() => screen.getByText(/resend all/i));
    fireEvent.click(screen.getByRole('button', { name: /resend all/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/cfp/pending-verifications/resend-all');
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('2 succeeded'), 'success');
    });
  });

  it('hides action buttons when isAdmin is false', async () => {
    mockGet.mockResolvedValue({ data: { items: APPLICANTS, total: 2 } });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PendingVerificationsTab conference={mockConference} isAdmin={false} />
      </Wrapper>
    );

    await waitFor(() => screen.getByText('Alice Smith'));
    expect(screen.queryAllByRole('button', { name: /resend/i })).toHaveLength(0);
  });
});
