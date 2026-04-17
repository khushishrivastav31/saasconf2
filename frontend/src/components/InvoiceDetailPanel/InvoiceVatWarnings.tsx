import type { Invoice } from '../../types';

export default function InvoiceVatWarnings({ invoice }: { invoice: Invoice }) {
  const hasWarnings = !!(invoice.vat_warnings && invoice.vat_warnings.length > 0);
  const showRequirement =
    !!invoice.vat_requirement &&
    invoice.vat_requirement.level !== 'optional' &&
    (!invoice.vat_warnings || invoice.vat_warnings.length === 0);

  if (!hasWarnings && !showRequirement) return null;

  return (
    <>
      {hasWarnings && (
        <div className="px-6 pt-4 space-y-2">
          {invoice.vat_warnings!.map((warning, idx) => (
            <div
              key={idx}
              className={`px-4 py-3 rounded border text-sm ${
                warning.level === 'error'
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
                  : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800'
              }`}
            >
              <div className="flex items-start gap-2">
                {warning.level === 'error' ? (
                  <svg
                    className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}

                <div className="flex-1">
                  <p
                    className={`font-medium mb-1 ${
                      warning.level === 'error'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-yellow-700 dark:text-yellow-300'
                    }`}
                  >
                    {warning.level === 'error' ? 'VAT Number Required' : 'VAT Number Recommended'}
                  </p>
                  <p
                    className={`whitespace-pre-line ${
                      warning.level === 'error'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-yellow-700 dark:text-yellow-300'
                    }`}
                  >
                    {warning.message}
                  </p>
                  {warning.requirement.rule_reference && (
                    <p className="text-xs mt-2 opacity-80">
                      Reference: {warning.requirement.rule_reference}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRequirement && (
        <div className="px-6 pt-4">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-4 py-3 rounded text-sm">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1 text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">VAT Rule Applied</p>
                <p>{invoice.vat_requirement!.reason}</p>
                {invoice.vat_requirement!.rule_reference && (
                  <p className="text-xs mt-2 opacity-80">
                    {invoice.vat_requirement!.rule_reference}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
