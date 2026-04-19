import DataRightsPanel from '../../components/portal/DataRightsPanel';
import PrivacyMyDataPanel from '../../components/portal/PrivacyMyDataPanel';

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Privacy</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Download your data, request deletion, or review your rights under the GDPR.
        </p>
      </div>
      <div className="space-y-6">
        <PrivacyMyDataPanel />
        <DataRightsPanel />
      </div>
    </div>
  );
}
