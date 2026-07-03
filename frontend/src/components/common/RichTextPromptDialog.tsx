import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface PromptDialogState {
  open: boolean;
  title: string;
  defaultValue: string;
  onSubmit: (value: string) => void;
  onRemove?: () => void;
}

export default function PromptDialog({
  state,
  onClose,
}: {
  state: PromptDialogState;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(state.defaultValue);

  useEffect(() => {
    if (state.open) {
      setValue(state.defaultValue);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [state.open, state.defaultValue]);

  if (!state.open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // React replays submit events up the component tree even across a portal,
    // so stop propagation to keep an enclosing form (e.g. the paper creation
    // form) from also submitting and navigating the user away (MAIN-13413).
    e.stopPropagation();
    state.onSubmit(value);
    onClose();
  };

  // Render via a portal to document.body so the dialog's <form> never nests
  // inside a parent <form> (e.g. the paper creation form). Browsers flatten
  // DOM-nested forms, which would route this dialog's submit to the outer form
  // and navigate the user away instead of inserting the link (MAIN-13413).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-full max-w-sm mx-4"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {state.title}
        </h3>
        <input
          ref={inputRef}
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="https://"
        />
        <div className="flex items-center justify-between mt-4">
          {state.onRemove ? (
            <button
              type="button"
              onClick={() => {
                state.onRemove!();
                onClose();
              }}
              className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              Remove link
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700"
            >
              OK
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
