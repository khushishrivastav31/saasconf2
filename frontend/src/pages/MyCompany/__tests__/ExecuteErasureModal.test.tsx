import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExecuteErasureModal from '../ExecuteErasureModal';
import type { PrivacyRequest } from '../types';

vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const showToast = vi.fn();
vi.mock('../../../components/Toast', () => ({
  useToast: () => ({ showToast }),
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

const sampleRequest: PrivacyRequest = {
  id: 'pr-1',
  tenant_id: 't-1',
  request_type: 'erasure',
  subject_emails: ['erase@example.com'],
  status: 'approved',
  created_by: null,
  portal_user_id: null,
  created_at: '2026-04-01T10:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  executed_at: null,
  completion_artifact_url: null,
  execution_manifest: null,
  rejection_reason: null,
  notes: null,
};

const samplePreview = {
  entries: [
    {
      table: 'registrations',
      count: 1,
      row_ids: ['r-1'],
      default_action: 'delete' as const,
      allowed_actions: ['delete' as const],
      locked_reason: null,
    },
    {
      table: 'invoices',
      count: 1,
      row_ids: ['i-1'],
      default_action: 'skip' as const,
      allowed_actions: ['skip' as const],
      locked_reason: 'HGB §257: 10-year retention',
    },
    {
      table: 'users',
      count: 1,
      row_ids: ['u-1'],
      default_action: 'anonymize' as const,
      allowed_actions: ['anonymize' as const, 'delete' as const],
      locked_reason: null,
    },
  ],
  summary: { to_delete: 1, to_anonymize: 1, to_skip: 1 },
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ExecuteErasureModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the per-table preview when opened', async () => {
    mockApi.post.mockResolvedValueOnce({ data: samplePreview });
    renderWithProviders(
      <ExecuteErasureModal request={sampleRequest} onClose={vi.fn()} onCompleted={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByText('registrations')).toBeInTheDocument();
    });
    expect(screen.getByText('invoices')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
    // Summary strip
    expect(screen.getByText(/1 delete/)).toBeInTheDocument();
    expect(screen.getByText(/1 anonymize/)).toBeInTheDocument();
    expect(screen.getByText(/1 skip/)).toBeInTheDocument();
  });

  it('marks locked tables with a locked badge', async () => {
    mockApi.post.mockResolvedValueOnce({ data: samplePreview });
    renderWithProviders(
      <ExecuteErasureModal request={sampleRequest} onClose={vi.fn()} onCompleted={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getAllByText('locked').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/HGB/).length).toBeGreaterThanOrEqual(1);
  });

  it('gates the execute button behind the ERASE confirmation', async () => {
    mockApi.post.mockResolvedValueOnce({ data: samplePreview });
    const user = userEvent.setup();
    renderWithProviders(
      <ExecuteErasureModal request={sampleRequest} onClose={vi.fn()} onCompleted={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('registrations')).toBeInTheDocument());

    const executeBtn = screen.getByRole('button', { name: /Execute erasure/i });
    expect(executeBtn).toBeDisabled();

    const input = screen.getByLabelText(/Type ERASE/i);
    await user.type(input, 'ERASE');
    expect(executeBtn).toBeEnabled();
  });

  it('sends the chosen table_actions on execute', async () => {
    mockApi.post
      .mockResolvedValueOnce({ data: samplePreview })
      .mockResolvedValueOnce({ data: { executed_at: '2026-04-19T12:00:00Z', manifest: {} } });
    const user = userEvent.setup();
    const onCompleted = vi.fn();
    renderWithProviders(
      <ExecuteErasureModal request={sampleRequest} onClose={vi.fn()} onCompleted={onCompleted} />
    );
    await waitFor(() => expect(screen.getByText('registrations')).toBeInTheDocument());

    // Switch users → delete via radio override.
    const usersRow = screen.getByText('users').closest('tr');
    expect(usersRow).not.toBeNull();
    const deleteRadio = within(usersRow as HTMLElement).getByLabelText('Delete');
    await user.click(deleteRadio);

    await user.type(screen.getByLabelText(/Type ERASE/i), 'ERASE');
    await user.click(screen.getByRole('button', { name: /Execute erasure/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/privacy-requests/pr-1/execute-erasure',
        expect.objectContaining({
          table_actions: expect.objectContaining({
            registrations: 'delete',
            invoices: 'skip',
            users: 'delete',
          }),
        })
      );
    });
    expect(onCompleted).toHaveBeenCalled();
  });

  it('surfaces a toast on a 4xx error from execute-erasure', async () => {
    mockApi.post
      .mockResolvedValueOnce({ data: samplePreview })
      .mockRejectedValueOnce({ response: { data: { detail: 'nope' } } });
    const user = userEvent.setup();
    renderWithProviders(
      <ExecuteErasureModal request={sampleRequest} onClose={vi.fn()} onCompleted={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('registrations')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Type ERASE/i), 'ERASE');
    await user.click(screen.getByRole('button', { name: /Execute erasure/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.anything(), 'error');
    });
  });
});
