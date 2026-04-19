import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PrivacyRequestsTab from '../PrivacyRequestsTab';

vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../components/Modal', () => ({
  default: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

import api from '../../../config/api';

const mockApi = vi.mocked(api);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const sampleListItem = {
  id: 'pr-1',
  tenant_id: 'tenant-a',
  request_type: 'export' as const,
  subject_count: 1,
  status: 'pending_review' as const,
  created_by: 'user-1',
  created_at: '2026-04-01T10:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  executed_at: null,
};

const sampleDetail = {
  id: 'pr-1',
  tenant_id: 'tenant-a',
  request_type: 'export' as const,
  subject_emails: ['alice@example.com'],
  status: 'pending_review' as const,
  created_by: 'user-1',
  portal_user_id: null,
  created_at: '2026-04-01T10:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  executed_at: null,
  completion_artifact_url: null,
  execution_manifest: null,
  rejection_reason: null,
  notes: 'Received by email',
};

describe('PrivacyRequestsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the filter bar and new request button', async () => {
    mockApi.get.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 50, pages: 0 },
    });
    renderWithProviders(<PrivacyRequestsTab />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/privacy-requests', expect.any(Object));
    });
    expect(screen.getByRole('button', { name: 'New request' })).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Request type')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject email')).toBeInTheDocument();
  });

  it('shows empty state when no requests exist', async () => {
    mockApi.get.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 50, pages: 0 },
    });
    renderWithProviders(<PrivacyRequestsTab />);
    await waitFor(() => {
      expect(screen.getByText(/No privacy requests yet/)).toBeInTheDocument();
    });
  });

  it('renders privacy requests returned from the API', async () => {
    mockApi.get.mockResolvedValue({
      data: { items: [sampleListItem], total: 1, page: 1, page_size: 50, pages: 1 },
    });
    renderWithProviders(<PrivacyRequestsTab />);
    await waitFor(() => {
      expect(screen.getByText('pending review')).toBeInTheDocument();
    });
    expect(screen.getByText('export')).toBeInTheDocument();
  });

  it('opens the new request modal when New request is clicked', async () => {
    mockApi.get.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 50, pages: 0 },
    });
    const user = userEvent.setup();
    renderWithProviders(<PrivacyRequestsTab />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New request' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'New request' }));
    expect(screen.getByRole('dialog', { name: 'New privacy request' })).toBeInTheDocument();
  });

  it('opens the detail panel when a row is clicked and can trigger generate', async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === '/privacy-requests') {
        return { data: { items: [sampleListItem], total: 1, page: 1, page_size: 50, pages: 1 } };
      }
      if (url === '/privacy-requests/pr-1') {
        return { data: sampleDetail };
      }
      return { data: null };
    });
    mockApi.post.mockResolvedValue({
      data: {
        download_url: '/api/v1/privacy-requests/pr-1/download',
        record_counts: { registrations: 1 },
        executed_at: '2026-04-01T11:00:00Z',
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<PrivacyRequestsTab />);

    await waitFor(() => {
      expect(screen.getByText('export')).toBeInTheDocument();
    });
    await user.click(screen.getByText('export'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate export/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Generate export/ }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/privacy-requests/pr-1/generate-export');
    });
  });
});
