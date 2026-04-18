import RegistrationRow, { type ExamLanguage } from './RegistrationRow';
import OfferAttendeeRow, { groupOfferAttendeesByOffer } from './OfferAttendeeRow';
import { formatTrainingDate, type TrainingGroup } from './registrationGroups';

interface Props {
  group: TrainingGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  examLanguages: ExamLanguage[];
  expandedRegId: string | null;
  setExpandedRegId: (id: string | null) => void;
  guaranteedPending: boolean;
  activePending: boolean;
  onToggleGuaranteed: (yearId: string, placementId: string) => void;
  onToggleActive: (yearId: string, placementId: string, hasAttendees: boolean) => void;
  onNavigateOffer: (customerId: string, offerId: string) => void;
}

export default function TrainingGroupRow({
  group,
  isCollapsed,
  onToggle,
  examLanguages,
  expandedRegId,
  setExpandedRegId,
  guaranteedPending,
  activePending,
  onToggleGuaranteed,
  onToggleActive,
  onNavigateOffer,
}: Props) {
  const isEmpty = group.registrations.length === 0 && group.offerAttendees.length === 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div
        role={isEmpty ? undefined : 'button'}
        tabIndex={isEmpty ? undefined : 0}
        onClick={() => !isEmpty && onToggle()}
        onKeyDown={(e) => {
          if (isEmpty) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={!isCollapsed && !isEmpty}
        className={`w-full grid grid-cols-[20px_minmax(0,1fr)_100px_120px_90px_minmax(0,200px)_32px] items-center gap-x-4 px-4 py-3 bg-gray-50 dark:bg-gray-800 transition-colors text-left ${
          isEmpty ? 'cursor-default' : 'hover:bg-gray-100 dark:hover:bg-gray-750 cursor-pointer'
        }`}
      >
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isEmpty ? 'invisible' : isCollapsed ? '' : 'rotate-90'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <span
          className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate"
          title={group.trainingName}
        >
          {group.trainingName}
        </span>

        <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          {formatTrainingDate(group.trainingDate)}
        </span>

        {group.programYearId ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              if (guaranteedPending) return;
              onToggleGuaranteed(group.programYearId!, group.placementId);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (guaranteedPending) return;
                onToggleGuaranteed(group.programYearId!, group.placementId);
              }
            }}
            title={
              group.isGuaranteed ? 'Click to remove Guaranteed' : 'Click to mark as Guaranteed'
            }
            className={
              group.isGuaranteed
                ? 'w-full inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors cursor-pointer'
                : 'w-full inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-medium text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer'
            }
          >
            {group.isGuaranteed ? 'Guaranteed' : 'Set guaranteed'}
          </span>
        ) : (
          <span />
        )}

        {group.programYearId ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              if (activePending) return;
              onToggleActive(group.programYearId!, group.placementId, group.totalAttendees > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (activePending) return;
                onToggleActive(group.programYearId!, group.placementId, group.totalAttendees > 0);
              }
            }}
            title={
              group.isActive
                ? group.totalAttendees > 0
                  ? 'Cannot deactivate: training has attendees'
                  : 'Click to deactivate (hide from registration + offers)'
                : 'Click to reactivate'
            }
            className={
              group.isActive
                ? group.totalAttendees > 0
                  ? 'w-full inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 cursor-not-allowed'
                  : 'w-full inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer'
                : 'w-full inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors cursor-pointer'
            }
          >
            {group.isActive ? 'Active' : 'Inactive'}
          </span>
        ) : (
          <span />
        )}

        <span
          className="text-xs text-gray-500 dark:text-gray-400 truncate"
          title={group.trainerNames.join(', ')}
        >
          {group.trainerNames.length > 0 ? (
            <>
              <svg
                className="inline-block w-3 h-3 mr-1 -mt-0.5 opacity-60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              {group.trainerNames.join(', ')}
            </>
          ) : (
            <span className="text-gray-300 dark:text-gray-600">—</span>
          )}
        </span>

        <span
          className={`text-base font-bold text-right tabular-nums ${
            group.totalAttendees === 0
              ? 'text-red-600 dark:text-red-400'
              : group.totalAttendees <= 4
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-green-600 dark:text-green-400'
          }`}
          title={`${group.totalAttendees} attendee${group.totalAttendees === 1 ? '' : 's'}`}
        >
          {group.totalAttendees}
        </span>
      </div>

      {!isCollapsed && !isEmpty && (
        <table className="min-w-full text-sm table-fixed">
          <colgroup>
            <col className="w-8" />
            <col style={{ width: '28%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr className="border-t border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
              <th className="px-3 py-2" />
              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                Contact
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                Email
              </th>
              <th className="px-3 py-2 text-center font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                Attendees
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                Status
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                Payment
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {group.registrations.map((reg) => {
              const isExpanded = expandedRegId === reg.id;
              return (
                <RegistrationRow
                  key={reg.id}
                  reg={reg}
                  examLanguages={examLanguages}
                  expanded={isExpanded}
                  onToggle={() => setExpandedRegId(isExpanded ? null : reg.id)}
                />
              );
            })}
            {groupOfferAttendeesByOffer(group.offerAttendees).map((oag) => {
              const oaExpanded = expandedRegId === `oa-${oag.offerId}`;
              return (
                <OfferAttendeeRow
                  key={`oag-${oag.offerId}`}
                  group={oag}
                  examLanguages={examLanguages}
                  expanded={oaExpanded}
                  onToggle={() => setExpandedRegId(oaExpanded ? null : `oa-${oag.offerId}`)}
                  onNavigate={() => onNavigateOffer(oag.customerId, oag.offerId)}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
