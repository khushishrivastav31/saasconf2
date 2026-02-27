import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { sanitizeHtml } from '../../utils/richText';
import portalApi from '../../config/portalApi';
import ConferenceLogo from '../../components/ConferenceLogo';
import { formatDate } from '../../utils/formatDate';
import type { PortalLandingData } from '../../types/portal';

function LandingPage() {
  const { tenantSlug, abbreviation } = useParams<{
    tenantSlug: string;
    abbreviation: string;
  }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal-landing', tenantSlug, abbreviation],
    queryFn: async () => {
      const res = await portalApi.get<PortalLandingData>(`/portal/${tenantSlug}/${abbreviation}`);
      return res.data;
    },
    enabled: !!tenantSlug && !!abbreviation,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Conference Not Found
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            The conference you are looking for does not exist or is no longer active.
          </p>
        </div>
      </div>
    );
  }

  const { conference, tenant_name } = data;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          {conference.logo_url && (
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{tenant_name}</p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            {conference.name}
          </h1>
          {conference.abbreviation && (
            <p className="text-lg text-primary-600 font-medium mb-4">{conference.abbreviation}</p>
          )}

          {/* Date & Location */}
          <div className="flex items-center justify-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
            {conference.start_date && (
              <span>
                {formatDate(conference.start_date)}
                {conference.end_date &&
                  conference.end_date !== conference.start_date &&
                  ` – ${formatDate(conference.end_date)}`}
              </span>
            )}
            {(conference.city || conference.country) && (
              <span>{[conference.city, conference.country].filter(Boolean).join(', ')}</span>
            )}
            {conference.venue_type !== 'onsite' && (
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-xs font-medium">
                {conference.venue_type === 'hybrid' ? 'Hybrid' : 'Virtual'}
              </span>
            )}
          </div>

          {conference.description && (
            <div
              className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-8 prose prose-sm dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(conference.description ?? '') }}
            />
          )}

          {/* Auth buttons */}
          <div className="flex items-center justify-center gap-3">
            <Link
              to={`/${tenantSlug}/portal/user/register?cfp=${abbreviation}`}
              className="inline-flex items-center px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
            >
              Register to Submit
            </Link>
            <Link
              to={`/${tenantSlug}/portal/user/login?cfp=${abbreviation}`}
              className="inline-flex items-center px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
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
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {cfp.title}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      cfp.status === 'open'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : cfp.status === 'closed'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {cfp.status}
                  </span>
                </div>

                {cfp.description && (
                  <div
                    className="text-sm text-gray-600 dark:text-gray-400 mb-4 prose prose-sm dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(cfp.description ?? '') }}
                  />
                )}

                <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400">
                  {cfp.open_date && <span>Opens: {formatDate(cfp.open_date)}</span>}
                  {cfp.close_date && <span>Closes: {formatDate(cfp.close_date)}</span>}
                </div>

                {/* Rich text sections */}
                {(cfp.guidelines_for_submissions ||
                  cfp.tips_for_submission ||
                  cfp.code_of_conduct ||
                  cfp.incentives_conditions ||
                  cfp.faqs) && (
                  <div className="mt-4 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
                    {cfp.guidelines_for_submissions && (
                      <details className="group">
                        <summary className="text-sm font-medium text-primary-600 cursor-pointer hover:text-primary-700 list-none flex items-center gap-2">
                          <svg
                            className="w-4 h-4 transition-transform group-open:rotate-90"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          Submission Guidelines
                        </summary>
                        <div
                          className="mt-2 ml-6 text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(cfp.guidelines_for_submissions ?? ''),
                          }}
                        />
                      </details>
                    )}
                    {cfp.tips_for_submission && (
                      <details className="group">
                        <summary className="text-sm font-medium text-primary-600 cursor-pointer hover:text-primary-700 list-none flex items-center gap-2">
                          <svg
                            className="w-4 h-4 transition-transform group-open:rotate-90"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          Tips for a Strong Submission
                        </summary>
                        <div
                          className="mt-2 ml-6 text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(cfp.tips_for_submission ?? ''),
                          }}
                        />
                      </details>
                    )}
                    {cfp.code_of_conduct && (
                      <details className="group">
                        <summary className="text-sm font-medium text-primary-600 cursor-pointer hover:text-primary-700 list-none flex items-center gap-2">
                          <svg
                            className="w-4 h-4 transition-transform group-open:rotate-90"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          Code of Conduct
                        </summary>
                        <div
                          className="mt-2 ml-6 text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(cfp.code_of_conduct ?? ''),
                          }}
                        />
                      </details>
                    )}
                    {cfp.incentives_conditions && (
                      <details className="group">
                        <summary className="text-sm font-medium text-primary-600 cursor-pointer hover:text-primary-700 list-none flex items-center gap-2">
                          <svg
                            className="w-4 h-4 transition-transform group-open:rotate-90"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          Incentives & Conditions
                        </summary>
                        <div
                          className="mt-2 ml-6 text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(cfp.incentives_conditions ?? ''),
                          }}
                        />
                      </details>
                    )}
                    {cfp.faqs && (
                      <details className="group">
                        <summary className="text-sm font-medium text-primary-600 cursor-pointer hover:text-primary-700 list-none flex items-center gap-2">
                          <svg
                            className="w-4 h-4 transition-transform group-open:rotate-90"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          FAQs
                        </summary>
                        <div
                          className="mt-2 ml-6 text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(cfp.faqs ?? ''),
                          }}
                        />
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No Call for Papers available at this time.
          </div>
        )}
      </div>
    </div>
  );
}

export default LandingPage;
