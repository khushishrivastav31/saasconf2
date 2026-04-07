/**
 * Training Registration Form
 *
 * Single-page form for registering attendees to a training.
 * Follows the same pattern as conference SinglePageForm.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import publicApi from '../../config/publicApi';
import type { PublicTraining } from './TrainingSearch';

interface Attendee {
  first_name: string;
  last_name: string;
  email: string;
}

interface BillingInfo {
  company_name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  vat_number: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  payment_method: string;
}

const emptyAttendee: Attendee = { first_name: '', last_name: '', email: '' };
const emptyBilling: BillingInfo = {
  company_name: '',
  street: '',
  postal_code: '',
  city: '',
  country: '',
  vat_number: '',
  contact_first_name: '',
  contact_last_name: '',
  contact_email: '',
  contact_phone: '',
  payment_method: 'bank_transfer',
};

interface TrainingRegistrationFormProps {
  tenantSlug: string;
}

const TrainingRegistrationForm = React.memo(function TrainingRegistrationForm({
  tenantSlug,
}: TrainingRegistrationFormProps) {
  const { placementId } = useParams<{ placementId: string }>();
  const navigate = useNavigate();

  const [attendees, setAttendees] = useState<Attendee[]>([{ ...emptyAttendee }]);
  const [billing, setBilling] = useState<BillingInfo>({ ...emptyBilling });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch training detail
  const { data: training, isLoading } = useQuery<PublicTraining>({
    queryKey: ['public-training-detail', tenantSlug, placementId],
    queryFn: async () => {
      const res = await publicApi.get(`/portal/${tenantSlug}/trainings/${placementId}`);
      return res.data;
    },
    enabled: !!placementId,
  });

  // Registration mutation
  const registerMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await publicApi.post(`/portal/${tenantSlug}/trainings/register`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      navigate('../confirmation', { state: { registrationResult: data }, replace: true });
    },
    onError: (err: Error) => {
      setError(err.message || 'Registration failed. Please try again.');
    },
  });

  // Attendee management
  const addAttendee = useCallback(() => {
    setAttendees((prev) => [...prev, { ...emptyAttendee }]);
  }, []);

  const removeAttendee = useCallback((index: number) => {
    setAttendees((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateAttendee = useCallback((index: number, field: keyof Attendee, value: string) => {
    setAttendees((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }, []);

  // Bulk add attendees
  const parseBulk = useCallback(() => {
    const lines = bulkText.split('\n').filter((l) => l.trim());
    const parsed: Attendee[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t;]+/).map((s) => s.trim());
      if (parts.length >= 3) {
        parsed.push({ first_name: parts[0], last_name: parts[1], email: parts[2] });
      } else if (parts.length === 2) {
        parsed.push({ first_name: parts[0], last_name: parts[1], email: '' });
      }
    }
    if (parsed.length > 0) {
      setAttendees((prev) => [...prev, ...parsed]);
      setBulkText('');
      setBulkMode(false);
    }
  }, [bulkText]);

  // Copy first attendee to billing
  const copyFromFirstAttendee = useCallback(() => {
    const first = attendees[0];
    if (first) {
      setBilling((prev) => ({
        ...prev,
        contact_first_name: first.first_name,
        contact_last_name: first.last_name,
        contact_email: first.email,
      }));
    }
  }, [attendees]);

  // Pricing
  const pricePerPerson = useMemo(() => {
    if (!training) return 0;
    return Number(training.early_bird_price || training.regular_price || 0);
  }, [training]);

  const totalPrice = pricePerPerson * attendees.length;
  const currency = training?.currency || 'EUR';
  const currencySymbol = currency === 'EUR' ? '\u20AC' : currency === 'USD' ? '$' : currency;

  // Submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      // Basic validation
      for (const att of attendees) {
        if (!att.first_name || !att.last_name || !att.email) {
          setError('Please fill in all attendee fields (first name, last name, email).');
          return;
        }
      }
      if (!billing.street || !billing.postal_code || !billing.city || !billing.country) {
        setError('Please fill in all required billing fields.');
        return;
      }
      if (!billing.contact_first_name || !billing.contact_last_name || !billing.contact_email) {
        setError('Please fill in contact person details.');
        return;
      }

      registerMutation.mutate({
        placement_id: placementId,
        billing: {
          ...billing,
          company_name: billing.company_name || null,
          vat_number: billing.vat_number || null,
          contact_phone: billing.contact_phone || null,
        },
        attendees: attendees.map((a) => ({
          first_name: a.first_name,
          last_name: a.last_name,
          email: a.email,
        })),
        honeypot_field: '',
        form_start_timestamp: Date.now() / 1000,
      });
    },
    [attendees, billing, placementId, registerMutation]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 max-w-md">
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
            Training Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            This training is not available for registration.
          </p>
        </div>
      </div>
    );
  }

  const startDate = training.start_date
    ? new Date(training.start_date + 'T00:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Training Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {training.training_name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
            {startDate && <span>{startDate}</span>}
            {training.duration && (
              <span>
                {training.duration} day{training.duration > 1 ? 's' : ''}
              </span>
            )}
            {training.location_city && (
              <span>
                {training.location_name
                  ? `${training.location_name}, ${training.location_city}`
                  : training.location_city}
              </span>
            )}
            {training.language_name && <span>{training.language_name}</span>}
          </div>
          {pricePerPerson > 0 && (
            <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {currencySymbol} {pricePerPerson.toLocaleString('de-DE')} per person
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Attendees Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Attendees ({attendees.length})
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkMode(!bulkMode)}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {bulkMode ? 'Cancel bulk' : 'Bulk add'}
                </button>
                <button
                  type="button"
                  onClick={addAttendee}
                  className="text-xs px-2 py-1 bg-primary-600 text-white rounded hover:bg-primary-700"
                >
                  + Add
                </button>
              </div>
            </div>

            {bulkMode && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Paste attendee data — one per line: First Name, Last Name, Email (comma, tab, or
                  semicolon separated)
                </p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={4}
                  placeholder="John, Doe, john@example.com&#10;Jane, Smith, jane@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 font-mono"
                />
                <button
                  type="button"
                  onClick={parseBulk}
                  className="mt-2 text-xs px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700"
                >
                  Add attendees
                </button>
              </div>
            )}

            <div className="space-y-3">
              {attendees.map((att, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={att.first_name}
                    onChange={(e) => updateAttendee(idx, 'first_name', e.target.value)}
                    placeholder="First name *"
                    required
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    value={att.last_name}
                    onChange={(e) => updateAttendee(idx, 'last_name', e.target.value)}
                    placeholder="Last name *"
                    required
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                  <input
                    type="email"
                    value={att.email}
                    onChange={(e) => updateAttendee(idx, 'email', e.target.value)}
                    placeholder="Email *"
                    required
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                  {attendees.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAttendee(idx)}
                      className="p-2 text-gray-400 hover:text-red-500"
                      title="Remove"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Billing Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Billing Information
              </h2>
              <button
                type="button"
                onClick={copyFromFirstAttendee}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                Copy from first attendee
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={billing.company_name}
                  onChange={(e) => setBilling((p) => ({ ...p, company_name: e.target.value }))}
                  placeholder="Company name (optional)"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={billing.street}
                  onChange={(e) => setBilling((p) => ({ ...p, street: e.target.value }))}
                  placeholder="Street address *"
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <input
                type="text"
                value={billing.postal_code}
                onChange={(e) => setBilling((p) => ({ ...p, postal_code: e.target.value }))}
                placeholder="Postal code *"
                required
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="text"
                value={billing.city}
                onChange={(e) => setBilling((p) => ({ ...p, city: e.target.value }))}
                placeholder="City *"
                required
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="text"
                value={billing.country}
                onChange={(e) => setBilling((p) => ({ ...p, country: e.target.value }))}
                placeholder="Country code (e.g. DE) *"
                required
                maxLength={2}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="text"
                value={billing.vat_number}
                onChange={(e) => setBilling((p) => ({ ...p, vat_number: e.target.value }))}
                placeholder="VAT number (optional)"
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />

              {/* Contact person */}
              <div className="sm:col-span-2 mt-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Contact Person
                </h3>
              </div>
              <input
                type="text"
                value={billing.contact_first_name}
                onChange={(e) => setBilling((p) => ({ ...p, contact_first_name: e.target.value }))}
                placeholder="First name *"
                required
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="text"
                value={billing.contact_last_name}
                onChange={(e) => setBilling((p) => ({ ...p, contact_last_name: e.target.value }))}
                placeholder="Last name *"
                required
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="email"
                value={billing.contact_email}
                onChange={(e) => setBilling((p) => ({ ...p, contact_email: e.target.value }))}
                placeholder="Email *"
                required
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="tel"
                value={billing.contact_phone}
                onChange={(e) => setBilling((p) => ({ ...p, contact_phone: e.target.value }))}
                placeholder="Phone"
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            {/* Payment method */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Payment Method
              </h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="payment_method"
                    value="bank_transfer"
                    checked={billing.payment_method === 'bank_transfer'}
                    onChange={() => setBilling((p) => ({ ...p, payment_method: 'bank_transfer' }))}
                    className="text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Bank Transfer</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="payment_method"
                    value="credit_card"
                    checked={billing.payment_method === 'credit_card'}
                    onChange={() => setBilling((p) => ({ ...p, payment_method: 'credit_card' }))}
                    className="text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Credit Card</span>
                </label>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Order Summary
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>
                  {training.training_name} x {attendees.length} attendee
                  {attendees.length !== 1 ? 's' : ''}
                </span>
                <span>
                  {currencySymbol}{' '}
                  {totalPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-semibold text-gray-900 dark:text-gray-100">
                <span>Total</span>
                <span>
                  {currencySymbol}{' '}
                  {totalPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                required
                className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I agree to the terms and conditions and acknowledge the privacy policy.
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={registerMutation.isPending || !termsAccepted}
            className="w-full py-3 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            {registerMutation.isPending
              ? 'Processing...'
              : `Register & Pay ${currencySymbol} ${totalPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`}
          </button>
        </form>
      </div>
    </div>
  );
});

export default TrainingRegistrationForm;
