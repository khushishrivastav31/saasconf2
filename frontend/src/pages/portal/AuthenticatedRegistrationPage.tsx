/**
 * Authenticated Registration Page
 *
 * Registration page for logged-in portal users with alumni discount support.
 * Shows simplified registration UI with alumni discount auto-application.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import AlumniModal from '../../components/portal/AlumniModal';
import AuthenticatedRegistrationForm from './AuthenticatedRegistrationForm';

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

export default function AuthenticatedRegistrationPage() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const navigate = useNavigate();
  const { applicant, isLoading: authLoading } = useApplicantAuth();
  const [showAlumniModal, setShowAlumniModal] = useState(false);
  const [alumniInfo, setAlumniInfo] = useState<AlumniCheckResponse | null>(null);
  const [alumniCheckDone, setAlumniCheckDone] = useState(false);

  // Check if user is alumni and if ALUMNI discount exists
  useEffect(() => {
    if (!conferenceId || !applicant || alumniCheckDone) return;

    async function checkAlumni() {
      try {
        const response = await portalApi.get<AlumniCheckResponse>(
          `/portal/conferences/${conferenceId}/alumni-check`
        );
        const alumniData = response.data;
        setAlumniInfo(alumniData);
        setAlumniCheckDone(true);

        // Show alumni modal if user is alumni but no discount available
        if (alumniData.is_alumni && !alumniData.has_discount && alumniData.warning_message) {
          setShowAlumniModal(true);
        }
      } catch (error) {
        console.error('Failed to check alumni status:', error);
        setAlumniCheckDone(true);
      }
    }

    checkAlumni();
  }, [conferenceId, applicant, alumniCheckDone]);

  if (authLoading || !alumniCheckDone) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading registration...</p>
        </div>
      </div>
    );
  }

  if (!applicant) {
    // Not logged in - redirect to portal login
    const slug = window.location.pathname.split('/').filter(Boolean)[0] || '';
    navigate(`/${slug}/portal/user/login`, { replace: true });
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Conference Registration
            </h1>

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
                      Alumni Discount Applied
                    </h3>
                    <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                      <p>
                        The ALUMNI discount code has been automatically applied to your
                        registration.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Registration Form */}
            <AuthenticatedRegistrationForm conferenceId={conferenceId!} alumniInfo={alumniInfo} />
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
