import type { CustomerOffer } from '../../../../../types/training';
import PlacementRowWithAttendees from './PlacementRowWithAttendees';

interface Props {
  offer: CustomerOffer;
  onAddClick: () => void;
  onRemove: (placementId: string) => void;
}

export default function AssignedPlacementsTable({ offer, onAddClick, onRemove }: Props) {
  const placements = offer.placements ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Assigned Trainings ({placements.length})
        </h5>
        <button
          type="button"
          onClick={onAddClick}
          className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          + Add Training
        </button>
      </div>

      {placements.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-6" />
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Training
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Date
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Location
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Type
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {placements.map((p) => (
                <PlacementRowWithAttendees
                  key={p.id}
                  placement={p}
                  offerId={offer.id}
                  offerAttendeeLimit={offer.attendees}
                  totalAttendeeCount={offer.attendee_count ?? 0}
                  onRemove={() => onRemove(p.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No trainings assigned yet.
        </p>
      )}
    </div>
  );
}
