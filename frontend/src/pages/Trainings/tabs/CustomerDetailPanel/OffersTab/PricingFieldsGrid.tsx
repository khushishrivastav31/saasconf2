import { inputClass } from './styles';

interface Currency {
  code: string;
  name: string;
}

interface Props {
  attendees: number | null;
  trainingPrice: number | null;
  certificationPrice: number | null;
  currency: string;
  currencies: Currency[];
  onChange: (
    field: 'attendees' | 'training_price' | 'certification_price' | 'currency',
    value: number | string | null
  ) => void;
  compactLabels?: boolean;
}

export default function PricingFieldsGrid({
  attendees,
  trainingPrice,
  certificationPrice,
  currency,
  currencies,
  onChange,
  compactLabels = false,
}: Props) {
  const labelCls = compactLabels
    ? 'block text-xs text-gray-500 dark:text-gray-400 mb-1'
    : 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="grid grid-cols-4 gap-4">
      <div>
        <label className={labelCls}>Attendees</label>
        <input
          type="number"
          min={0}
          className={inputClass}
          value={attendees ?? ''}
          onChange={(e) => onChange('attendees', e.target.value ? Number(e.target.value) : null)}
        />
      </div>
      <div>
        <label className={labelCls}>Training Price</label>
        <input
          type="number"
          min={0}
          step="0.01"
          className={inputClass}
          value={trainingPrice ?? ''}
          onChange={(e) =>
            onChange('training_price', e.target.value ? Number(e.target.value) : null)
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
          value={certificationPrice ?? ''}
          onChange={(e) =>
            onChange('certification_price', e.target.value ? Number(e.target.value) : null)
          }
        />
      </div>
      <div>
        <label className={labelCls}>Currency</label>
        <select
          className={inputClass}
          value={currency}
          onChange={(e) => onChange('currency', e.target.value)}
        >
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
