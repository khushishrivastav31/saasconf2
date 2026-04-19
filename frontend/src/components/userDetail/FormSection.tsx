import type { ReactNode } from 'react';

interface Props {
  title?: string;
  description?: string;
  children: ReactNode;
  padded?: boolean;
}

export default function FormSection({ title, description, children, padded = true }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      {title && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            {title}
          </h4>
          {description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
      )}
      <div className={padded ? 'px-6 py-5' : ''}>{children}</div>
    </div>
  );
}
