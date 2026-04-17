import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label?: ReactNode;
  helperText?: string;
  error?: string;
  /** Wrapper <div> className. Only the row layout, not the box itself. */
  wrapperClassName?: string;
}

/**
 * Checkbox with inline label. Differs from Input/Select in that the label
 * appears to the right of the box (standard checkbox ergonomics) rather
 * than above it.
 */
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id, label, helperText, error, wrapperClassName = '', className = '', disabled, ...rest },
  ref
) {
  const inputId = id ?? rest.name ?? undefined;
  const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

  return (
    <div className={wrapperClassName}>
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-800 disabled:opacity-50 ${className}`}
          {...rest}
        />
        {label && (
          <label
            htmlFor={inputId}
            className={`text-sm text-gray-700 dark:text-gray-300 ${
              disabled ? 'opacity-60' : 'cursor-pointer'
            }`}
          >
            {label}
          </label>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default Checkbox;
