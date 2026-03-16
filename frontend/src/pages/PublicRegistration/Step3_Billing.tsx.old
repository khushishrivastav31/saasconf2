/**
 * Step 3: Billing
 *
 * Billing profile form (company, address, contact, payment method).
 */
import { useForm } from 'react-hook-form';
import { COUNTRY_OPTIONS } from '../../config/countries';
import type { PortalBilling } from '../../types/publicRegistration';

interface BillingStepProps {
  billing: PortalBilling | null;
  onNext: (billing: PortalBilling) => void;
  onBack: () => void;
}

export default function BillingStep({ billing, onNext, onBack }: BillingStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PortalBilling>({
    defaultValues: billing || {
      payment_method: 'credit_card',
      country: 'US',
    },
  });

  const onSubmit = (data: PortalBilling) => {
    onNext(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="portal-card">
        <h2 className="portal-heading">Billing Information</h2>
        <p className="portal-text">
          Enter the billing details for this registration. Invoice will be sent to the contact email
          below.
        </p>

        {/* Payment Method */}
        <div className="portal-form-group mt-6">
          <label className="portal-label portal-label-required">Payment Method</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="credit_card"
                {...register('payment_method', { required: true })}
                className="mr-2"
              />
              <span>Credit Card</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="bank_transfer"
                {...register('payment_method', { required: true })}
                className="mr-2"
              />
              <span>Bank Transfer</span>
            </label>
          </div>
        </div>

        {/* Company Information */}
        <div className="mt-6">
          <h3 className="portal-subheading">Company Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Company Name */}
            <div className="portal-form-group md:col-span-2">
              <label className="portal-label">Company Name</label>
              <input
                {...register('company_name', {
                  maxLength: { value: 255, message: 'Max 255 characters' },
                })}
                className="portal-input"
                placeholder="Acme Corporation"
              />
            </div>

            {/* Tax ID */}
            <div className="portal-form-group">
              <label className="portal-label">Tax ID</label>
              <input
                {...register('tax_id', {
                  maxLength: { value: 100, message: 'Max 100 characters' },
                })}
                className="portal-input"
                placeholder="12-3456789"
              />
            </div>

            {/* VAT Number */}
            <div className="portal-form-group">
              <label className="portal-label">VAT Number</label>
              <input
                {...register('vat_number', {
                  maxLength: { value: 50, message: 'Max 50 characters' },
                })}
                className="portal-input"
                placeholder="GB123456789"
              />
            </div>
          </div>
        </div>

        {/* Billing Address */}
        <div className="mt-6">
          <h3 className="portal-subheading">Billing Address</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Country */}
            <div className="portal-form-group md:col-span-2">
              <label className="portal-label portal-label-required">Country</label>
              <select
                {...register('country', { required: 'Country is required' })}
                className={`portal-select ${errors.country ? 'portal-input-error' : ''}`}
              >
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
              {errors.country && <p className="portal-error-message">{errors.country.message}</p>}
            </div>

            {/* Address Line 1 */}
            <div className="portal-form-group md:col-span-2">
              <label className="portal-label portal-label-required">Address Line 1</label>
              <input
                {...register('address_line1', {
                  required: 'Address is required',
                  maxLength: { value: 255, message: 'Max 255 characters' },
                })}
                className={`portal-input ${errors.address_line1 ? 'portal-input-error' : ''}`}
                placeholder="123 Main Street"
              />
              {errors.address_line1 && (
                <p className="portal-error-message">{errors.address_line1.message}</p>
              )}
            </div>

            {/* Address Line 2 */}
            <div className="portal-form-group md:col-span-2">
              <label className="portal-label">Address Line 2</label>
              <input
                {...register('address_line2', {
                  maxLength: { value: 255, message: 'Max 255 characters' },
                })}
                className="portal-input"
                placeholder="Apt 4B"
              />
            </div>

            {/* City */}
            <div className="portal-form-group">
              <label className="portal-label portal-label-required">City</label>
              <input
                {...register('city', {
                  required: 'City is required',
                  maxLength: { value: 100, message: 'Max 100 characters' },
                })}
                className={`portal-input ${errors.city ? 'portal-input-error' : ''}`}
                placeholder="New York"
              />
              {errors.city && <p className="portal-error-message">{errors.city.message}</p>}
            </div>

            {/* State/Province */}
            <div className="portal-form-group">
              <label className="portal-label">State/Province</label>
              <input
                {...register('state_province', {
                  maxLength: { value: 100, message: 'Max 100 characters' },
                })}
                className="portal-input"
                placeholder="NY"
              />
            </div>

            {/* Postal Code */}
            <div className="portal-form-group">
              <label className="portal-label portal-label-required">Postal Code</label>
              <input
                {...register('postal_code', {
                  required: 'Postal code is required',
                  maxLength: { value: 20, message: 'Max 20 characters' },
                })}
                className={`portal-input ${errors.postal_code ? 'portal-input-error' : ''}`}
                placeholder="10001"
              />
              {errors.postal_code && (
                <p className="portal-error-message">{errors.postal_code.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="mt-6">
          <h3 className="portal-subheading">Billing Contact</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contact Name */}
            <div className="portal-form-group md:col-span-2">
              <label className="portal-label portal-label-required">Contact Name</label>
              <input
                {...register('contact_name', {
                  required: 'Contact name is required',
                  maxLength: { value: 255, message: 'Max 255 characters' },
                })}
                className={`portal-input ${errors.contact_name ? 'portal-input-error' : ''}`}
                placeholder="John Doe"
              />
              {errors.contact_name && (
                <p className="portal-error-message">{errors.contact_name.message}</p>
              )}
            </div>

            {/* Contact Email */}
            <div className="portal-form-group">
              <label className="portal-label portal-label-required">Contact Email</label>
              <input
                type="email"
                {...register('contact_email', {
                  required: 'Contact email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Invalid email address',
                  },
                })}
                className={`portal-input ${errors.contact_email ? 'portal-input-error' : ''}`}
                placeholder="billing@example.com"
              />
              {errors.contact_email && (
                <p className="portal-error-message">{errors.contact_email.message}</p>
              )}
            </div>

            {/* Contact Phone */}
            <div className="portal-form-group">
              <label className="portal-label">Contact Phone</label>
              <input
                {...register('contact_phone', {
                  maxLength: { value: 50, message: 'Max 50 characters' },
                })}
                className="portal-input"
                placeholder="+1 234 567 8900"
              />
            </div>

            {/* Purchase Order Number */}
            <div className="portal-form-group md:col-span-2">
              <label className="portal-label">Purchase Order Number</label>
              <input
                {...register('purchase_order_number', {
                  maxLength: { value: 100, message: 'Max 100 characters' },
                })}
                className="portal-input"
                placeholder="PO-2024-001"
              />
            </div>

            {/* Notes */}
            <div className="portal-form-group md:col-span-2">
              <label className="portal-label">Notes</label>
              <textarea
                {...register('notes', {
                  maxLength: { value: 1000, message: 'Max 1000 characters' },
                })}
                className="portal-textarea"
                rows={3}
                placeholder="Any special billing instructions..."
              />
            </div>
          </div>
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
