import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../config/api';
import ThemeToggle from '../components/ThemeToggle';

export default function SetupPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError(
        'Password must contain at least one uppercase letter, one lowercase letter, and one digit.'
      );
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/reset-password', { token, new_password: newPassword });
      setSuccess(true);
    } catch {
      setError(
        'This invitation link has expired or has already been used. Please contact your administrator.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="max-w-md w-full space-y-8">
          <div>
            <h1 className="text-center text-3xl font-bold text-gray-900 dark:text-gray-100">
              SaaSConf
            </h1>
          </div>
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">
              Invalid invitation link. No token was provided.
            </p>
          </div>
          <div className="text-center">
            <Link
              to="/login"
              className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              Go to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900 dark:text-gray-100">
            Welcome to SaaSConf
          </h1>
          <h2 className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            Set up your password to get started
          </h2>
        </div>

        {success ? (
          <div className="mt-8 space-y-6">
            <div className="rounded-md bg-green-50 dark:bg-green-900/30 p-4">
              <p className="text-sm text-green-700 dark:text-green-300">
                Your password has been set successfully. You can now log in.
              </p>
            </div>
            <div className="text-center">
              <Link
                to="/login"
                className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                Go to login
              </Link>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="new-password" className="sr-only">
                  Password
                </label>
                <input
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm dark:bg-gray-800"
                  placeholder="Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm dark:bg-gray-800"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              At least 8 characters, including one uppercase letter, one lowercase letter, and one
              digit.
            </p>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-800"
              >
                {isLoading ? 'Setting up...' : 'Set Password'}
              </button>
            </div>

            <div className="text-center">
              <Link
                to="/login"
                className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
