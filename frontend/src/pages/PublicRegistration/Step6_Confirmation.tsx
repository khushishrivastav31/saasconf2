/**
 * Step 6: Confirmation
 *
 * Success message and next steps after registration.
 */
import type { PublicConference, PortalRegistrationResponse } from '../../types/publicRegistration';

interface ConfirmationStepProps {
  conference: PublicConference;
  registrationResponse: PortalRegistrationResponse;
}

export default function ConfirmationStep({
  conference,
  registrationResponse,
}: ConfirmationStepProps) {
  return (
    <div className="portal-card text-center">
      {/* Success Icon */}
      <div className="portal-success-icon mx-auto mb-6">
        <svg
          className="w-16 h-16 text-green-500 mx-auto"
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

      {/* Success Message */}
      <h1 className="portal-heading">Registration Successful!</h1>
      <p className="portal-success-message">Thank you for registering for {conference.name}</p>

      {/* What Happens Next */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 my-8 text-left">
        <h2 className="portal-subheading text-center mb-4">What Happens Next?</h2>
        <ol className="list-decimal list-inside space-y-3 text-blue-900 dark:text-blue-100">
          <li>
            <strong>Check Your Email:</strong> Each attendee will receive a welcome email with
            instructions to set up their portal account.
          </li>
          <li>
            <strong>Invoice:</strong> The billing contact will receive an invoice via email
            {registrationResponse.payment_required
              ? ' (payment has been processed).'
              : ' with payment instructions.'}
          </li>
          <li>
            <strong>Portal Access:</strong> Use the link in your email to set your password and
            access the attendee portal.
          </li>
          <li>
            <strong>Confirmation:</strong> You'll be able to view your registration details,
            download your ticket, and access conference materials through the portal.
          </li>
        </ol>
      </div>

      {/* Registrations Summary */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 my-8 text-left">
        <h3 className="portal-subheading mb-4">Registered Attendees</h3>
        <div className="space-y-2">
          {registrationResponse.registrations.map((reg) => (
            <div
              key={reg.id}
              className="flex justify-between items-center py-2 border-b dark:border-gray-700 last:border-b-0"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {reg.first_name} {reg.last_name}
                </p>
                <p className="portal-small-text">{reg.email}</p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Registered
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Important Information */}
      <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 my-6 text-left">
        <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
          📧 Check Your Spam Folder
        </h3>
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          If you don't receive the welcome email within 10 minutes, please check your spam/junk
          folder. Add our email to your contacts to ensure future communications reach your inbox.
        </p>
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
