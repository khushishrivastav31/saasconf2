import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChangePasswordModal from '../ChangePasswordModal';
import { ToastProvider } from '../Toast';

vi.mock('../../config/api', () => ({
  default: {
    patch: vi.fn(),
  },
}));

import api from '../../config/api';

const mockApi = vi.mocked(api);

function renderModal(open = true, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ChangePasswordModal open={open} onClose={onClose} />
        </ToastProvider>
      </QueryClientProvider>
    ),
  };
}

describe('ChangePasswordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = renderModal(false);
    expect(container.querySelector('form')).toBeNull();
  });

  it('renders form fields when open', () => {
    renderModal();
    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Current Password'), 'OldPass123');
    await user.type(screen.getByLabelText('New Password'), 'NewPass123');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Different1');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('shows error when password is too short', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Current Password'), 'OldPass123');
    await user.type(screen.getByLabelText('New Password'), 'Ab1');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Ab1');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('shows error when password is missing uppercase', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Current Password'), 'OldPass123');
    await user.type(screen.getByLabelText('New Password'), 'lowercase1');
    await user.type(screen.getByLabelText('Confirm New Password'), 'lowercase1');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('uppercase');
    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('calls API on valid submission', async () => {
    const user = userEvent.setup();
    mockApi.patch.mockResolvedValueOnce({ data: { message: 'Password changed successfully' } });
    renderModal();

    await user.type(screen.getByLabelText('Current Password'), 'OldPass123');
    await user.type(screen.getByLabelText('New Password'), 'NewPass456');
    await user.type(screen.getByLabelText('Confirm New Password'), 'NewPass456');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith('/auth/me/password', {
        current_password: 'OldPass123',
        new_password: 'NewPass456',
      });
    });
  });

  it('resets form on close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(true, onClose);

    await user.type(screen.getByLabelText('Current Password'), 'something');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
