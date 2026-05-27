import { forwardRef, type InputHTMLAttributes } from 'react';
import FormField from './FormField';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Content rendered to the right of the label (hint chip, status, etc.). */
  labelExtra?: React.ReactNode;
  /** Wrapper className (applies to the outer <div>, not the <input>). */
  wrapperClassName?: string;
}

function baseClasses(hasError: boolean): string {
  const base =
    'mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none sm:text-sm dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-900 dark:disabled:text-gray-500 disabled:bg-gray-100 disabled:text-gray-500';
  return hasError
    ? `${base} border-red-500 focus:border-red-500 focus:ring-red-500`
    : `${base} border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-primary-500`;
}

/**
 * Plain text input primitive. Handles label + error + helper text via
 * FormField; forwards everything else to the native <input>.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    error,
    helperText,
    labelExtra,
    wrapperClassName,
    required,
    className = '',
    type = 'text',
    ...rest
  },
  ref
) {
  const inputId = id ?? rest.name ?? undefined;
  const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

  return (
    <FormField
      id={inputId ?? ''}
      label={label}
      required={required}
      error={error}
      helperText={helperText}
      labelExtra={labelExtra}
      className={wrapperClassName}
    >
      <input
        ref={ref}
        id={inputId}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${baseClasses(Boolean(error))} ${className}`}
        {...rest}
      />
    </FormField>
  );
});

export default Input;
