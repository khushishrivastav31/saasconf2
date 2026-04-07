/**
 * Training Registration Confirmation
 */
import { useLocation, useNavigate } from 'react-router';

interface RegistrationResult {
  registration_id: string;
  status: string;
  training_name: string;
  attendee_count: number;
  total: string;
  currency: string;
  payment_method: string;
}

export default function TrainingConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.registrationResult as RegistrationResult | undefined;

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">No registration data</div>
      </div>
    );
  }

  const currencySymbol =
    result.currency === 'EUR' ? '\u20AC' : result.currency === 'USD' ? '$' : result.currency;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 max-w-lg w-full text-center">
        {/* Success icon */}
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Registration Successful!
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Thank you for registering for <strong>{result.training_name}</strong>.
          {result.payment_method === 'bank_transfer'
            ? ' You will receive an invoice via email with payment instructions.'
            : ' Your payment has been processed.'}
        </p>

        <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-4 text-left space-y-2 text-sm mb-6">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Training</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {result.training_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Attendees</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {result.attendee_count}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Total</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {currencySymbol}{' '}
              {Number(result.total).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Payment</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {result.payment_method === 'bank_transfer' ? 'Bank Transfer' : 'Credit Card'}
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('../../', { replace: true })}
          className="px-6 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
        >
          Browse more trainings
        </button>
      </div>
    </div>
  );
}
