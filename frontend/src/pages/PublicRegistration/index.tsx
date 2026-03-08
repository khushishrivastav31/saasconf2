/**
 * Public Registration Portal
 *
 * Multi-step wizard for conference registration (no authentication required).
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { usePortalCSS } from './hooks/usePortalCSS';
import { useConferencePublic } from './hooks/useConferencePublic';
import type {
  PortalAttendee,
  PortalBilling,
  PortalRegistrationResponse,
} from '../../types/publicRegistration';

import WelcomeStep from './Step1_Welcome';
import AttendeesStep from './Step2_Attendees';
import BillingStep from './Step3_Billing';
import ReviewStep from './Step4_Review';
import PaymentStep from './Step5_Payment';
import ConfirmationStep from './Step6_Confirmation';
import ProgressIndicator from './components/ProgressIndicator';

type Step = 'welcome' | 'attendees' | 'billing' | 'review' | 'payment' | 'confirmation';

// reCAPTCHA site key (public key, safe to expose)
const RECAPTCHA_SITE_KEY =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // Test key for development

function RegistrationWizard() {
  const { tenantSlug, conferenceSlug } = useParams<{
    tenantSlug: string;
    conferenceSlug: string;
  }>();
  const navigate = useNavigate();

  // Load custom CSS
  usePortalCSS(tenantSlug!, conferenceSlug!);

  // Fetch conference data
  const { data: conference, isLoading, error } = useConferencePublic(tenantSlug!, conferenceSlug!);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [attendees, setAttendees] = useState<PortalAttendee[]>([]);
  const [billing, setBilling] = useState<PortalBilling | null>(null);
  const [registrationResponse, setRegistrationResponse] =
    useState<PortalRegistrationResponse | null>(null);
  const [formStartTime] = useState<number>(Date.now() / 1000);

  // Redirect if missing params
  useEffect(() => {
    if (!tenantSlug || !conferenceSlug) {
      navigate('/');
    }
  }, [tenantSlug, conferenceSlug, navigate]);

  // Step navigation
  const goToStep = (step: Step) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="portal-registration portal-page">
        <div className="portal-container">
          <div className="portal-card">
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !conference) {
    return (
      <div className="portal-registration portal-page">
        <div className="portal-container">
          <div className="portal-card">
            <h1 className="portal-heading text-red-600">Conference Not Found</h1>
            <p className="portal-text">
              {error ? (error as Error).message : 'The requested conference could not be found.'}
            </p>
            <button
              onClick={() => navigate('/')}
              className="portal-button portal-button-secondary mt-4"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-registration portal-page">
      <div className="portal-container">
        {/* Progress Indicator (hide on welcome and confirmation) */}
        {currentStep !== 'welcome' && currentStep !== 'confirmation' && (
          <ProgressIndicator currentStep={currentStep} />
        )}

        {/* Wizard Steps */}
        {currentStep === 'welcome' && (
          <WelcomeStep conference={conference} onNext={() => goToStep('attendees')} />
        )}

        {currentStep === 'attendees' && (
          <AttendeesStep
            conference={conference}
            attendees={attendees}
            onNext={(newAttendees) => {
              setAttendees(newAttendees);
              goToStep('billing');
            }}
            onBack={() => goToStep('welcome')}
          />
        )}

        {currentStep === 'billing' && (
          <BillingStep
            billing={billing}
            onNext={(newBilling) => {
              setBilling(newBilling);
              goToStep('review');
            }}
            onBack={() => goToStep('attendees')}
          />
        )}

        {currentStep === 'review' && billing && (
          <ReviewStep
            conference={conference}
            attendees={attendees}
            billing={billing}
            formStartTime={formStartTime}
            onNext={(response) => {
              setRegistrationResponse(response);
              if (response.payment_required) {
                goToStep('payment');
              } else {
                goToStep('confirmation');
              }
            }}
            onBack={() => goToStep('billing')}
          />
        )}

        {currentStep === 'payment' && registrationResponse && (
          <PaymentStep
            registrationResponse={registrationResponse}
            onSuccess={() => goToStep('confirmation')}
            onBack={() => goToStep('review')}
          />
        )}

        {currentStep === 'confirmation' && registrationResponse && (
          <ConfirmationStep conference={conference} registrationResponse={registrationResponse} />
        )}
      </div>
    </div>
  );
}

// Export with reCAPTCHA provider wrapper
export default function PublicRegistrationPage() {
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      <RegistrationWizard />
    </GoogleReCaptchaProvider>
  );
}
