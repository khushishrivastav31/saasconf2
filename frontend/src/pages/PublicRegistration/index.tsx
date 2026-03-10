/**
 * Public Registration Portal
 *
 * Single-page form for conference registration (no authentication required).
 */
import { useEffect } from 'react';
import { useParams, useNavigate, Routes, Route, useLocation } from 'react-router';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { usePortalCSS } from './hooks/usePortalCSS';
import { useConferencePublic } from './hooks/useConferencePublic';
import SinglePageForm from './SinglePageForm';
import PaymentStep from './Step5_Payment';
import ConfirmationStep from './Step6_Confirmation';

// reCAPTCHA site key (public key, safe to expose)
const RECAPTCHA_SITE_KEY =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // Test key for development

function RegistrationPortal() {
  const { tenantSlug, conferenceSlug } = useParams<{
    tenantSlug: string;
    conferenceSlug: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Load custom CSS
  usePortalCSS(tenantSlug!, conferenceSlug!);

  // Fetch conference data
  const { data: conference, isLoading, error } = useConferencePublic(tenantSlug!, conferenceSlug!);

  // Redirect if missing params
  useEffect(() => {
    if (!tenantSlug || !conferenceSlug) {
      navigate('/');
    }
  }, [tenantSlug, conferenceSlug, navigate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Error state
  if (error || !conference) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
            Conference Not Found
          </h1>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            {error ? (error as Error).message : 'The requested conference could not be found.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const registrationResponse = location.state?.registrationResponse;

  return (
    <Routes>
      <Route
        index
        element={
          <SinglePageForm
            conference={conference}
            tenantSlug={tenantSlug!}
            conferenceSlug={conferenceSlug!}
          />
        }
      />
      <Route
        path="payment"
        element={
          registrationResponse ? (
            <PaymentStep
              registrationResponse={registrationResponse}
              onSuccess={() =>
                navigate('../confirmation', { state: { registrationResponse }, replace: true })
              }
              onBack={() => navigate(-1)}
            />
          ) : (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
              <div className="text-gray-700 dark:text-gray-300">Invalid access</div>
            </div>
          )
        }
      />
      <Route
        path="confirmation"
        element={
          registrationResponse ? (
            <ConfirmationStep conference={conference} registrationResponse={registrationResponse} />
          ) : (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
              <div className="text-gray-700 dark:text-gray-300">Invalid access</div>
            </div>
          )
        }
      />
    </Routes>
  );
}

// Export with reCAPTCHA provider wrapper
export default function PublicRegistrationPage() {
  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={RECAPTCHA_SITE_KEY}
      scriptProps={{
        async: true,
        defer: true,
        appendTo: 'head',
      }}
    >
      <RegistrationPortal />
    </GoogleReCaptchaProvider>
  );
}
