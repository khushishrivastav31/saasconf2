import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import { usePortalBasePath } from '../../hooks/usePortalBasePath';
import { parseApiError } from '../../utils/apiError';
import portalApi from '../../config/portalApi';
import ConferenceLogo from '../../components/ConferenceLogo';
import type { PortalLandingData, PortalTenant } from '../../types/portal';

function LoginPage() {
  const { login } = useApplicantAuth();
  const navigate = useNavigate();
  const basePath = usePortalBasePath();
  const { companySlug } = useParams<{ companySlug: string }>();
  const [searchParams] = useSearchParams();
  const cfpAbbreviation = searchParams.get('cfp');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdminRedirect, setShowAdminRedirect] = useState(false);

  // Fetch tenant info (for logo display)
  const { data: tenantData } = useQuery({
    queryKey: ['portal-tenant', companySlug],
    queryFn: async () => {
      const res = await portalApi.get<PortalTenant>(`/portal/tenant/${companySlug}`);
      return res.data;
    },
    enabled: !!companySlug,
  });

  // Fetch conference data if coming from a specific CFP landing page
  const { data: conferenceData } = useQuery({
    queryKey: ['portal-landing', companySlug, cfpAbbreviation],
    queryFn: async () => {
      const res = await portalApi.get<PortalLandingData>(
        `/portal/${companySlug}/${cfpAbbreviation}`
      );
      return res.data;
    },
    enabled: !!companySlug && !!cfpAbbreviation,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowAdminRedirect(false);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      navigate(`${basePath}/news`);
    } catch (err: unknown) {
      // Check if this is a tenant admin redirect response
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        const detail = err.response.data?.detail;
        if (typeof detail === 'object' && detail?.code === 'TENANT_ADMIN_REDIRECT') {
          setShowAdminRedirect(true);
          setIsSubmitting(false);
          return;
        }
      }
      const msg = parseApiError(err, 'Login failed. Please check your credentials.');
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const conference = conferenceData?.conference;
  const tenant = tenantData;

  // Use conference logo if available, otherwise fall back to tenant logo
  const logoUrl = conference?.logo_url || tenant?.logo_url;
  const logoAlt = conference?.name || tenant?.name || companySlug || 'Portal';

  // Show admin redirect message
  if (showAdminRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full">
          <div className="text-center mb-8">
            {logoUrl && (
              <div className="h-16 mx-auto mb-4 flex items-center justify-center">
                <ConferenceLogo
                  logoUrl={logoUrl}
                  alt={logoAlt}
                  className="max-h-16 object-contain"
                  apiInstance={portalApi}
                  showPlaceholder={false}
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Admin Account Detected</h2>
            <p className="text-sm text-gray-600 mb-6">
              You are registered as a tenant administrator. Please use the admin portal to access
              your account and manage conferences.
            </p>
            <a
              href="/login"
              className="inline-flex items-center justify-center w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 text-sm font-medium"
            >
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Go to Admin Portal
            </a>
            <button
              type="button"
              onClick={() => setShowAdminRedirect(false)}
              className="mt-3 text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          {logoUrl && (
            <div className="h-16 mx-auto mb-4 flex items-center justify-center">
              <ConferenceLogo
                logoUrl={logoUrl}
                alt={logoAlt}
                className="max-h-16 object-contain"
                apiInstance={portalApi}
                showPlaceholder={false}
              />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">
            {conference?.name || tenant?.name || `${companySlug} User Portal`}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to access your portal</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don't have an account?{' '}
          <Link
            to={`${basePath}/user/register${cfpAbbreviation ? `?cfp=${cfpAbbreviation}` : ''}`}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
