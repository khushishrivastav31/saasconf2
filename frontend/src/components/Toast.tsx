import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info' | 'warning';
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastItem['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const TOAST_DURATION = 5000;

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const styles: Record<
    ToastItem['type'],
    { bg: string; border: string; text: string; icon: string }
  > = {
    error: {
      bg: 'bg-red-50 dark:bg-red-900/30',
      border: 'border-red-300',
      text: 'text-red-800 dark:text-red-300',
      icon: 'text-red-500',
    },
    success: {
      bg: 'bg-green-50 dark:bg-green-900/30',
      border: 'border-green-300',
      text: 'text-green-800 dark:text-green-300',
      icon: 'text-green-500',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-900/30',
      border: 'border-amber-300',
      text: 'text-amber-800 dark:text-amber-300',
      icon: 'text-amber-500',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/30',
      border: 'border-blue-300',
      text: 'text-blue-800 dark:text-blue-300',
      icon: 'text-blue-500',
    },
  };

  const s = styles[toast.type];

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-md w-full
        ${s.bg} ${s.border} ${s.text}
        transition-all duration-300 ease-in-out
        ${isExiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'}
      `}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 ${s.icon}`}>
        {toast.type === 'error' && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        {toast.type === 'success' && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        {toast.type === 'warning' && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        )}
        {toast.type === 'info' && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </div>

      {/* Message */}
      <p className="flex-1 text-sm font-medium">{toast.message}</p>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className={`flex-shrink-0 ${s.icon} hover:opacity-70`}
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'error') => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — top-right on desktop, top-banner on mobile.
          Brandon's QA 1.4.4.1 standardised the platform on top-right. */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-200 flex flex-col items-end gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto w-full sm:w-auto">
              <ToastMessage toast={toast} onDismiss={dismissToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
