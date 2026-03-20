import type { InvoiceLineItem } from '../../../../types';

interface InvoiceLineItemsEditorProps {
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number | undefined | null;
  taxAmount: number | undefined | null;
  total: number | undefined | null;
  currency: string;
  autoCalculateVat: boolean;
  setAutoCalculateVat: (v: boolean) => void;
  isLoadingVatPreview: boolean;
  setIsLoadingVatPreview: (v: boolean) => void;
  fmtAmount: (value: number | null | undefined) => string;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onUpdateItem: (index: number, field: keyof InvoiceLineItem, value: string | number) => void;
  onTaxRateChange: (rate: number) => void;
}

export default function InvoiceLineItemsEditor({
  lineItems,
  subtotal,
  taxRate,
  taxAmount,
  total,
  currency,
  autoCalculateVat,
  setAutoCalculateVat,
  isLoadingVatPreview,
  setIsLoadingVatPreview,
  fmtAmount,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onTaxRateChange,
}: InvoiceLineItemsEditorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Line Items
      </label>
      {lineItems.length > 0 && (
        <div className="overflow-x-auto mb-2">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Description
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">
                  Qty
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">
                  Unit Price
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">
                  Discount
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">
                  Total
                </th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={item.description}
                      onChange={(e) => onUpdateItem(index, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={item.quantity}
                      onChange={(e) => onUpdateItem(index, 'quantity', e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={item.unit_price}
                      onChange={(e) => onUpdateItem(index, 'unit_price', e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={item.discount ?? 0}
                      onChange={(e) => onUpdateItem(index, 'discount', e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                    {fmtAmount(item.total)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="text-gray-400 dark:text-gray-500 hover:text-red-500"
                      title="Remove"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={onAddItem}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Line Item
      </button>

      {/* Totals summary */}
      {lineItems.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {fmtAmount(subtotal)}
            </span>
          </div>

          {/* Auto-calculate VAT toggle */}
          <div className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              id="auto-calculate-vat"
              checked={autoCalculateVat}
              onChange={(e) => {
                setAutoCalculateVat(e.target.checked);
                if (!e.target.checked) {
                  setIsLoadingVatPreview(false);
                }
              }}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            />
            <label
              htmlFor="auto-calculate-vat"
              className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              Auto-calculate VAT
            </label>
            {isLoadingVatPreview && (
              <svg
                className="animate-spin h-4 w-4 text-primary-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
          </div>

          {autoCalculateVat && (
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Automatic VAT Calculation</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>
                  <strong>In-person/Hybrid (onsite):</strong> Uses Conference VAT Rates
                </li>
                <li>
                  <strong>Virtual B2C (EU):</strong> Uses EU Country VAT Rates (OSS)
                </li>
                <li>
                  <strong>Virtual B2B (EU):</strong> 0% with Reverse Charge notice
                </li>
              </ul>
              <p className="mt-1 text-xs italic">
                Based on customer location, VAT number, and booking attendance type.
              </p>
            </div>
          )}

          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">Tax Rate (%)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                disabled={autoCalculateVat}
                className={`w-20 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                  autoCalculateVat
                    ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                    : ''
                }`}
                value={taxRate ?? ''}
                onChange={(e) => {
                  if (!autoCalculateVat) {
                    onTaxRateChange(e.target.value ? parseFloat(e.target.value) : 0);
                  }
                }}
              />
            </div>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {fmtAmount(taxAmount)}
            </span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t border-gray-200 dark:border-gray-700 pt-2">
            <span className="text-gray-900 dark:text-gray-100">Total</span>
            <span className="text-gray-900 dark:text-gray-100">
              {fmtAmount(total)} {currency}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
