import type { InvoiceUpdate, InvoiceLineItem } from '../../types';

interface InvoiceLineItemsTabProps {
  formData: InvoiceUpdate;
  updateLineItem: (index: number, field: keyof InvoiceLineItem, value: string | number) => void;
  addLineItem: () => void;
  removeLineItem: (index: number) => void;
  handleTaxRateChange: (rate: number) => void;
  readOnly?: boolean;
}

export default function InvoiceLineItemsTab({
  formData,
  updateLineItem,
  addLineItem,
  removeLineItem,
  handleTaxRateChange,
  readOnly = false,
}: InvoiceLineItemsTabProps) {
  return (
    <div className="px-6 py-5">
      <div className="space-y-4">
        {/* Line items table */}
        <div className="overflow-x-auto">
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
                {!readOnly && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(formData.line_items || []).map((item, index) => (
                <tr key={index}>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {item.description}
                      </span>
                    ) : (
                      <input
                        type="text"
                        className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={item.description}
                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                        placeholder="Item description"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className="text-sm text-right block text-gray-900 dark:text-gray-100">
                        {item.quantity}
                      </span>
                    ) : (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className="text-sm text-right block text-gray-900 dark:text-gray-100">
                        {Number(item.unit_price).toFixed(2)}
                      </span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(index, 'unit_price', e.target.value)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className="text-sm text-right block text-gray-900 dark:text-gray-100">
                        {Number(item.discount ?? 0).toFixed(2)}
                      </span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1.5 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={item.discount ?? 0}
                        onChange={(e) => updateLineItem(index, 'discount', e.target.value)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                    {Number(item.total).toFixed(2)}
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={addLineItem}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Line Item
          </button>
        )}

        {/* Discount Code Display */}
        {formData.discount_code && (
          <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md">
            <span className="font-medium">Discount Code Applied:</span>{' '}
            <span className="text-gray-900 dark:text-gray-100">{formData.discount_code}</span>
            {formData.discount_amount && formData.discount_amount > 0 && (
              <span className="ml-2 text-green-600 dark:text-green-400">
                (Total Savings: {formData.discount_amount.toFixed(2)} {formData.currency || 'EUR'})
              </span>
            )}
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {(formData.subtotal ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">Tax Rate (%)</span>
              {readOnly ? (
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {formData.tax_rate ?? 0}
                </span>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="w-20 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-1 px-2 text-sm text-right focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={formData.tax_rate ?? ''}
                  onChange={(e) =>
                    handleTaxRateChange(e.target.value ? parseFloat(e.target.value) : 0)
                  }
                />
              )}
            </div>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {(formData.tax_amount ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t border-gray-200 dark:border-gray-700 pt-2">
            <span className="text-gray-900 dark:text-gray-100">Total</span>
            <span className="text-gray-900 dark:text-gray-100">
              {(formData.total ?? 0).toFixed(2)} {formData.currency || ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
