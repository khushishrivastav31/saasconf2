import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupPassword from '../SetupPassword';

// Mock ThemeToggle
vi.mock('../../components/ThemeToggle', () => ({
  default: () => <button aria-label="theme-toggle">Theme</button>,
}));

// Mock react-router
const mockSearchParams = new URLSearchParams();

vi.mock('react-router', () => ({
  useSearchParams: () => [mockSearchParams],
  Link: ({ children, to, ...props }: Record<string, unknown>) => (
    <a href={to as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

// Mock api
const mockPost = vi.fn();

vi.mock('../../config/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('SetupPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset search params to empty (no token) by default
    mockSearchParams.delete('token');
  });

  describe('rendering - no token', () => {
    it('shows "Invalid invitation link" error and "Go to login" link when no token is present', () => {
      render(<SetupPassword />);

      expect(
        screen.getByText('Invalid invitation link. No token was provided.')
      ).toBeInTheDocument();
      expect(screen.getByText('Go to login')).toBeInTheDocument();
      expect(screen.getByText('Go to login').closest('a')).toHaveAttribute('href', '/login');
    });
  });

  describe('rendering - with token', () => {
    beforeEach(() => {
      mockSearchParams.set('token', 'valid-token-123');
    });

    it('shows "Welcome to SaaSConf" title, subtitle, password fields, and "Set Password" button', () => {
      render(<SetupPassword />);

      expect(screen.getByText('Welcome to SaaSConf')).toBeInTheDocument();
      expect(screen.getByText('Set up your password to get started')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Set Password' })).toBeInTheDocument();
    });

    it('renders password inputs with correct attributes', () => {
      render(<SetupPassword />);

      const passwordInput = screen.getByPlaceholderText('Password');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('id', 'new-password');
      expect(passwordInput).toHaveAttribute('autoComplete', 'new-password');
      expect(passwordInput).toBeRequired();

      const confirmInput = screen.getByPlaceholderText('Confirm password');
      expect(confirmInput).toHaveAttribute('type', 'password');
      expect(confirmInput).toHaveAttribute('id', 'confirm-password');
      expect(confirmInput).toHaveAttribute('autoComplete', 'new-password');
      expect(confirmInput).toBeRequired();
    });
  });

  describe('validation - password mismatch', () => {
    beforeEach(() => {
      mockSearchParams.set('token', 'valid-token-123');
    });

    it('shows "Passwords do not match." when passwords differ', async () => {
      const user = userEvent.setup();
      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'StrongPass1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'DifferentPass1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('validation - too short', () => {
    beforeEach(() => {
      mockSearchParams.set('token', 'valid-token-123');
    });

    it('shows "Password must be at least 8 characters." when password is less than 8 chars', async () => {
      const user = userEvent.setup();
      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'Ab1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'Ab1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('validation - missing requirements', () => {
    beforeEach(() => {
      mockSearchParams.set('token', 'valid-token-123');
    });

    it('shows error when password has no uppercase letter', async () => {
      const user = userEvent.setup();
      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'lowercase1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'lowercase1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'Password must contain at least one uppercase letter, one lowercase letter, and one digit.'
          )
        ).toBeInTheDocument();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('shows error when password has no lowercase letter', async () => {
      const user = userEvent.setup();
      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'UPPERCASE1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'UPPERCASE1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'Password must contain at least one uppercase letter, one lowercase letter, and one digit.'
          )
        ).toBeInTheDocument();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('shows error when password has no digit', async () => {
      const user = userEvent.setup();
      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'NoDigitsHere');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'NoDigitsHere');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'Password must contain at least one uppercase letter, one lowercase letter, and one digit.'
          )
        ).toBeInTheDocument();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('successful submission', () => {
    beforeEach(() => {
      mockSearchParams.set('token', 'valid-token-123');
    });

    it('calls api.post with correct payload and shows success message', async () => {
      const user = userEvent.setup();
      mockPost.mockResolvedValue({ data: { message: 'ok' } });

      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'ValidPass1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'ValidPass1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/auth/reset-password', {
          token: 'valid-token-123',
          new_password: 'ValidPass1',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText('Your password has been set successfully. You can now log in.')
        ).toBeInTheDocument();
      });

      // Should show "Go to login" link after success
      expect(screen.getByText('Go to login')).toBeInTheDocument();
      expect(screen.getByText('Go to login').closest('a')).toHaveAttribute('href', '/login');
    });
  });

  describe('API error', () => {
    beforeEach(() => {
      mockSearchParams.set('token', 'valid-token-123');
    });

    it('shows expired invitation error when API call fails', async () => {
      const user = userEvent.setup();
      mockPost.mockRejectedValue(new Error('Request failed'));

      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'ValidPass1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'ValidPass1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'This invitation link has expired or has already been used. Please contact your administrator.'
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    beforeEach(() => {
      mockSearchParams.set('token', 'valid-token-123');
    });

    it('shows "Setting up..." and disables button while submitting', async () => {
      let resolvePost!: (value: unknown) => void;
      mockPost.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );

      const user = userEvent.setup();
      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'ValidPass1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'ValidPass1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      // While the post promise is pending, button should show loading state
      expect(screen.getByRole('button', { name: 'Setting up...' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Setting up...' })).toBeDisabled();

      // Resolve the post to clean up
      await act(async () => {
        resolvePost({ data: { message: 'ok' } });
      });

      await waitFor(() => {
        expect(
          screen.getByText('Your password has been set successfully. You can now log in.')
        ).toBeInTheDocument();
      });
    });

    it('restores button state after failed submission', async () => {
      const user = userEvent.setup();
      mockPost.mockRejectedValue(new Error('fail'));

      render(<SetupPassword />);

      await user.type(screen.getByPlaceholderText('Password'), 'ValidPass1');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'ValidPass1');
      await user.click(screen.getByRole('button', { name: 'Set Password' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'This invitation link has expired or has already been used. Please contact your administrator.'
          )
        ).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: 'Set Password' });
      expect(button).not.toBeDisabled();
    });
  });
});
