import { useCallback, useEffect, useRef } from 'react';
import { useVatValidation, type VatStatus } from '../../hooks/useVatValidation';

interface VatNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called after validation with true (valid), false (invalid), or null (uncertain/idle). */
  onValidationResult?: (valid: boolean | null) => void;
  /** Country code (e.g. "DE") — improves validation accuracy. */
  country?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Show red asterisk when true (legally required). */
  required?: boolean;
  /** VAT requirement level for visual treatment. */
  level?: 'required' | 'recommended' | 'optional';
  /** Human-readable explanation of why VAT is needed. */
  requirementReason?: string;
}

// ---------------------------------------------------------------------------
// Status icons (inline SVGs)
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function StatusIcon({ status }: { status: VatStatus }) {
  switch (status) {
    case 'checking':
      return <SpinnerIcon />;
    case 'valid':
      return <CheckIcon />;
    case 'invalid':
      return <XIcon />;
    case 'uncertain':
      return <WarningIcon />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Border & ring classes per status
// ---------------------------------------------------------------------------

function getInputClasses(status: VatStatus): string {
  const base =
    'mt-1 block w-full rounded-md shadow-sm focus:outline-none sm:text-sm dark:bg-gray-800 dark:text-gray-100';
  switch (status) {
    case 'valid':
      return `${base} border-green-500 focus:border-green-500 focus:ring-green-500`;
    case 'invalid':
      return `${base} border-red-500 focus:border-red-500 focus:ring-red-500`;
    case 'uncertain':
      return `${base} border-yellow-500 focus:border-yellow-500 focus:ring-yellow-500`;
    default:
      return `${base} border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-primary-500`;
  }
}

function getStatusLabel(status: VatStatus): { text: string; className: string } | null {
  switch (status) {
    case 'checking':
      return { text: 'Checking...', className: 'text-gray-400 dark:text-gray-500' };
    case 'valid':
      return { text: 'Valid', className: 'text-green-600 dark:text-green-400' };
    case 'invalid':
      return { text: 'Invalid', className: 'text-red-600 dark:text-red-400' };
    case 'uncertain':
      return { text: 'Unverified', className: 'text-yellow-600 dark:text-yellow-400' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VatNumberInput({
  value,
  onChange,
  onValidationResult,
  country,
  id = 'vat_number',
  label = 'VAT Number',
  placeholder = 'e.g. DE123456789',
  disabled = false,
  required = false,
  level = 'optional',
  requirementReason,
}: VatNumberInputProps) {
  const { status, message, validate, reset } = useVatValidation();

  // Track the latest onValidationResult callback to avoid stale closures
  const onResultRef = useRef(onValidationResult);
  useEffect(() => {
    onResultRef.current = onValidationResult;
  }, [onValidationResult]);

  const handleBlur = useCallback(async () => {
    const result = await validate(value, country);
    onResultRef.current?.(result);
  }, [validate, value, country]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      reset();
    },
    [onChange, reset]
  );

  const statusLabel = getStatusLabel(status);
  const showIcon = status !== 'idle';

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
        {level === 'recommended' && !required && (
          <span className="text-yellow-600 dark:text-yellow-400 text-xs ml-2 font-normal">
            (Recommended for B2B)
          </span>
        )}
        {statusLabel && (
          <span className={`ml-2 text-xs font-normal ${statusLabel.className}`}>
            {statusLabel.text}
          </span>
        )}
      </label>

      {/* Requirement explanation */}
      {requirementReason && (
        <div className="mt-1 mb-2 text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>{requirementReason}</span>
        </div>
      )}

      <div className="relative">
        <input
          id={id}
          type="text"
          className={`${getInputClasses(status)} ${showIcon ? 'pr-9' : ''}`}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
        />
        {showIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none">
            <StatusIcon status={status} />
          </div>
        )}
      </div>
      {message && (
        <p
          className={`mt-1 text-xs ${
            status === 'invalid'
              ? 'text-red-600 dark:text-red-400'
              : 'text-yellow-600 dark:text-yellow-400'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
