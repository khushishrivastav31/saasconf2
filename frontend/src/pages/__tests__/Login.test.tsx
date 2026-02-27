import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';

// Mock ThemeToggle (Login renders it, but these tests don't test theme)
vi.mock('../../components/ThemeToggle', () => ({
  default: () => <button aria-label="theme-toggle">Theme</button>,
}));

// Mock react-router
const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock useAuth hook
const mockLogin = vi.fn();
let mockUser: { id: string; email: string } | null = null;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    login: mockLogin,
  }),
}));

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  describe('rendering', () => {
    it('renders the login form with email and password fields', () => {
      render(<Login />);

      expect(screen.getByText('SaaSConf')).toBeInTheDocument();
      expect(screen.getByText('Conference Management Platform')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('renders email input with correct attributes', () => {
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('name', 'email');
      expect(emailInput).toHaveAttribute('autoComplete', 'email');
      expect(emailInput).toBeRequired();
    });

    it('renders password input with correct attributes', () => {
      render(<Login />);

      const passwordInput = screen.getByLabelText('Password');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('name', 'password');
      expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
      expect(passwordInput).toBeRequired();
    });

    it('renders the submit button enabled by default', () => {
      render(<Login />);

      const submitButton = screen.getByRole('button', { name: 'Sign in' });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('form submission', () => {
    it('calls login with email and password on form submit', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);

      render(<Login />);

      await user.type(screen.getByLabelText('Email address'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
    });

    it('navigates to /dashboard on successful login', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);

      render(<Login />);

      await user.type(screen.getByLabelText('Email address'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  describe('error display', () => {
    it('displays error message when login fails with API detail', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValue({
        response: { data: { detail: 'Invalid credentials' } },
      });

      render(<Login />);

      await user.type(screen.getByLabelText('Email address'), 'bad@example.com');
      await user.type(screen.getByLabelText('Password'), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('displays fallback error message when login fails without detail', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValue(new Error('Network error'));

      render(<Login />);

      await user.type(screen.getByLabelText('Email address'), 'bad@example.com');
      await user.type(screen.getByLabelText('Password'), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument();
      });
    });

    it('does not navigate when login fails', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValue(new Error('Login failed'));

      render(<Login />);

      await user.type(screen.getByLabelText('Email address'), 'bad@example.com');
      await user.type(screen.getByLabelText('Password'), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('auto-dismisses error after 5 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockLogin.mockRejectedValue(new Error('fail'));

      render(<Login />);

      await user.type(screen.getByLabelText('Email address'), 'a@b.com');
      await user.type(screen.getByLabelText('Password'), 'wrong');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument();
      });

      // Advance past the 5-second auto-dismiss timer
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Login failed. Please try again.')).not.toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });

  describe('already authenticated', () => {
    it('still renders the login form when user is already authenticated', () => {
      mockUser = { id: 'user-123', email: 'existing@example.com' };

      render(<Login />);

      // The current Login component does not redirect when a user is already
      // authenticated; it renders the form regardless.
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it("shows 'Signing in...' and disables button during login", async () => {
      // Keep login pending to observe loading state
      let resolveLogin!: () => void;
      mockLogin.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveLogin = resolve;
          })
      );

      const { container } = render(<Login />);

      // Set field values directly to avoid userEvent timing issues
      const emailInput = screen.getByLabelText('Email address');
      const passwordInput = screen.getByLabelText('Password');
      await act(async () => {
        (emailInput as HTMLInputElement).value = 'test@example.com';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        (passwordInput as HTMLInputElement).value = 'password123';
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Submit the form directly
      const form = container.querySelector('form')!;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // While the login promise is pending, button should show loading state
      expect(screen.getByRole('button', { name: 'Signing in...' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();

      // Resolve the login to clean up
      await act(async () => {
        resolveLogin();
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      });
    });

    it('restores button state after failed login', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValue(new Error('fail'));

      render(<Login />);

      await user.type(screen.getByLabelText('Email address'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'wrong');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: 'Sign in' });
      expect(button).not.toBeDisabled();
    });
  });
});
