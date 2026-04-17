import type { AvailablePlacement, CustomerOffer } from '../../../../../types/training';
import PlacementPicker from './PlacementPicker';

interface Props {
  placementsByYear: Array<{ year: number; placements: AvailablePlacement[] }>;
  offer: CustomerOffer;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export default function AddPlacementsInline({
  placementsByYear,
  offer,
  selectedIds,
  onToggle,
  onCancel,
  onConfirm,
  isPending,
}: Props) {
  const existingIds = new Set((offer.placements ?? []).map((p) => p.id));

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-900/20">
      <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
        Add Trainings to Offer
      </h5>
      <PlacementPicker
        placementsByYear={placementsByYear}
        selectedIds={selectedIds}
        excludeIds={existingIds}
        onToggle={onToggle}
        maxHeight="max-h-48"
        bgClass="bg-white dark:bg-gray-800"
      />
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={selectedIds.length === 0 || isPending}
          className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Adding...' : `Add (${selectedIds.length})`}
        </button>
      </div>
    </div>
  );
}
