import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { AxiosError } from 'axios';
import portalApi from '../../config/portalApi';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { companySlug } = useParams<{ companySlug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      await portalApi.post(`/portal/${companySlug}/unified/reset-password`, {
        token,
        password,
      });

      navigate(`/${companySlug}/portal/user/login`, {
        state: { message: 'Password reset successfully. You can now sign in.' },
      });
    } catch (err) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(
        axiosError.response?.data?.detail || 'Failed to reset password. The link may have expired.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Invalid Link</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            This password reset link is invalid or has expired.
          </p>
          <a
            href={`/${companySlug}/portal/user/login`}
            className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Choose a new password for your portal account.
          </p>
        </div>

        <form
          className="mt-8 space-y-6 rounded-lg bg-white p-8 shadow dark:bg-gray-800"
          onSubmit={handleSubmit}
        >
          {error && (
            <div
              className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400"
              role="alert"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              aria-label="New password"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              aria-label="Confirm password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full justify-center min-h-[44px] items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-800"
          >
            {isLoading ? 'Resetting…' : 'Reset password'}
          </button>

          <div className="text-center">
            <a
              href={`/${companySlug}/portal/user/login`}
              className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Go to login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
