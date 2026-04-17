import type { AvailablePlacement } from '../../../../../types/training';
import { PLACEMENT_TYPE_COLORS } from './constants';

interface Props {
  placementsByYear: Array<{ year: number; placements: AvailablePlacement[] }>;
  selectedIds: string[];
  excludeIds?: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  maxHeight?: string;
  bgClass?: string;
}

export default function PlacementPicker({
  placementsByYear,
  selectedIds,
  excludeIds,
  onToggle,
  maxHeight = 'max-h-60',
  bgClass = '',
}: Props) {
  const filtered = excludeIds
    ? placementsByYear
        .map(({ year, placements }) => ({
          year,
          placements: placements.filter((p) => !excludeIds.has(p.id)),
        }))
        .filter(({ placements }) => placements.length > 0)
    : placementsByYear;

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500">No available placements found.</p>
    );
  }

  return (
    <div
      className={`border border-gray-200 dark:border-gray-700 rounded-lg ${maxHeight} overflow-y-auto ${bgClass}`}
    >
      {filtered.map(({ year, placements }) => (
        <div key={year}>
          <div className="sticky top-0 px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            {year}
          </div>
          {placements.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={(e) => onToggle(p.id, e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {p.training_slug || p.training_name}
                </span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {new Date(p.start_date).toLocaleDateString()}
                </span>
                {p.location_name && (
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                    {p.location_name}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLACEMENT_TYPE_COLORS[p.placement_type] || PLACEMENT_TYPE_COLORS.open}`}
              >
                {p.placement_type}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
