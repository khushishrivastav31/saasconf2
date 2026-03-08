/**
 * Step 1: Welcome
 *
 * Conference information and pricing preview.
 */
import type { PublicConference } from '../../types/publicRegistration';

interface WelcomeStepProps {
  conference: PublicConference;
  onNext: () => void;
}

export default function WelcomeStep({ conference, onNext }: WelcomeStepProps) {
  return (
    <div className="portal-card">
      <h1 className="portal-heading">{conference.name}</h1>

      {conference.description && <p className="portal-text">{conference.description}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        {conference.start_date && (
          <div>
            <h3 className="portal-label">Dates</h3>
            <p className="portal-text">
              {new Date(conference.start_date).toLocaleDateString()} -{' '}
              {new Date(conference.end_date).toLocaleDateString()}
            </p>
          </div>
        )}

        {conference.location && (
          <div>
            <h3 className="portal-label">Location</h3>
            <p className="portal-text">{conference.location}</p>
          </div>
        )}
      </div>

      {/* Booking Options */}
      <div className="mt-8">
        <h2 className="portal-subheading">Registration Options</h2>

        <div className="space-y-4">
          {conference.booking_options.map((option) => (
            <div
              key={option.id}
              className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {option.name}
                  </h3>
                  {option.description && (
                    <p className="portal-small-text mt-1">{option.description}</p>
                  )}
                  {option.capacity && (
                    <p className="portal-small-text mt-2">
                      {option.is_sold_out ? (
                        <span className="text-red-600 font-semibold">SOLD OUT</span>
                      ) : (
                        <span>
                          {option.current_registrations} / {option.capacity} registered
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {conference.currency} {option.price.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Start Registration Button */}
      <div className="mt-8 flex justify-end">
        <button onClick={onNext} className="portal-button portal-button-primary">
          Start Registration →
        </button>
      </div>
    </div>
  );
}
