import { useEffect, useRef, useState } from 'react';

export interface SpeakerPaperInfo {
  id: string;
  title: string;
  status: string;
  cfp_title: string;
}

export interface SpeakerDependencyData {
  papers: SpeakerPaperInfo[];
  cospeaker_count: number;
  committee_count: number;
}

interface Props {
  open: boolean;
  speakerName: string;
  dependencies: SpeakerDependencyData;
  isLoading: boolean;
  onAnonymize: () => void;
  onCascadeDelete: () => void;
  onCancel: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
};

export default function SpeakerDeleteDialog({
  open,
  speakerName,
  dependencies,
  isLoading,
  onAnonymize,
  onCascadeDelete,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<'choose' | 'confirm-cascade'>('choose');

  useEffect(() => {
    if (open) {
      setStep('choose');
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const { papers, cospeaker_count, committee_count } = dependencies;
  const paperCount = papers.length;

  const summaryParts: string[] = [];
  if (paperCount > 0)
    summaryParts.push(`${paperCount} paper${paperCount !== 1 ? 's' : ''} as main speaker`);
  if (cospeaker_count > 0)
    summaryParts.push(
      `${cospeaker_count} co-speaker invitation${cospeaker_count !== 1 ? 's' : ''}`
    );
  if (committee_count > 0)
    summaryParts.push(`${committee_count} committee membership${committee_count !== 1 ? 's' : ''}`);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="speaker-delete-dialog-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/30">
            <svg
              className="w-5 h-5 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3
              id="speaker-delete-dialog-title"
              className="text-lg font-medium text-gray-900 dark:text-gray-100"
            >
              {step === 'choose' ? 'Delete Speaker' : 'Confirm: Delete Speaker & Papers'}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              <strong className="text-gray-700 dark:text-gray-300">{speakerName}</strong> has{' '}
              {summaryParts.join(', ')}.
            </p>
          </div>
        </div>

        {step === 'choose' && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose how to handle the deletion:
            </p>

            {/* Option 1: Anonymize */}
            <button
              type="button"
              onClick={onAnonymize}
              disabled={isLoading}
              className="w-full text-left mb-3 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Anonymize Speaker
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Replace all personal data with "Deleted User". Papers remain in the system but the
                speaker profile is hidden from all lists.
              </p>
            </button>

            {/* Option 2: Cascade delete */}
            <button
              type="button"
              onClick={() => setStep('confirm-cascade')}
              disabled={isLoading}
              className="w-full text-left p-4 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Delete Speaker &amp; Papers
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Permanently delete the speaker profile and all their papers. This cannot be undone.
              </p>
            </button>

            <div className="mt-5 flex justify-end">
              <button
                ref={cancelRef}
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'confirm-cascade' && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              The following papers will be permanently deleted:
            </p>

            {papers.length > 0 ? (
              <ul className="mb-4 max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-md">
                {papers.map((paper) => (
                  <li key={paper.id} className="px-3 py-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {paper.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {paper.cfp_title}
                      {' · '}
                      <span className="capitalize">
                        {STATUS_LABELS[paper.status] ?? paper.status}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 italic">
                No papers as main speaker.
              </p>
            )}

            <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-4">
              This action cannot be undone.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStep('choose')}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onCascadeDelete}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
