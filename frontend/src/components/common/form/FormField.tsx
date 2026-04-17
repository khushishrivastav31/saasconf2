import { type ReactNode } from 'react';

export interface FormFieldProps {
  id: string;
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  /** Content rendered to the right of the label, e.g. a "Recommended" hint. */
  labelExtra?: ReactNode;
  /** The actual control(s) rendered inside the field. */
  children: ReactNode;
  /** Optional extra className for the wrapping <div>. */
  className?: string;
}

/**
 * Shared wrapper for form controls: label + required marker + helper/error
 * text. Controls render inside as children.
 *
 * Rules intentionally kept loose so consumers can still drop in exotic
 * controls (date pickers, custom UIs) without fighting the wrapper.
 */
export default function FormField({
  id,
  label,
  required = false,
  error,
  helperText,
  labelExtra,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && (
            <span className="text-red-500 ml-1" aria-label="required">
              *
            </span>
          )}
          {labelExtra && <span className="ml-2 text-xs font-normal">{labelExtra}</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
