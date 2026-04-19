import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../Toast';
import PrivacyMyDataPanel from '../PrivacyMyDataPanel';
import { createTestQueryClient } from '../../../test-utils';
import type {
  PortalExportCreateResponse,
  PortalPrivacyRequestListResponse,
  PortalPrivacyRequestResponse,
} from '../../../pages/MyCompany/types';

vi.mock('../../../config/portalApi', () => ({
  portalApi: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { baseURL: 'http://localhost:8000/api/v1' },
  },
  getPortalAccessToken: () => 'fake-token',
}));

import { portalApi } from '../../../config/portalApi';

const mockApi = vi.mocked(portalApi);

function renderPanel() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PrivacyMyDataPanel />
      </ToastProvider>
    </QueryClientProvider>
  );
}

const emptyList: PortalPrivacyRequestListResponse = {
  items: [],
  total: 0,
  page: 1,
  page_size: 50,
  pages: 0,
};

describe('PrivacyMyDataPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty list
    mockApi.get.mockResolvedValue({ data: emptyList });
    // Stub global fetch for ZIP downloads
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake zip'])),
    }) as unknown as typeof fetch;
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders the two action buttons and history section', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /download my data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request deletion/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /my requests/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/you have not filed any requests/i)).toBeInTheDocument()
    );
  });

  it('POSTs an export and triggers a download', async () => {
    const user = userEvent.setup();
    const exportResp: PortalExportCreateResponse = {
      id: 'pr-1',
      status: 'completed',
      download_url: '/api/v1/portal/me/privacy-requests/pr-1/download',
      record_counts: { registrations: 1 },
      executed_at: '2026-04-19T12:00:00Z',
    };
    mockApi.post.mockResolvedValueOnce({ data: exportResp });
    renderPanel();

    await user.click(screen.getByRole('button', { name: /download my data/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/portal/me/privacy-requests', {
        request_type: 'export',
      })
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('gates erasure behind a confirm step and sends the POST', async () => {
    const user = userEvent.setup();
    const erasureResp: PortalPrivacyRequestResponse = {
      id: 'pr-2',
      request_type: 'erasure',
      status: 'pending_review',
      created_at: '2026-04-19T12:00:00Z',
      reviewed_at: null,
      executed_at: null,
      completion_artifact_url: null,
      rejection_reason: null,
      notes: null,
    };
    mockApi.post.mockResolvedValueOnce({ data: erasureResp });
    renderPanel();

    // The initial CTA is the "Request deletion" button; clicking reveals the textarea + submit.
    await user.click(screen.getByRole('button', { name: /^request deletion$/i }));
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /submit deletion request/i }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/portal/me/privacy-requests', {
        request_type: 'erasure',
        notes: null,
      })
    );
  });

  it('renders completed exports with a re-download link', async () => {
    const completed: PortalPrivacyRequestResponse = {
      id: 'pr-3',
      request_type: 'export',
      status: 'completed',
      created_at: '2026-04-18T10:00:00Z',
      reviewed_at: null,
      executed_at: '2026-04-18T10:00:05Z',
      completion_artifact_url: '/api/v1/portal/me/privacy-requests/pr-3/download',
      rejection_reason: null,
      notes: null,
    };
    mockApi.get.mockResolvedValueOnce({
      data: { ...emptyList, items: [completed], total: 1, pages: 1 },
    });
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download again/i })).toBeInTheDocument()
    );
  });

  it('surfaces a rejection reason in the history row', async () => {
    const rejected: PortalPrivacyRequestResponse = {
      id: 'pr-4',
      request_type: 'erasure',
      status: 'rejected',
      created_at: '2026-04-17T10:00:00Z',
      reviewed_at: '2026-04-17T11:00:00Z',
      executed_at: null,
      completion_artifact_url: null,
      rejection_reason: 'Paid invoices must be retained under HGB §257.',
      notes: null,
    };
    mockApi.get.mockResolvedValue({
      data: { ...emptyList, items: [rejected], total: 1, pages: 1 },
    });
    renderPanel();

    await waitFor(() => expect(screen.getByText(/^Rejected$/)).toBeInTheDocument());
    expect(screen.getByText('Paid invoices must be retained under HGB §257.')).toBeInTheDocument();
  });
});
