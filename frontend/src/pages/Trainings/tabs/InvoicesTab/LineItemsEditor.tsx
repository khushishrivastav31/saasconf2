import type { LineItemInput } from './types';

export default function LineItemsEditor({
  items,
  currency,
  onChange,
}: {
  items: LineItemInput[];
  currency: string;
  onChange: (items: LineItemInput[]) => void;
}) {
  const sym = currency === 'EUR' ? '€' : currency || '';
  const update = (idx: number, field: keyof LineItemInput, value: string) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, { description: '', quantity: '1', unit_price: '' }]);

  return (
    <div>
      <table className="min-w-full text-sm mb-2">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left font-medium text-gray-500 dark:text-gray-400">
              Description
            </th>
            <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-16">
              Qty
            </th>
            <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-28">
              Unit Price
            </th>
            <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 w-24">
              Total
            </th>
            <th className="py-2 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {items.map((it, i) => {
            const rowTotal = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
            return (
              <tr key={i}>
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => update(i, 'description', e.target.value)}
                    placeholder="Description"
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    value={it.quantity}
                    onChange={(e) => update(i, 'quantity', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    value={it.unit_price}
                    onChange={(e) => update(i, 'unit_price', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
                  />
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {`${sym}\u00A0${rowTotal.toFixed(2)}`}
                </td>
                <td className="py-1.5 pl-2">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Line Item
      </button>
    </div>
  );
}

export function InvoiceTotalsEditor({
  sym,
  subtotal,
  taxRate,
  taxAmount,
  total,
  onTaxRateChange,
}: {
  sym: string;
  subtotal: number;
  taxRate: string;
  taxAmount: number;
  total: number;
  onTaxRateChange: (v: string) => void;
}) {
  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-1.5 text-sm max-w-xs ml-auto">
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
        <span className="tabular-nums">{`${sym}\u00A0${subtotal.toFixed(2)}`}</span>
      </div>
      <div className="flex justify-between items-center gap-4">
        <span className="text-gray-500 dark:text-gray-400">VAT rate (%)</span>
        <input
          type="number"
          value={taxRate}
          onChange={(e) => onTaxRateChange(e.target.value)}
          className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
        />
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-gray-400">VAT amount</span>
        <span className="tabular-nums">{`${sym}\u00A0${taxAmount.toFixed(2)}`}</span>
      </div>
      <div className="flex justify-between font-semibold text-base pt-1 border-t border-gray-200 dark:border-gray-700">
        <span className="text-gray-900 dark:text-gray-100">Total</span>
        <span className="tabular-nums">{`${sym}\u00A0${total.toFixed(2)}`}</span>
      </div>
    </div>
  );
}
