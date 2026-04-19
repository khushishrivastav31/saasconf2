import DataRightsPanel from '../../components/portal/DataRightsPanel';

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your data rights</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          What you can ask the event organizer under the EU General Data Protection Regulation.
        </p>
      </div>
      <DataRightsPanel />
    </div>
  );
}
