/**
 * TermsConsentSection
 *
 * Renders the terms & conditions and privacy policy consent checkbox.
 */
import type { PolicyEntry } from '../../../types/publicRegistration';

interface TermsConsentSectionProps {
  policies: Record<string, PolicyEntry> | null | undefined;
  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;
  setTermsModalOpen: (open: boolean) => void;
  setPrivacyModalOpen: (open: boolean) => void;
}

export default function TermsConsentSection({
  policies,
  termsAccepted,
  setTermsAccepted,
  setTermsModalOpen,
  setPrivacyModalOpen,
}: TermsConsentSectionProps) {
  return (
    <div className="flex items-start gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <input
        type="checkbox"
        id="terms-consent"
        checked={termsAccepted}
        onChange={(e) => setTermsAccepted(e.target.checked)}
        className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
      />
      <label htmlFor="terms-consent" className="text-sm text-gray-700 dark:text-gray-300">
        I hereby acknowledge that I have read and understood the{' '}
        {policies?.terms_and_conditions?.type === 'url' && policies.terms_and_conditions.url ? (
          <a
            href={policies.terms_and_conditions.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700 underline"
          >
            Terms and Conditions
          </a>
        ) : policies?.terms_and_conditions?.type === 'content' &&
          policies.terms_and_conditions.content ? (
          <button
            type="button"
            onClick={() => setTermsModalOpen(true)}
            className="text-primary-600 hover:text-primary-700 underline font-medium"
          >
            Terms and Conditions
          </button>
        ) : (
          <span className="text-primary-600 font-medium">Terms and Conditions</span>
        )}{' '}
        and{' '}
        {policies?.privacy_policy?.type === 'url' && policies.privacy_policy.url ? (
          <a
            href={policies.privacy_policy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700 underline"
          >
            Privacy Policy
          </a>
        ) : policies?.privacy_policy?.type === 'content' && policies.privacy_policy.content ? (
          <button
            type="button"
            onClick={() => setPrivacyModalOpen(true)}
            className="text-primary-600 hover:text-primary-700 underline font-medium"
          >
            Privacy Policy
          </button>
        ) : (
          <span className="text-primary-600 font-medium">Privacy Policy</span>
        )}{' '}
        and I agree to all of the terms.
        <span className="text-red-500 ml-0.5">*</span>
      </label>
    </div>
  );
}
