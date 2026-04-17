import type { AvailablePlacement } from '../../../../../types/training';
import RichTextEditor from '../../../../../components/common/RichTextEditor';
import PlacementPicker from './PlacementPicker';
import { inputClass } from './styles';
import type { CreateOfferForm, OfferType } from './types';

interface Currency {
  code: string;
  name: string;
}

interface Props {
  offerType: OfferType;
  form: CreateOfferForm;
  onFormChange: (form: CreateOfferForm) => void;
  placementsByYear: Array<{ year: number; placements: AvailablePlacement[] }>;
  placementSearch: string;
  onPlacementSearchChange: (value: string) => void;
  currencies: Currency[];
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

export default function CreateOfferView({
  offerType,
  form,
  onFormChange,
  placementsByYear,
  placementSearch,
  onPlacementSearchChange,
  currencies,
  onCancel,
  onSubmit,
  isPending,
}: Props) {
  const title = offerType === 'open' ? 'Create Open Training Offer' : 'Create Inhouse/Hybrid Offer';
  const placementLabel =
    offerType === 'open'
      ? 'Select Open Training Placements'
      : 'Select Trainings (Inhouse/Hybrid placements)';

  const togglePlacement = (id: string, checked: boolean) => {
    onFormChange({
      ...form,
      placement_ids: checked
        ? [...form.placement_ids, id]
        : form.placement_ids.filter((x) => x !== id),
    });
  };

  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {placementLabel}
        </label>
        <input
          type="text"
          placeholder="Search placements..."
          className={`${inputClass} mb-2`}
          value={placementSearch}
          onChange={(e) => onPlacementSearchChange(e.target.value)}
        />
        <PlacementPicker
          placementsByYear={placementsByYear}
          selectedIds={form.placement_ids}
          onToggle={togglePlacement}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>Attendees</label>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.attendees ?? ''}
            onChange={(e) =>
              onFormChange({
                ...form,
                attendees: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Training Price</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={form.training_price ?? ''}
            onChange={(e) =>
              onFormChange({
                ...form,
                training_price: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Certification Price</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={form.certification_price ?? ''}
            onChange={(e) =>
              onFormChange({
                ...form,
                certification_price: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <select
            className={inputClass}
            value={form.currency}
            onChange={(e) => onFormChange({ ...form, currency: e.target.value })}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>PO Number</label>
          <input
            type="text"
            className={inputClass}
            value={form.po_number ?? ''}
            onChange={(e) => onFormChange({ ...form, po_number: e.target.value || null })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Comments</label>
        <RichTextEditor
          value={form.comments ?? ''}
          onChange={(html) => onFormChange({ ...form, comments: html || null })}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending || form.placement_ids.length === 0}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Creating...' : 'Create Offer'}
        </button>
      </div>
    </div>
  );
}
