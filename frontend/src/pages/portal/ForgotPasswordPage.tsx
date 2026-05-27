import { useState } from 'react';
import { Link, useParams } from 'react-router';
import portalApi from '../../config/portalApi';

export default function ForgotPasswordPage() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await portalApi.post(`/portal/${companySlug}/unified/forgot-password`, { email });
    } catch {
      // Intentionally silent — don't disclose whether the email exists.
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Check your email</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            If an account exists for that email, a reset link has been sent. Check your inbox.
          </p>
          <Link
            to={`/${companySlug}/portal/user/login`}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Forgot your password?
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <form
          className="mt-8 space-y-6 rounded-lg bg-white p-8 shadow dark:bg-gray-800"
          onSubmit={handleSubmit}
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full justify-center min-h-[44px] items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-800"
          >
            {isLoading ? 'Sending…' : 'Send reset link'}
          </button>

          <div className="text-center">
            <Link
              to={`/${companySlug}/portal/user/login`}
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
