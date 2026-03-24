import React from 'react';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import type { ProgramDiffResponse } from '../../../../types/training';

interface ChangesPreviewDialogProps {
  open: boolean;
  diff: ProgramDiffResponse;
  year: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatDateDE(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

const ChangesPreviewDialog = React.memo(function ChangesPreviewDialog({
  open,
  diff,
  year,
  isPending,
  onConfirm,
  onCancel,
}: ChangesPreviewDialogProps) {
  const added = diff.placement_changes.filter((c) => c.change_type === 'added');
  const removed = diff.placement_changes.filter((c) => c.change_type === 'removed');
  const modified = diff.placement_changes.filter((c) => c.change_type === 'modified');

  return (
    <ConfirmDialog
      open={open}
      title={`Update Program ${year}`}
      message={
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {!diff.has_changes ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No changes detected since last publish.
            </p>
          ) : (
            <>
              {/* Summary */}
              <div className="flex items-center gap-3 flex-wrap text-xs">
                {added.length > 0 && (
                  <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">
                    +{added.length} added
                  </span>
                )}
                {removed.length > 0 && (
                  <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                    -{removed.length} removed
                  </span>
                )}
                {modified.length > 0 && (
                  <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                    ~{modified.length} modified
                  </span>
                )}
                <span className="text-gray-500 dark:text-gray-400">
                  {diff.affected_trainer_ids.length} trainer
                  {diff.affected_trainer_ids.length !== 1 ? 's' : ''} affected
                </span>
              </div>

              {/* Placement changes */}
              {added.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1 uppercase tracking-wide">
                    New Placements
                  </h4>
                  <ul className="space-y-1">
                    {added.map((c) => (
                      <li
                        key={c.placement_id}
                        className="text-sm px-2 py-1 rounded bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800"
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {c.training_slug || c.training_name}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 ml-1">
                          {formatDateDE(c.start_date)} ({c.duration}d)
                          {c.location_code ? ` — ${c.location_code}` : ''}
                        </span>
                        {c.new_trainer_names.length > 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                            [{c.new_trainer_names.join(', ')}]
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {removed.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1 uppercase tracking-wide">
                    Removed Placements
                  </h4>
                  <ul className="space-y-1">
                    {removed.map((c) => (
                      <li
                        key={c.placement_id}
                        className="text-sm px-2 py-1 rounded bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 line-through"
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {c.training_slug || c.training_name}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 ml-1">
                          {formatDateDE(c.start_date)} ({c.duration}d)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {modified.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1 uppercase tracking-wide">
                    Modified Placements
                  </h4>
                  <ul className="space-y-1">
                    {modified.map((c) => (
                      <li
                        key={c.placement_id}
                        className="text-sm px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800"
                      >
                        <div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {c.training_slug || c.training_name}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 ml-1">
                            {formatDateDE(c.start_date)}
                          </span>
                        </div>
                        <ul className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 pl-3">
                          {c.changes.map((ch, i) => (
                            <li key={i}>{ch}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Per-trainer breakdown */}
              {diff.per_trainer_changes.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                    Trainer Notifications
                  </h4>
                  <div className="space-y-2">
                    {diff.per_trainer_changes.map((tc) => (
                      <div
                        key={tc.trainer_id}
                        className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {tc.trainer_name}
                        </span>
                        <ul className="mt-0.5 text-xs space-y-0.5">
                          {tc.added_trainings.map((t, i) => (
                            <li key={`a-${i}`} className="text-green-600 dark:text-green-400">
                              + {t}
                            </li>
                          ))}
                          {tc.removed_trainings.map((t, i) => (
                            <li key={`r-${i}`} className="text-red-600 dark:text-red-400">
                              - {t}
                            </li>
                          ))}
                          {tc.modified_trainings.map((t, i) => (
                            <li key={`m-${i}`} className="text-amber-600 dark:text-amber-400">
                              ~ {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Only affected trainers will receive an updated schedule email with a new PDF
                attachment.
              </p>
            </>
          )}
        </div>
      }
      confirmLabel={
        isPending ? 'Updating...' : diff.has_changes ? 'Confirm & Notify Trainers' : 'Republish'
      }
      onConfirm={onConfirm}
      onCancel={onCancel}
      variant={diff.has_changes ? 'danger' : 'primary'}
      wide
    />
  );
});

export default ChangesPreviewDialog;
