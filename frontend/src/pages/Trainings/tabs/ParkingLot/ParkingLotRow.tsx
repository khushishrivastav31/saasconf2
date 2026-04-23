import { memo } from 'react';
import { formatDate, type ParkedAttendee } from './types';

interface Props {
  attendee: ParkedAttendee;
  onReassign: (att: ParkedAttendee) => void;
  onCancel: (att: ParkedAttendee) => void;
  cancelling: boolean;
}

function ParkingLotRowImpl({ attendee, onReassign, onCancel, cancelling }: Props) {
  const cancellable = attendee.cancellable ?? false;
  const cancelTitle = cancellable
    ? undefined
    : 'Cancellation is only available for portal registrations with a sent/overdue/paid invoice.';
  const parkedEvent = attendee.history.find((h) => h.event_type === 'parked');
  const lastTraining = attendee.history.find(
    (h) =>
      h.event_type === 'registered' ||
      h.event_type === 'offer_assigned' ||
      h.event_type === 'reassigned'
  );

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-900/10">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {attendee.first_name} {attendee.last_name}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">{attendee.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Parked
            </span>
            {parkedEvent?.created_at && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                since {formatDate(parkedEvent.created_at)}
              </p>
            )}
          </div>
          <button
            onClick={() => onReassign(attendee)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            Reassign to Training
          </button>
          <button
            onClick={() => onCancel(attendee)}
            disabled={cancelling || !cancellable}
            title={cancelTitle}
            className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel Registration
          </button>
        </div>
      </div>
      {parkedEvent?.notes && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Reason:</span> {parkedEvent.notes}
        </p>
      )}
      {lastTraining && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Last training: {lastTraining.training_name}
        </p>
      )}
    </div>
  );
}

export const ParkingLotRow = memo(ParkingLotRowImpl);
