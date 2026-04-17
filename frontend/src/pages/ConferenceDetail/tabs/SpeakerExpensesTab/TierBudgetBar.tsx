import { formatCurrency } from '../../../../utils/formatCurrency';
import type { SpeakerAllowance } from '../../../../types/conference';
import type { ExpenseTierItem } from './types';

interface Props {
  allowance: SpeakerAllowance | undefined;
  tiers: ExpenseTierItem[];
  cfpApplicantId: string;
  isAdmin: boolean;
  onAssignTier: (args: { cfpApplicantId: string; tierId: string; allowanceId?: string }) => void;
}

export default function TierBudgetBar({
  allowance,
  tiers,
  cfpApplicantId,
  isAdmin,
  onAssignTier,
}: Props) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2 flex items-center gap-4 text-sm flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">Tier:</span>
        {isAdmin && tiers.length > 0 ? (
          <select
            value={allowance?.expense_tier_id || ''}
            onChange={(e) => {
              if (e.target.value) {
                onAssignTier({
                  cfpApplicantId,
                  tierId: e.target.value,
                  allowanceId: allowance?.id,
                });
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1"
          >
            <option value="">— Select tier —</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({formatCurrency(t.max_amount, t.currency)})
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-700 dark:text-gray-300 font-medium">
            {allowance?.expense_tier_name || 'Not assigned'}
          </span>
        )}
      </div>
      {allowance && (
        <>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-gray-500 dark:text-gray-400">
            Budget:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {formatCurrency(allowance.max_amount, allowance.currency)}
            </span>
          </span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-gray-500 dark:text-gray-400">
            Approved:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {formatCurrency(allowance.total_approved, allowance.currency)}
            </span>
          </span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span
            className={`font-medium ${allowance.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
          >
            Remaining: {formatCurrency(allowance.remaining, allowance.currency)}
          </span>
        </>
      )}
      {!allowance && tiers.length > 0 && (
        <span className="text-gray-400 dark:text-gray-500 italic">
          Select a tier to set the budget
        </span>
      )}
      {!allowance && tiers.length === 0 && (
        <span className="text-gray-400 dark:text-gray-500 italic">
          Create expense tiers in Settings &gt; Finance &gt; Speaker Expenses
        </span>
      )}
    </div>
  );
}
