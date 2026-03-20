/**
 * Alumni Modal Component
 *
 * Shows a warning when user is alumni but ALUMNI discount code is not available.
 */

interface AlumniConference {
  conference_id: string;
  conference_name: string;
  conference_abbreviation: string;
}

interface AlumniModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumniConferences: AlumniConference[];
  warningMessage: string;
}

export default function AlumniModal({
  isOpen,
  onClose,
  alumniConferences,
  warningMessage,
}: AlumniModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mb-4">
            <svg
              className="h-6 w-6 text-yellow-600 dark:text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-lg font-medium text-center text-gray-900 dark:text-gray-100 mb-2">
            Alumni Discount Unavailable
          </h3>

          {/* Message */}
          <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4">
            {warningMessage}
          </p>

          {/* Alumni conferences list */}
          {alumniConferences.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3 mb-4">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Your conference history:
              </p>
              <ul className="space-y-1">
                {alumniConferences.slice(0, 5).map((conf) => (
                  <li key={conf.conference_id} className="text-sm text-gray-600 dark:text-gray-300">
                    • {conf.conference_name}
                  </li>
                ))}
                {alumniConferences.length > 5 && (
                  <li className="text-sm text-gray-500 dark:text-gray-500 italic">
                    and {alumniConferences.length - 5} more...
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Continue with Registration
          </button>
        </div>
      </div>
    </div>
  );
}
