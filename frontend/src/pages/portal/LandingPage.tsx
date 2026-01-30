import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import portalApi from "../../config/portalApi";
import type { PortalLandingData } from "../../types/portal";

function LandingPage() {
  const { tenantSlug, abbreviation } = useParams<{
    tenantSlug: string;
    abbreviation: string;
  }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-landing", tenantSlug, abbreviation],
    queryFn: async () => {
      const res = await portalApi.get<PortalLandingData>(
        `/portal/${tenantSlug}/${abbreviation}`,
      );
      return res.data;
    },
    enabled: !!tenantSlug && !!abbreviation,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Conference Not Found
          </h1>
          <p className="text-gray-500">
            The conference you are looking for does not exist or is no longer
            active.
          </p>
        </div>
      </div>
    );
  }

  const { conference, tenant_name } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          {conference.logo_url && (
            <img
              src={conference.logo_url}
              alt={conference.name}
              className="h-16 mx-auto mb-4"
            />
          )}
          <p className="text-sm text-gray-500 mb-2">{tenant_name}</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {conference.name}
          </h1>
          {conference.abbreviation && (
            <p className="text-lg text-primary-600 font-medium mb-4">
              {conference.abbreviation}
            </p>
          )}

          {/* Date & Location */}
          <div className="flex items-center justify-center gap-4 text-sm text-gray-600 mb-6">
            {conference.start_date && (
              <span>
                {new Date(conference.start_date).toLocaleDateString()}
                {conference.end_date &&
                  conference.end_date !== conference.start_date &&
                  ` – ${new Date(conference.end_date).toLocaleDateString()}`}
              </span>
            )}
            {(conference.city || conference.country) && (
              <span>
                {[conference.city, conference.country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
            {conference.venue_type !== "onsite" && (
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                {conference.venue_type === "hybrid" ? "Hybrid" : "Virtual"}
              </span>
            )}
          </div>

          {conference.description && (
            <div
              className="text-gray-600 max-w-2xl mx-auto mb-8 prose prose-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(conference.description ?? "") }}
            />
          )}

          {/* Auth buttons */}
          <div className="flex items-center justify-center gap-3">
            <Link
              to={`/${tenantSlug}/portal/user/register`}
              className="inline-flex items-center px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
            >
              Register to Submit
            </Link>
            <Link
              to={`/${tenantSlug}/portal/user/login`}
              className="inline-flex items-center px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Login
            </Link>
          </div>
        </div>
      </div>

      {/* CFPs */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {conference.cfps.length > 0 ? (
          <div className="space-y-6">
            {conference.cfps.map((cfp) => (
              <div
                key={cfp.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {cfp.title}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      cfp.status === "open"
                        ? "bg-green-100 text-green-700"
                        : cfp.status === "closed"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {cfp.status}
                  </span>
                </div>

                {cfp.description && (
                  <div
                    className="text-sm text-gray-600 mb-4 prose prose-sm"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cfp.description ?? "") }}
                  />
                )}

                <div className="flex gap-6 text-sm text-gray-500">
                  {cfp.open_date && (
                    <span>
                      Opens:{" "}
                      {new Date(cfp.open_date).toLocaleDateString()}
                    </span>
                  )}
                  {cfp.close_date && (
                    <span>
                      Closes:{" "}
                      {new Date(cfp.close_date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {cfp.guidelines_for_submissions && (
                  <details className="mt-4">
                    <summary className="text-sm font-medium text-primary-600 cursor-pointer hover:text-primary-700">
                      Submission Guidelines
                    </summary>
                    <div
                      className="mt-2 text-sm text-gray-600 prose prose-sm"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(cfp.guidelines_for_submissions ?? ""),
                      }}
                    />
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            No Call for Papers available at this time.
          </div>
        )}
      </div>
    </div>
  );
}

export default LandingPage;
