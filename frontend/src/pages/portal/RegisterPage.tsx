import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApplicantAuth } from "../../hooks/useApplicantAuth";
import { usePortalBasePath } from "../../hooks/usePortalBasePath";
import { parseApiError } from "../../utils/apiError";
import portalApi from "../../config/portalApi";
import ConferenceLogo from "../../components/ConferenceLogo";
import type { PortalLandingData, PortalTenant } from "../../types/portal";

function RegisterPage() {
  const { register } = useApplicantAuth();
  const basePath = usePortalBasePath();
  const { companySlug } = useParams<{ companySlug: string }>();
  const [searchParams] = useSearchParams();
  const cfpAbbreviation = searchParams.get("cfp");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch tenant info (for logo display)
  const { data: tenantData } = useQuery({
    queryKey: ["portal-tenant", companySlug],
    queryFn: async () => {
      const res = await portalApi.get<PortalTenant>(
        `/portal/tenant/${companySlug}`,
      );
      return res.data;
    },
    enabled: !!companySlug,
  });

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

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);

    try {
      const message = await register({ email, password, first_name: firstName, last_name: lastName });
      setSuccessMessage(message);
    } catch (err: unknown) {
      const msg = parseApiError(err, "Registration failed. Please try again.");
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const conference = conferenceData?.conference;
  const tenant = tenantData;

  // Use conference logo if available, otherwise fall back to tenant logo
  const logoUrl = conference?.logo_url || tenant?.logo_url;
  const logoAlt = conference?.name || tenant?.name || companySlug || "Portal";

  if (successMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Check Your Email
            </h2>
            <p className="text-sm text-gray-600 mb-6">{successMessage}</p>
            <Link
              to={`${basePath}/user/login${cfpAbbreviation ? `?cfp=${cfpAbbreviation}` : ""}`}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Go to Login
            </Link>
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
          <p className="text-sm text-gray-500 mt-1">
            Create your account
          </p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{" "}
          <Link
            to={`${basePath}/user/login${cfpAbbreviation ? `?cfp=${cfpAbbreviation}` : ""}`}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
