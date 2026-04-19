import HistoryPanel from '../pages/MyCompany/UsersTab/HistoryPanel';

interface Props {
  portalUserId: string;
  title?: string;
}

export default function CustomerTimelineCard({ portalUserId, title = 'Activity' }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h4>
      </div>
      <HistoryPanel userId={portalUserId} />
    </div>
  );
}
