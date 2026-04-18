import { useState } from 'react';
import { formatPlacementDate, type AvailablePlacement, type ParkedAttendee } from './types';

interface Props {
  target: ParkedAttendee;
  placements: AvailablePlacement[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (placementId: string, keepInvoice: boolean) => void;
}

export function ParkingLotReassignModal({
  target,
  placements,
  isSubmitting,
  onClose,
  onSubmit,
}: Props) {
  const [selectedPlacement, setSelectedPlacement] = useState('');
  const [placementSearch, setPlacementSearch] = useState('');
  const [filterGuaranteed, setFilterGuaranteed] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [keepInvoice, setKeepInvoice] = useState(false);

  const filtered = placements.filter((p) => {
    if (placementSearch && !p.training_name.toLowerCase().includes(placementSearch.toLowerCase()))
      return false;
    if (filterGuaranteed && !p.is_guaranteed) return false;
    if (filterType && p.placement_type !== filterType) return false;
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Reassign Attendee
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          <strong>
            {target.first_name} {target.last_name}
          </strong>{' '}
          will be moved to the selected training.
        </p>

        <fieldset className="mb-4 space-y-2">
          <legend className="sr-only">Invoice handling</legend>
          <label className="flex items-start gap-2 p-2 rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <input
              type="radio"
              name="invoice-mode"
              checked={!keepInvoice}
              onChange={() => setKeepInvoice(false)}
              className="mt-1 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              <span className="font-medium block">Cancel &amp; re-invoice</span>
              <span className="text-gray-500 dark:text-gray-400">
                Old invoice is cancelled (credit note), a new invoice is issued and sent.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 p-2 rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <input
              type="radio"
              name="invoice-mode"
              checked={keepInvoice}
              onChange={() => setKeepInvoice(true)}
              className="mt-1 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              <span className="font-medium block">Keep existing invoice</span>
              <span className="text-gray-500 dark:text-gray-400">
                Just move the attendee. No credit note, no new invoice, no email.
              </span>
            </span>
          </label>
        </fieldset>

        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Select Training
        </label>
        <input
          type="text"
          placeholder="Search training name..."
          value={placementSearch}
          onChange={(e) => setPlacementSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 mb-2"
        />
        <div className="flex gap-2 mb-2">
          <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterGuaranteed}
              onChange={(e) => setFilterGuaranteed(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            />
            Guaranteed only
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All types</option>
            <option value="open">Open</option>
            <option value="inhouse">Inhouse</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div className="max-h-52 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md divide-y divide-gray-100 dark:divide-gray-800 mb-4">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">No trainings found</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlacement(p.id)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  selectedPlacement === p.id
                    ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {p.training_name}
                  </span>
                  {p.is_guaranteed && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      Guaranteed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatPlacementDate(p.start_date)}
                  </span>
                  <span className="text-[10px] text-gray-400 capitalize">{p.placement_type}</span>
                  {p.language && <span className="text-[10px] text-gray-400">{p.language}</span>}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(selectedPlacement, keepInvoice)}
            disabled={!selectedPlacement || isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
          >
            {isSubmitting
              ? 'Reassigning...'
              : keepInvoice
                ? 'Reassign (keep invoice)'
                : 'Reassign & Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}
