import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import FormField from './FormField';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  labelExtra?: ReactNode;
  wrapperClassName?: string;
  /**
   * Optional declarative options. If provided, renders as <option> elements.
   * Pass children instead for more control (option groups, separators).
   */
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
  /** First option shown when the current value is empty. */
  placeholder?: string;
}

function baseClasses(hasError: boolean): string {
  const base =
    'mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none sm:text-sm dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-900 dark:disabled:text-gray-500 disabled:bg-gray-100 disabled:text-gray-500';
  return hasError
    ? `${base} border-red-500 focus:border-red-500 focus:ring-red-500`
    : `${base} border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-primary-500`;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    label,
    error,
    helperText,
    labelExtra,
    wrapperClassName,
    required,
    className = '',
    options,
    placeholder,
    children,
    ...rest
  },
  ref
) {
  const selectId = id ?? rest.name ?? undefined;
  const describedBy = error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined;

  return (
    <FormField
      id={selectId ?? ''}
      label={label}
      required={required}
      error={error}
      helperText={helperText}
      labelExtra={labelExtra}
      className={wrapperClassName}
    >
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${baseClasses(Boolean(error))} ${className}`}
        {...rest}
      >
        {placeholder !== undefined && (
          <option value="" disabled={required}>
            {placeholder}
          </option>
        )}
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
    </FormField>
  );
});

export default Select;
