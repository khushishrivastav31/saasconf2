import type { ReactNode } from 'react';

interface ToolbarButtonProps {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: ReactNode;
}

export default function ToolbarButton({
  active,
  onClick,
  disabled,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded text-sm leading-none transition-colors ${
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
