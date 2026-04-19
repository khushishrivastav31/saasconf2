import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MergeDialog from '../../pages/MyCompany/UsersTab/MergeDialog';

vi.mock('../../config/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const showToast = vi.fn();
vi.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

import api from '../../config/api';

const mockApi = vi.mocked(api);

function renderDialog(props: {
  targetUserId: string;
  onClose?: () => void;
  onMerged?: () => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MergeDialog
        targetUserId={props.targetUserId}
        onClose={props.onClose ?? vi.fn()}
        onMerged={props.onMerged ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('MergeDialog (API-lookup path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up the source user by email and fires the merge mutation', async () => {
    const targetId = 'target-id';
    const sourceId = 'source-id';
    mockApi.get.mockResolvedValueOnce({
      data: { items: [{ id: sourceId, email: 'source@example.com' }] },
    });
    mockApi.post.mockResolvedValueOnce({ data: { message: 'Merged.' } });

    const onMerged = vi.fn();
    renderDialog({ targetUserId: targetId, onMerged });

    await userEvent.type(screen.getByPlaceholderText(/user@example\.com/i), 'source@example.com');
    await userEvent.click(screen.getByRole('button', { name: /^Merge$/i }));

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/portal-users', {
        params: { search: 'source@example.com', per_page: 5 },
      });
    });
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(`/portal-users/${targetId}/merge`, {
        source_user_id: sourceId,
      });
    });
    await waitFor(() => expect(onMerged).toHaveBeenCalled());
  });

  it('shows an error toast when the source email does not match any user', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { items: [] } });

    renderDialog({ targetUserId: 'target-id' });

    await userEvent.type(screen.getByPlaceholderText(/user@example\.com/i), 'missing@example.com');
    await userEvent.click(screen.getByRole('button', { name: /^Merge$/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Source user not found.', 'error');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('does not treat the target user as a valid source match', async () => {
    const targetId = 'same-id';
    mockApi.get.mockResolvedValueOnce({
      data: { items: [{ id: targetId, email: 'self@example.com' }] },
    });

    renderDialog({ targetUserId: targetId });

    await userEvent.type(screen.getByPlaceholderText(/user@example\.com/i), 'self@example.com');
    await userEvent.click(screen.getByRole('button', { name: /^Merge$/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Source user not found.', 'error');
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});
