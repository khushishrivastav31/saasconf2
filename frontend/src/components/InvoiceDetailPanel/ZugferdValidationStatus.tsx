import { useQuery } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import type { ZugferdValidationResult } from '../../types';

interface Props {
  invoiceId: string;
  conferenceId: string;
}

export default function ZugferdValidationStatus({ invoiceId, conferenceId }: Props) {
  const { data: invoiceSettings } = useQuery({
    queryKey: queryKeys.invoiceSettings(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/settings/invoice-settings`);
      return res.data;
    },
  });

  const zugferdEnabled = invoiceSettings?.zugferd_settings?.enabled || false;

  const {
    data: validation,
    isLoading,
    error,
  } = useQuery<ZugferdValidationResult>({
    queryKey: ['invoice-zugferd-validation', invoiceId],
    queryFn: async () => {
      const res = await api.post(
        `/conferences/${conferenceId}/invoices/${invoiceId}/validate-zugferd`
      );
      return res.data;
    },
    enabled: zugferdEnabled,
    staleTime: 60000,
  });

  if (!zugferdEnabled) return null;
  if (isLoading) return null;
  if (error) return null;
  if (!validation) return null;

  return (
    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
      <div
        className={`rounded-lg p-4 ${
          validation.valid
            ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
            : 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            {validation.valid ? (
              <svg
                className="w-5 h-5 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {validation.valid ? 'ZUGFeRD Compliant' : 'ZUGFeRD Validation Issues'}
              </h5>
              {validation.profile && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono">
                  {validation.profile}
                </span>
              )}
            </div>

            {validation.valid && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                This invoice meets all ZUGFeRD requirements and will include embedded XML when
                downloaded.
              </p>
            )}

            {!validation.valid && validation.errors && validation.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mb-1">
                  Missing or invalid data:
                </p>
                <ul className="space-y-0.5">
                  {validation.errors.map((error, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-300">
                      • {error}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                  Invoice will be generated as standard PDF without ZUGFeRD XML until these issues
                  are resolved.
                </p>
              </div>
            )}

            {validation.warnings && validation.warnings.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mb-1">
                  Warnings:
                </p>
                <ul className="space-y-0.5">
                  {validation.warnings.map((warning, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-300">
                      • {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
