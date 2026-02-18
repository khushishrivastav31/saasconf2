import { useId } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** max-w-sm, max-w-md, max-w-lg, max-w-2xl, etc. Defaults to max-w-2xl */
  size?: string;
  /** Additional z-index class. Defaults to z-50 */
  zIndex?: string;
  children: React.ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  size = 'max-w-2xl',
  zIndex = 'z-50',
  children,
}: ModalProps) {
  const titleId = useId();

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center ${zIndex}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`bg-white rounded-lg shadow-xl ${size} w-full mx-4 max-h-[90vh] overflow-y-auto`}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-medium text-gray-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
