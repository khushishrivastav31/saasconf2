import type { AllowanceDefault } from '../../../../types/conference';

interface DefaultsViewProps {
  allowanceDefaults: AllowanceDefault[] | undefined;
  formatCurrency: (amount: number, currency: string) => string;
}

export default function DefaultsView({ allowanceDefaults, formatCurrency }: DefaultsViewProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Set maximum expense allowances per session type. When a speaker is assigned to a session,
          their allowance is automatically set from the session type default.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Session Type
            </th>
            <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Max Amount
            </th>
            <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Currency
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {allowanceDefaults?.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                {d.session_type_name || '\u2014'}
              </td>
              <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                {formatCurrency(d.max_amount, d.currency)}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!allowanceDefaults || allowanceDefaults.length === 0) && (
        <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
          No allowance defaults configured. Use the API to set defaults per session type.
        </div>
      )}
    </div>
  );
}
