/**
 * Attendee Section Component
 *
 * Wraps attendee form fields and booking option selection for a single attendee.
 * Matches admin UI with multi-select booking options.
 */
import { useState } from 'react';
import { DeleteIcon } from '../../ConferenceDetail/icons';
import type {
  PortalAttendee,
  PublicBookingOption,
  PublicBookingPeriod,
} from '../../../types/publicRegistration';
import { getCurrentPrice, formatPrice } from '../helpers';
import { PublicSessionSelector } from './SessionSelector';
import { validateEmail, validatePhone } from '../../../utils/validators';

interface AttendeeSectionProps {
  attendee: PortalAttendee;
  index: number;
  bookingOptions: PublicBookingOption[];
  bookingPeriods: PublicBookingPeriod[];
  currency: string;
  tenantSlug: string;
  conferenceSlug: string;
  sessionSelections?: Record<string, Record<string, string>>;
  onSessionChange?: (optionId: string, selections: Record<string, string>) => void;
  onChange: (attendee: PortalAttendee) => void;
  onRemove?: () => void;
  canRemove: boolean;
}

export default function AttendeeSection({
  attendee,
  index,
  bookingOptions,
  bookingPeriods,
  tenantSlug,
  conferenceSlug,
  sessionSelections,
  onSessionChange,
  onChange,
  onRemove,
  canRemove,
}: AttendeeSectionProps) {
  // Validation state
  const [emailValidated, setEmailValidated] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneValidated, setPhoneValidated] = useState<boolean | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const toggleBookingOption = (optionId: string) => {
    const currentIds = attendee.booking_option_ids || [];
    const newIds = currentIds.includes(optionId)
      ? currentIds.filter((id) => id !== optionId)
      : [...currentIds, optionId];
    onChange({ ...attendee, booking_option_ids: newIds });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      {/* Header with attendee number and remove button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Attendee {index + 1}
        </h3>
        {canRemove && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium flex items-center gap-1"
          >
            <DeleteIcon />
            Remove
          </button>
        )}
      </div>

      {/* Attendee fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label
            htmlFor={`attendee-${index}-first_name`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            First Name *
          </label>
          <input
            id={`attendee-${index}-first_name`}
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
            value={attendee.first_name}
            onChange={(e) => onChange({ ...attendee, first_name: e.target.value })}
          />
        </div>

        <div>
          <label
            htmlFor={`attendee-${index}-last_name`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Last Name *
          </label>
          <input
            id={`attendee-${index}-last_name`}
            type="text"
            required
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
            value={attendee.last_name}
            onChange={(e) => onChange({ ...attendee, last_name: e.target.value })}
          />
        </div>

        <div>
          <label
            htmlFor={`attendee-${index}-email`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email *
          </label>
          <div className="relative">
            <input
              id={`attendee-${index}-email`}
              type="email"
              required
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100 ${
                emailValidated === true
                  ? 'border-green-500 dark:border-green-600 focus:border-green-500 focus:ring-green-500'
                  : emailError
                    ? 'border-red-300 dark:border-red-600'
                    : 'border-gray-300 dark:border-gray-600'
              }`}
              value={attendee.email}
              onChange={(e) => {
                onChange({ ...attendee, email: e.target.value });
                setEmailError(null);
                setEmailValidated(null);
              }}
              onBlur={(e) => {
                const error = validateEmail(e.target.value);
                if (error) {
                  setEmailError(error);
                  setEmailValidated(false);
                } else {
                  setEmailError(null);
                  setEmailValidated(true);
                }
              }}
            />
            {/* Validation icon */}
            {emailValidated === true && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
            {emailValidated === false && emailError && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>
          {emailError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailError}</p>
          )}
        </div>

        <div>
          <label
            htmlFor={`attendee-${index}-phone`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Phone
          </label>
          <div className="relative">
            <input
              id={`attendee-${index}-phone`}
              type="tel"
              placeholder="+49123456789"
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100 ${
                phoneValidated === true
                  ? 'border-green-500 dark:border-green-600 focus:border-green-500 focus:ring-green-500'
                  : phoneError
                    ? 'border-red-300 dark:border-red-600'
                    : 'border-gray-300 dark:border-gray-600'
              }`}
              value={attendee.phone || ''}
              onChange={(e) => {
                onChange({ ...attendee, phone: e.target.value });
                setPhoneError(null);
                setPhoneValidated(null);
              }}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value) {
                  const error = validatePhone(value);
                  if (error) {
                    setPhoneError(error);
                    setPhoneValidated(false);
                  } else {
                    setPhoneError(null);
                    setPhoneValidated(true);
                  }
                } else {
                  // Phone is optional for attendees, so clear validation if empty
                  setPhoneError(null);
                  setPhoneValidated(null);
                }
              }}
            />
            {/* Validation icon */}
            {phoneValidated === true && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
            {phoneValidated === false && phoneError && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>
          {phoneError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{phoneError}</p>
          )}
          {!phoneError && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Optional. Use international format (e.g. +49123456789)
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`attendee-${index}-job_title`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Job Title
          </label>
          <input
            id={`attendee-${index}-job_title`}
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
            value={attendee.job_title || ''}
            onChange={(e) => onChange({ ...attendee, job_title: e.target.value })}
          />
        </div>

        <div>
          <label
            htmlFor={`attendee-${index}-department`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Department
          </label>
          <input
            id={`attendee-${index}-department`}
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
            value={attendee.department || ''}
            onChange={(e) => onChange({ ...attendee, department: e.target.value })}
          />
        </div>
      </div>

      {/* Booking options - multi-select matching admin UI */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Booking Option *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bookingOptions.map((option) => {
            const isSelected = (attendee.booking_option_ids || []).includes(option.id);
            const priceInfo = getCurrentPrice(option.id, bookingPeriods);

            return (
              <div
                key={option.id}
                className={`relative flex flex-col items-start text-left rounded-lg border-2 p-4 transition-all ${
                  isSelected
                    ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleBookingOption(option.id)}
                  className="w-full flex flex-col items-start text-left"
                >
                  {/* Checkbox indicator */}
                  <span
                    className={`absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded border-2 ${
                      isSelected
                        ? 'border-primary-600 bg-primary-600'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                      </svg>
                    )}
                  </span>

                  {/* Option name */}
                  <span
                    className={`text-sm font-semibold pr-6 ${isSelected ? 'text-primary-900' : 'text-gray-900 dark:text-gray-100'}`}
                  >
                    {option.name}
                  </span>

                  {/* Price with period name */}
                  {priceInfo && (
                    <span
                      className={`mt-1 text-sm font-medium ${isSelected ? 'text-primary-700' : 'text-gray-600 dark:text-gray-300'}`}
                    >
                      {formatPrice(priceInfo.price, priceInfo.currency)}
                      <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">
                        ({priceInfo.periodName})
                      </span>
                    </span>
                  )}

                  {/* Description */}
                  {option.description && (
                    <span className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      {option.description}
                    </span>
                  )}
                </button>

                {/* Session selector for booking options with conference days */}
                {isSelected && option.conference_day_id && sessionSelections && onSessionChange && (
                  <div className="mt-3">
                    <PublicSessionSelector
                      tenantSlug={tenantSlug}
                      conferenceSlug={conferenceSlug}
                      optionId={option.id}
                      selections={sessionSelections[option.id] || {}}
                      onChange={(sel) => onSessionChange(option.id, sel)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
