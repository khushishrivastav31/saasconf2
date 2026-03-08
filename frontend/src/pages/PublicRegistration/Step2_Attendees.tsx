/**
 * Step 2: Attendees
 *
 * Multi-attendee form (add/remove attendees, select booking options).
 */
import { useForm, useFieldArray, type FieldArrayWithId } from 'react-hook-form';
import type { PublicConference, PortalAttendee } from '../../types/publicRegistration';

interface AttendeesStepProps {
  conference: PublicConference;
  attendees: PortalAttendee[];
  onNext: (attendees: PortalAttendee[]) => void;
  onBack: () => void;
}

export default function AttendeesStep({
  conference,
  attendees,
  onNext,
  onBack,
}: AttendeesStepProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<{ attendees: PortalAttendee[] }>({
    defaultValues: {
      attendees:
        attendees.length > 0
          ? attendees
          : [
              {
                first_name: '',
                last_name: '',
                email: '',
                booking_option_id: conference.booking_options[0]?.id || '',
              },
            ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'attendees',
  });

  const onSubmit = (data: { attendees: PortalAttendee[] }) => {
    onNext(data.attendees);
  };

  const addAttendee = () => {
    append({
      first_name: '',
      last_name: '',
      email: '',
      booking_option_id: conference.booking_options[0]?.id || '',
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="portal-card">
        <h2 className="portal-heading">Attendee Information</h2>
        <p className="portal-text">
          Add one or more attendees. Each attendee will receive a separate welcome email with login
          credentials.
        </p>

        <div className="mt-6 space-y-6">
          {fields.map(
            (
              field: FieldArrayWithId<{ attendees: PortalAttendee[] }, 'attendees'>,
              index: number
            ) => (
              <div key={field.id} className="portal-attendee-item">
                <div className="portal-attendee-header">
                  <div className="portal-attendee-number">Attendee #{index + 1}</div>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="portal-attendee-remove"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {/* First Name */}
                  <div className="portal-form-group">
                    <label className="portal-label portal-label-required">First Name</label>
                    <input
                      {...register(`attendees.${index}.first_name`, {
                        required: 'First name is required',
                        maxLength: { value: 255, message: 'Max 255 characters' },
                      })}
                      className={`portal-input ${
                        errors.attendees?.[index]?.first_name ? 'portal-input-error' : ''
                      }`}
                      placeholder="John"
                    />
                    {errors.attendees?.[index]?.first_name && (
                      <p className="portal-error-message">
                        {errors.attendees[index]?.first_name?.message}
                      </p>
                    )}
                  </div>

                  {/* Last Name */}
                  <div className="portal-form-group">
                    <label className="portal-label portal-label-required">Last Name</label>
                    <input
                      {...register(`attendees.${index}.last_name`, {
                        required: 'Last name is required',
                        maxLength: { value: 255, message: 'Max 255 characters' },
                      })}
                      className={`portal-input ${
                        errors.attendees?.[index]?.last_name ? 'portal-input-error' : ''
                      }`}
                      placeholder="Doe"
                    />
                    {errors.attendees?.[index]?.last_name && (
                      <p className="portal-error-message">
                        {errors.attendees[index]?.last_name?.message}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="portal-form-group">
                    <label className="portal-label portal-label-required">Email</label>
                    <input
                      type="email"
                      {...register(`attendees.${index}.email`, {
                        required: 'Email is required',
                        pattern: {
                          value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                          message: 'Invalid email address',
                        },
                      })}
                      className={`portal-input ${
                        errors.attendees?.[index]?.email ? 'portal-input-error' : ''
                      }`}
                      placeholder="john.doe@example.com"
                    />
                    {errors.attendees?.[index]?.email && (
                      <p className="portal-error-message">
                        {errors.attendees[index]?.email?.message}
                      </p>
                    )}
                  </div>

                  {/* Phone (optional) */}
                  <div className="portal-form-group">
                    <label className="portal-label">Phone</label>
                    <input
                      {...register(`attendees.${index}.phone`, {
                        maxLength: { value: 50, message: 'Max 50 characters' },
                      })}
                      className="portal-input"
                      placeholder="+1 234 567 8900"
                    />
                  </div>

                  {/* Booking Option */}
                  <div className="portal-form-group md:col-span-2">
                    <label className="portal-label portal-label-required">Registration Type</label>
                    <select
                      {...register(`attendees.${index}.booking_option_id`, {
                        required: 'Please select a registration type',
                      })}
                      className={`portal-select ${
                        errors.attendees?.[index]?.booking_option_id ? 'portal-input-error' : ''
                      }`}
                    >
                      {conference.booking_options.map((option) => (
                        <option key={option.id} value={option.id} disabled={option.is_sold_out}>
                          {option.name} - {conference.currency} {option.price.toFixed(2)}
                          {option.is_sold_out ? ' (SOLD OUT)' : ''}
                        </option>
                      ))}
                    </select>
                    {errors.attendees?.[index]?.booking_option_id && (
                      <p className="portal-error-message">
                        {errors.attendees[index]?.booking_option_id?.message}
                      </p>
                    )}
                  </div>

                  {/* Job Title (optional) */}
                  <div className="portal-form-group">
                    <label className="portal-label">Job Title</label>
                    <input
                      {...register(`attendees.${index}.job_title`, {
                        maxLength: { value: 255, message: 'Max 255 characters' },
                      })}
                      className="portal-input"
                      placeholder="Software Engineer"
                    />
                  </div>

                  {/* Department (optional) */}
                  <div className="portal-form-group">
                    <label className="portal-label">Department</label>
                    <input
                      {...register(`attendees.${index}.department`, {
                        maxLength: { value: 255, message: 'Max 255 characters' },
                      })}
                      className="portal-input"
                      placeholder="Engineering"
                    />
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Add Attendee Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={addAttendee}
            className="portal-button portal-button-secondary"
          >
            + Add Another Attendee
          </button>
        </div>

        {/* Navigation */}
        <div className="portal-button-group mt-8">
          <button type="button" onClick={onBack} className="portal-button portal-button-secondary">
            ← Back
          </button>
          <button type="submit" className="portal-button portal-button-primary">
            Continue →
          </button>
        </div>
      </div>
    </form>
  );
}
