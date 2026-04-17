import { useCallback, useState, type ReactNode } from 'react';
import DetailPanelWrapper, { type DetailPanelTab, type SaveStatus } from '../../DetailPanelWrapper';
import UnsavedChangesDialog from '../../UnsavedChangesDialog';

export interface BaseDetailPanelProps {
  title: string;
  subtitle?: ReactNode;
  tabs: DetailPanelTab[];
  saveStatus: SaveStatus;
  /** True when the form has unsaved changes. Shows the confirmation dialog on close. */
  isDirty: boolean;
  /** Called to close the panel (only fires after dirty-check passes). */
  onClose?: () => void;
  onDelete?: () => void;
  deleteTitle?: string;
  deleteMessage?: string;
  formId?: string;
  showSave?: boolean;
  saveDisabled?: boolean;
  headerActions?: ReactNode;
  isAdmin?: boolean;
  /** When true, the save button is hidden and fields should be read-only. */
  readonly?: boolean;
}

/**
 * Thin wrapper around the existing ``DetailPanelWrapper`` that layers in the
 * unsaved-changes guard on close. Consumers still own form state — use
 * ``useDetailPanelState`` to manage it without rewriting the triad.
 *
 * Readonly mode simply hides the save button; fields remain the consumer's
 * responsibility (pass ``disabled`` to Input/Select/TextArea primitives).
 */
export default function BaseDetailPanel({
  title,
  subtitle,
  tabs,
  saveStatus,
  isDirty,
  onClose,
  onDelete,
  deleteTitle,
  deleteMessage,
  formId,
  showSave = true,
  saveDisabled = false,
  headerActions,
  isAdmin = true,
  readonly = false,
}: BaseDetailPanelProps) {
  const [unsavedOpen, setUnsavedOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (!onClose) return;
    if (isDirty) {
      setUnsavedOpen(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setUnsavedOpen(false);
    onClose?.();
  }, [onClose]);

  const headerWithClose = onClose ? (
    <div className="flex items-center gap-2">
      {headerActions}
      <button
        type="button"
        onClick={requestClose}
        aria-label="Close panel"
        className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  ) : (
    headerActions
  );

  return (
    <>
      <DetailPanelWrapper
        title={title}
        subtitle={subtitle}
        tabs={tabs}
        saveStatus={saveStatus}
        onDelete={onDelete}
        deleteTitle={deleteTitle}
        deleteMessage={deleteMessage}
        formId={formId}
        showSave={showSave && !readonly}
        saveDisabled={saveDisabled || !isDirty}
        headerActions={headerWithClose}
        isAdmin={isAdmin}
      />
      <UnsavedChangesDialog
        open={unsavedOpen}
        onConfirm={confirmDiscard}
        onCancel={() => setUnsavedOpen(false)}
      />
    </>
  );
}
