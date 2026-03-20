/**
 * Authenticated Registration Page (MVP)
 *
 * Minimal viable registration page for logged-in portal users.
 * Shows alumni status and allows simple registration submission.
 * For full feature parity with public portal, use PublicRegistration components.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import AlumniModal from '../../components/portal/AlumniModal';

interface AlumniCheckResponse {
  is_alumni: boolean;
  has_discount: boolean;
  discount_id: string | null;
  alumni_conferences: Array<{
    conference_id: string;
    conference_name: string;
    conference_abbreviation: string;
  }>;
  warning_message: string | null;
}

interface Conference {
  id: string;
  name: string;
  abbreviation: string;
  tenant_slug: string;
}

export default function AuthenticatedRegistrationMVP() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const navigate = useNavigate();
  const { applicant, isLoading: authLoading } = useApplicantAuth();
  const [showAlumniModal, setShowAlumniModal] = useState(false);
  const [alumniInfo, setAlumniInfo] = useState<AlumniCheckResponse | null>(null);
  const [conference, setConference] = useState<Conference | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch conference and alumni data
  useEffect(() => {
    if (!conferenceId || !applicant) return;

    async function loadData() {
      try {
        // Fetch conference info from portal endpoint
        const confResponse = await portalApi.get(`/portal/conferences/${conferenceId}/summary`);
        setConference(confResponse.data);

        // Check alumni status
        const alumniResponse = await portalApi.get<AlumniCheckResponse>(
          `/portal/conferences/${conferenceId}/alumni-check`
        );
        const alumniData = alumniResponse.data;
        setAlumniInfo(alumniData);

        // Show warning modal if alumni but no discount
        if (alumniData.is_alumni && !alumniData.has_discount && alumniData.warning_message) {
          setShowAlumniModal(true);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [conferenceId, applicant]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading registration...</p>
        </div>
      </div>
    );
  }

  if (!applicant) {
    navigate(`/login`);
    return null;
  }

  if (!conference) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 max-w-md">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Conference Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            The requested conference could not be found or you don't have access to it.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Get public registration URL
  const publicRegistrationUrl = `/${conference.tenant_slug}/register/${conference.abbreviation}`;

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {conference.name}
            </h1>
            <h2 className="text-lg text-gray-600 dark:text-gray-300 mb-6">
              Conference Registration
            </h2>

            {/* Alumni discount banner */}
            {alumniInfo?.is_alumni && alumniInfo?.has_discount && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md">
                <div className="flex">
                  <div className="shrink-0">
                    <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
                      Alumni Discount Available
                    </h3>
                    <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                      <p>
                        Great news! The ALUMNI discount code has been automatically applied to your
                        registration.
                        {alumniInfo.alumni_conferences &&
                          alumniInfo.alumni_conferences.length > 0 && (
                            <span className="block mt-1">
                              Previous conferences:{' '}
                              {alumniInfo.alumni_conferences
                                .map((c) => c.conference_name)
                                .join(', ')}
                            </span>
                          )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main content */}
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                To complete your registration for this conference, please use the public
                registration portal. Your alumni discount{' '}
                {alumniInfo?.has_discount
                  ? 'will be automatically applied'
                  : 'status has been noted'}
                .
              </p>

              <div className="not-prose mt-6">
                <a
                  href={publicRegistrationUrl}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Continue to Registration Form
                  <svg className="ml-2 -mr-1 w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </a>
              </div>

              <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md">
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  API Integration Available
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  The authenticated registration endpoint is fully functional at:
                  <code className="block mt-2 p-2 bg-blue-100 dark:bg-blue-900/50 rounded text-xs">
                    POST /api/v1/portal/conferences/{'{'}conferenceId{'}'}/register
                  </code>
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                  This endpoint supports multi-attendee registration, alumni discount
                  auto-application, and payment processing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alumni warning modal */}
      {showAlumniModal && alumniInfo && (
        <AlumniModal
          isOpen={showAlumniModal}
          onClose={() => setShowAlumniModal(false)}
          alumniConferences={alumniInfo.alumni_conferences}
          warningMessage={alumniInfo.warning_message || ''}
        />
      )}
    </>
  );
}
