import { forwardRef, type TextareaHTMLAttributes, type ReactNode } from 'react';
import FormField from './FormField';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  labelExtra?: ReactNode;
  wrapperClassName?: string;
}

function baseClasses(hasError: boolean): string {
  const base =
    'mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none sm:text-sm dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-900 dark:disabled:text-gray-500 disabled:bg-gray-100 disabled:text-gray-500';
  return hasError
    ? `${base} border-red-500 focus:border-red-500 focus:ring-red-500`
    : `${base} border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-primary-500`;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    id,
    label,
    error,
    helperText,
    labelExtra,
    wrapperClassName,
    required,
    rows = 4,
    className = '',
    ...rest
  },
  ref
) {
  const textareaId = id ?? rest.name ?? undefined;
  const describedBy = error
    ? `${textareaId}-error`
    : helperText
      ? `${textareaId}-helper`
      : undefined;

  return (
    <FormField
      id={textareaId ?? ''}
      label={label}
      required={required}
      error={error}
      helperText={helperText}
      labelExtra={labelExtra}
      className={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${baseClasses(Boolean(error))} ${className}`}
        {...rest}
      />
    </FormField>
  );
});

export default TextArea;
