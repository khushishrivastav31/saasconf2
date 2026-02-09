import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApplicantAuth } from "../../hooks/useApplicantAuth";
import { usePortalBasePath } from "../../hooks/usePortalBasePath";
import { parseApiError } from "../../utils/apiError";
import portalApi from "../../config/portalApi";
import ConferenceLogo from "../../components/ConferenceLogo";
import type { PortalLandingData } from "../../types/portal";

function LoginPage() {
  const { login } = useApplicantAuth();
  const navigate = useNavigate();
  const basePath = usePortalBasePath();
  const { companySlug } = useParams<{ companySlug: string }>();
  const [searchParams] = useSearchParams();
  const cfpAbbreviation = searchParams.get("cfp");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch conference data if coming from a specific CFP landing page
  const { data: conferenceData } = useQuery({
    queryKey: ["portal-landing", companySlug, cfpAbbreviation],
    queryFn: async () => {
      const res = await portalApi.get<PortalLandingData>(
        `/portal/${companySlug}/${cfpAbbreviation}`,
      );
      return res.data;
    },
    enabled: !!companySlug && !!cfpAbbreviation,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login({ email, password });
      navigate(`${basePath}/dashboard`);
    } catch (err: unknown) {
      const msg = parseApiError(err, "Login failed. Please check your credentials.");
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const conference = conferenceData?.conference;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          {conference?.logo_url && (
            <div className="h-16 mx-auto mb-4 flex items-center justify-center">
              <ConferenceLogo
                logoUrl={conference.logo_url}
                alt={conference.name}
                className="max-h-16 object-contain"
                apiInstance={portalApi}
                showPlaceholder={false}
              />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">
            {conference?.name || `${companySlug} User Portal`}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Sign in to access your portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
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
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don't have an account?{" "}
          <Link
            to={`${basePath}/user/register${cfpAbbreviation ? `?cfp=${cfpAbbreviation}` : ""}`}
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
