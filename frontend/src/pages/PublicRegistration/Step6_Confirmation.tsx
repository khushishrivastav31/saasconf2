/**
 * Step 6: Confirmation
 *
 * Success message and next steps after registration.
 */
import { useParams } from 'react-router';
import type { PublicConference, PortalRegistrationResponse } from '../../types/publicRegistration';

interface ConfirmationStepProps {
  conference: PublicConference;
  registrationResponse: PortalRegistrationResponse;
}

export default function ConfirmationStep({
  conference,
  registrationResponse,
}: ConfirmationStepProps) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  const portalUrl = `${window.location.origin}/${tenantSlug}/portal/user/login`;

  return (
    <div className="portal-card text-center">
      {/* Success Icon */}
      <div className="mx-auto mb-4 w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
        <svg
          className="w-9 h-9 text-green-600 dark:text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        You're registered!
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        {conference.name} · Check your email for next steps
      </p>

      {/* Custom success message if set by admin */}
      {conference.success_message && (
        <div className="text-left max-w-2xl mx-auto mb-6 text-gray-700 dark:text-gray-300 text-sm space-y-2">
          {conference.success_message.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {/* Portal access CTA */}
      <div className="max-w-sm mx-auto mb-8 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg p-5">
        <p className="text-sm font-medium text-primary-900 dark:text-primary-100 mb-1">
          Attendee Portal
        </p>
        <p className="text-xs text-primary-700 dark:text-primary-300 mb-3">
          Set your password from the email link, then sign in to access your ticket and conference
          materials.
        </p>
        <a
          href={portalUrl}
          className="inline-block w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          Go to Attendee Portal
        </a>
      </div>

      {/* What Happens Next - Modern Card Layout */}
      <div className="my-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 text-center">
          What Happens Next?
        </h2>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Step 1: Check Email */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-3">
              <div className="shrink-0 w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-primary-600 dark:text-primary-400"
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
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Check Your Email
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Each attendee will receive a welcome email with instructions to set up their
                  portal account.
                </p>
              </div>
            </div>
          </div>

          {/* Step 2: Invoice */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-3">
              <div className="shrink-0 w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Invoice Sent
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  The billing contact will receive an invoice via email
                  {registrationResponse.payment_required
                    ? ' (payment has been processed).'
                    : ' with payment instructions.'}
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Portal Access */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-3">
              <div className="shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Set Your Password
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Use the link in your email to set your password and access the attendee portal.
                </p>
              </div>
            </div>
          </div>

          {/* Step 4: Access Materials */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-3">
              <div className="shrink-0 w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Access Your Materials
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  View registration details, download your ticket, and access conference materials
                  through the portal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Registered Attendees - Modern Card Layout */}
      <div className="my-8">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 text-center">
          Registered Attendees
        </h3>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {registrationResponse.registrations.map((reg) => (
            <div
              key={reg.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center space-x-3">
                <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                  {reg.first_name.charAt(0)}
                  {reg.last_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {reg.first_name} {reg.last_name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{reg.email}</p>
                </div>
                <div className="shrink-0">
                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Important Information - Cleaner Design */}
      <div className="max-w-4xl mx-auto bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-5 my-6">
        <div className="flex items-start space-x-3">
          <div className="shrink-0">
            <svg
              className="w-6 h-6 text-yellow-600 dark:text-yellow-400"
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
          <div>
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
              Check Your Spam Folder
            </h3>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              If you don't receive the welcome email within 10 minutes, please check your spam/junk
              folder. Add our email to your contacts to ensure future communications reach your
              inbox.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Support */}
      <div className="mt-8">
        <p className="portal-small-text">
          Questions? Need help?{' '}
          {conference.website ? (
            <a
              href={conference.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Visit our website
            </a>
          ) : (
            'Contact our support team'
          )}
        </p>
      </div>

      {/* Reference Number */}
      <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Registration ID: {registrationResponse.billing_profile_id}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Please reference this ID if you need to contact support.
        </p>
      </div>
    </div>
  );
}
