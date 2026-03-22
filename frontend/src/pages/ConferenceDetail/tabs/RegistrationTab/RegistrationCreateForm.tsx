import type {
  Conference,
  UnifiedAttendeeData,
  BillingProfileCreate,
  BookingOption,
  BookingPeriod,
  DiscountCodeValidation,
  VatCalculation,
} from '../../../../types';
import type {
  PortalAttendee,
  PublicBookingPeriod,
  PublicBookingOption,
} from '../../../../types/publicRegistration';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import { ButtonSpinner } from '../../../../components/common/LoadingSpinner';
import { emptyUnifiedAttendee } from './helpers';
import AttendeeFields from './AttendeeFields';
import BillingFields from './BillingFields';
import BookingOptionSelect from './BookingOptionSelect';
import OrderSummary from '../../../PublicRegistration/components/OrderSummary';

interface RegistrationCreateFormProps {
  conference: Conference;
  options: BookingOption[];
  periods: BookingPeriod[];
  error: string | null;
  isCreating: boolean;
  // Form state
  attendees: UnifiedAttendeeData[];
  setAttendees: React.Dispatch<React.SetStateAction<UnifiedAttendeeData[]>>;
  attendeeOptionIds: string[][];
  setAttendeeOptionIds: React.Dispatch<React.SetStateAction<string[][]>>;
  attendeeSessionSelections: Record<string, Record<string, string>>[];
  setAttendeeSessionSelections: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, string>>[]>
  >;
  billing: BillingProfileCreate;
  setBilling: React.Dispatch<React.SetStateAction<BillingProfileCreate>>;
  discountValidation: DiscountCodeValidation | null;
  vatCalculation: VatCalculation | null;
  publicBookingOptions: PublicBookingOption[];
  publicBookingPeriods: PublicBookingPeriod[];
  portalAttendees: PortalAttendee[];
  // Callbacks
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function RegistrationCreateForm({
  conference,
  options,
  periods,
  error,
  isCreating,
  attendees,
  setAttendees,
  attendeeOptionIds,
  setAttendeeOptionIds,
  attendeeSessionSelections,
  setAttendeeSessionSelections,
  billing,
  setBilling,
  discountValidation,
  vatCalculation,
  publicBookingOptions,
  publicBookingPeriods,
  portalAttendees,
  onCancel,
  onSubmit,
}: RegistrationCreateFormProps) {
  return (
    <div>
      <button
        onClick={onCancel}
        className="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to list
      </button>

      <ErrorBanner message={error} />

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Attendee(s) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            New Registration
          </h3>

          {attendees.map((att, idx) => (
            <div
              key={idx}
              className={
                attendees.length > 1
                  ? 'mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700'
                  : ''
              }
            >
              {attendees.length > 1 && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    Attendee {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttendees(attendees.filter((_, i) => i !== idx));
                      setAttendeeOptionIds(attendeeOptionIds.filter((_, i) => i !== idx));
                      setAttendeeSessionSelections(
                        attendeeSessionSelections.filter((_, i) => i !== idx)
                      );
                    }}
                    className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              )}

              {attendees.length === 1 && (
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Attendee
                </h4>
              )}

              <AttendeeFields
                prefix={attendees.length > 1 ? `att-${idx}` : undefined}
                data={att}
                conferenceId={conference.id}
                onChange={(d) => {
                  const updated = [...attendees];
                  updated[idx] = { ...updated[idx], ...d };
                  setAttendees(updated);
                }}
              />

              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Booking Option *
                </label>
                <BookingOptionSelect
                  options={options}
                  periods={periods}
                  value={attendeeOptionIds[idx] || []}
                  onChange={(ids) => {
                    const updated = [...attendeeOptionIds];
                    updated[idx] = ids;
                    setAttendeeOptionIds(updated);
                    // Clear session selections for removed options
                    const currentSessions = attendeeSessionSelections[idx] || {};
                    const updatedSessions = [...attendeeSessionSelections];
                    const newSessions: Record<string, Record<string, string>> = {};
                    ids.forEach((id) => {
                      if (currentSessions[id]) {
                        newSessions[id] = currentSessions[id];
                      }
                    });
                    updatedSessions[idx] = newSessions;
                    setAttendeeSessionSelections(updatedSessions);
                  }}
                  conferenceId={conference.id}
                  sessionSelections={attendeeSessionSelections[idx] || {}}
                  onSessionChange={(optionId: string, sel: Record<string, string>) => {
                    const updated = [...attendeeSessionSelections];
                    const currentMap = updated[idx] || {};
                    updated[idx] = { ...currentMap, [optionId]: sel };
                    setAttendeeSessionSelections(updated);
                  }}
                  required
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              setAttendees([...attendees, { ...emptyUnifiedAttendee }]);
              setAttendeeOptionIds([...attendeeOptionIds, []]);
              setAttendeeSessionSelections([...attendeeSessionSelections, {}]);
            }}
            className="mt-4 text-sm text-primary-600 hover:text-primary-800"
          >
            + Add Another Attendee
          </button>
        </div>

        {/* Billing section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Billing Information
            </h4>
            {attendees.length === 1 && (
              <button
                type="button"
                onClick={() => {
                  const attendee = attendees[0];
                  const updatedBilling = {
                    ...billing,
                    contact_first_name: attendee.first_name,
                    contact_last_name: attendee.last_name,
                    contact_email: attendee.email,
                    contact_phone: attendee.phone || '',
                  };
                  setBilling(updatedBilling);
                }}
                className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
              >
                {'\uD83D\uDCCB'} Use Attendee Info
              </button>
            )}
          </div>
          <BillingFields data={billing} onChange={setBilling} conference={conference} />
        </div>

        {/* Order Summary - reusing component from public registration */}
        <OrderSummary
          attendees={portalAttendees}
          bookingOptions={publicBookingOptions}
          bookingPeriods={publicBookingPeriods}
          currency={conference.currency || 'EUR'}
          discount={discountValidation}
          vatCalculation={vatCalculation}
        />

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
          >
            {isCreating ? (
              <ButtonSpinner label="Creating..." />
            ) : attendees.length > 1 ? (
              `Register ${attendees.length} Attendees`
            ) : (
              'Register Attendee'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
