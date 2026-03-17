import ConfirmDialog from './ConfirmDialog';

interface UnsavedChangesDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Unsaved Changes"
      message="You have unsaved changes that will be lost. Do you want to leave without saving?"
      confirmLabel="Leave"
      cancelLabel="Stay"
      variant="warning"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
