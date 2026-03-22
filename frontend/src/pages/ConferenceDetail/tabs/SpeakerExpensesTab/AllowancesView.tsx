import type { UseMutationResult } from '@tanstack/react-query';
import type { SpeakerAllowance } from '../../../../types/conference';

interface ExpenseTierItem {
  id: string;
  name: string;
  max_amount: number;
  currency: string;
}

interface AllowancesViewProps {
  isAdmin: boolean;
  allowances: SpeakerAllowance[] | undefined;
  tiers: ExpenseTierItem[];
  assignTier: UseMutationResult<
    void,
    Error,
    { cfpApplicantId: string; tierId: string; allowanceId?: string }
  >;
  formatCurrency: (amount: number, currency: string) => string;
}

export default function AllowancesView({
  isAdmin,
  allowances,
  tiers,
  assignTier,
  formatCurrency,
}: AllowancesViewProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Speaker
            </th>
            <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Tier
            </th>
            <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Allowance
            </th>
            <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Claimed
            </th>
            <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Approved
            </th>
            <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
              Remaining
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {allowances?.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                {a.speaker_name || '\u2014'}
              </td>
              <td className="px-4 py-3">
                {isAdmin && tiers.length > 0 ? (
                  <select
                    value={a.expense_tier_id || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        assignTier.mutate({
                          cfpApplicantId: a.cfp_applicant_id,
                          tierId: e.target.value,
                          allowanceId: a.id,
                        });
                      }
                    }}
                    className="text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1"
                  >
                    <option value="">&mdash; Select tier &mdash;</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({formatCurrency(t.max_amount, t.currency)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {a.expense_tier_name || '\u2014'}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                {formatCurrency(a.max_amount, a.currency)}
              </td>
              <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                {formatCurrency(a.total_claimed, a.currency)}
              </td>
              <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                {formatCurrency(a.total_approved, a.currency)}
              </td>
              <td
                className={`px-4 py-3 text-right ${a.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
              >
                {formatCurrency(a.remaining, a.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!allowances || allowances.length === 0) && (
        <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
          No speaker allowances configured. Set up allowance defaults by session type first.
        </div>
      )}
    </div>
  );
}
