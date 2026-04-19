import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PortalAccountActions from '../PortalAccountActions';

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

vi.mock('../../config/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const showToast = vi.fn();
vi.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

import api from '../../config/api';

const mockApi = vi.mocked(api);

function renderActions(
  props: { portalUserId?: string; isActive?: boolean; onAfterMerge?: () => void } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PortalAccountActions
        portalUserId={props.portalUserId ?? 'pu-1'}
        isActive={props.isActive ?? true}
        onAfterMerge={props.onAfterMerge}
      />
    </QueryClientProvider>
  );
}

describe('PortalAccountActions — each action fires the right API call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Deactivate button calls PUT /portal-users/:id/toggle-access and toasts the response message', async () => {
    mockApi.put.mockResolvedValueOnce({ data: { message: 'Portal access deactivated' } });

    renderActions({ portalUserId: 'pu-1', isActive: true });
    await userEvent.click(screen.getByRole('button', { name: /^Deactivate$/ }));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/portal-users/pu-1/toggle-access');
    });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Portal access deactivated', 'success');
    });
  });

  it('shows Activate (not Deactivate) when user is inactive and calls the same endpoint', async () => {
    mockApi.put.mockResolvedValueOnce({ data: { message: 'Portal access activated' } });

    renderActions({ isActive: false });
    expect(screen.queryByRole('button', { name: /^Deactivate$/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Activate$/ }));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/portal-users/pu-1/toggle-access');
    });
  });

  it('surfaces the 409 detail message when deactivate is blocked by active assignments', async () => {
    mockApi.put.mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'User has an active training registration' } },
    });

    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /^Deactivate$/ }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('User has an active training registration', 'error');
    });
  });

  it('Resend invite button calls POST /portal-users/:id/resend-invite and toasts on success', async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });

    renderActions({ portalUserId: 'pu-42' });
    await userEvent.click(screen.getByRole('button', { name: /Resend invite/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/portal-users/pu-42/resend-invite');
    });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Invite email sent', 'success');
    });
  });

  it('Reset password button calls POST /portal-users/:id/reset-password and toasts on success', async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });

    renderActions({ portalUserId: 'pu-42' });
    await userEvent.click(screen.getByRole('button', { name: /Reset password/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/portal-users/pu-42/reset-password');
    });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Password reset email sent', 'success');
    });
  });

  describe('Impersonate', () => {
    let openSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      window.localStorage.removeItem('portal_access_token');
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { pathname: '/admin/acme-corp/conferences/xyz' },
      });
    });

    afterEach(() => {
      openSpy.mockRestore();
    });

    it('calls POST /portal-users/:id/impersonate, stores the portal token, and opens the portal dashboard', async () => {
      mockApi.post.mockResolvedValueOnce({
        data: { access_token: 'jwt.portal.token', portal_user_name: 'Jane Speaker' },
      });

      renderActions({ portalUserId: 'pu-42' });
      await userEvent.click(screen.getByRole('button', { name: /^Impersonate$/ }));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith('/portal-users/pu-42/impersonate');
      });
      await waitFor(() => {
        expect(window.localStorage.getItem('portal_access_token')).toBe('jwt.portal.token');
      });
      expect(openSpy).toHaveBeenCalledWith('/acme-corp/portal/dashboard', '_blank');
      expect(showToast).toHaveBeenCalledWith('Viewing portal as Jane Speaker', 'info');
    });

    it('is disabled when the portal user is inactive (cannot impersonate a deactivated account)', () => {
      renderActions({ isActive: false });
      expect(screen.getByRole('button', { name: /^Impersonate$/ })).toBeDisabled();
    });
  });

  it('Merge with... opens the MergeDialog without calling any API until the user confirms', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /Merge with/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /merge users/i })).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(mockApi.put).not.toHaveBeenCalled();
  });

  it('toasts a generic error when resend-invite fails', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('network'));

    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /Resend invite/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Failed to send invite', 'error');
    });
  });
});
