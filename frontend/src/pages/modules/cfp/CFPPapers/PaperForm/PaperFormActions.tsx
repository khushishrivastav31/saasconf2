import type { Paper } from '../../../../../types';
import type { SaveStatus } from '../../../../../hooks/useSaveStatus';
import { DeleteIcon } from '../../../../ConferenceDetail/icons';

interface Props {
  paper: Paper | null;
  canEdit: boolean;
  saveStatus: SaveStatus;
  isSaving: boolean;
  isDeleting?: boolean;
  isSubmitting?: boolean;
  isUnsubmitting?: boolean;
  isAccepting?: boolean;
  isRejecting?: boolean;
  videoError: string | null;
  onCancel: () => void;
  onDelete?: () => void;
  onSubmit?: () => void;
  onUnsubmit?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onSave: () => void;
}

export default function PaperFormActions({
  paper,
  canEdit,
  saveStatus,
  isSaving,
  isDeleting,
  isSubmitting,
  isUnsubmitting,
  isAccepting,
  isRejecting,
  videoError,
  onCancel,
  onDelete,
  onSubmit,
  onUnsubmit,
  onAccept,
  onReject,
  onSave,
}: Props) {
  const isEditing = !!paper;

  return (
    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
      <div className="flex gap-2">
        {isEditing && onDelete && canEdit && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <DeleteIcon />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        {isEditing && paper?.status !== 'draft' && onUnsubmit && (
          <button
            type="button"
            onClick={onUnsubmit}
            disabled={isUnsubmitting}
            className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {isUnsubmitting ? 'Reverting...' : 'Revert to Draft'}
          </button>
        )}
        {isEditing && paper?.status !== 'rejected' && onReject && (
          <button
            type="button"
            onClick={onReject}
            disabled={isRejecting}
            className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isRejecting ? 'Rejecting...' : 'Reject'}
          </button>
        )}
        {isEditing && paper?.status !== 'accepted' && onAccept && (
          <button
            type="button"
            onClick={onAccept}
            disabled={isAccepting}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 transition-colors"
          >
            {isAccepting ? 'Accepting...' : 'Accept'}
          </button>
        )}
        {isEditing && paper?.status === 'draft' && onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Paper'}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !!videoError}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-all duration-300 ${
              saveStatus === 'saved'
                ? 'bg-green-600 hover:bg-green-700'
                : saveStatus === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {saveStatus === 'saving' && (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {saveStatus === 'saved' && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {saveStatus === 'error' && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved!'
                : saveStatus === 'error'
                  ? 'Error'
                  : isEditing
                    ? 'Save Changes'
                    : 'Create Paper'}
          </button>
        )}
      </div>
    </div>
  );
}
