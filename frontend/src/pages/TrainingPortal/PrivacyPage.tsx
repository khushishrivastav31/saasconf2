import React from 'react';
import DataRightsPanel from '../../components/portal/DataRightsPanel';
import PrivacyMyDataPanel from '../../components/portal/PrivacyMyDataPanel';

const PrivacyPage = React.memo(function PrivacyPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Privacy</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Download your data, request deletion, or review your rights under the GDPR.
        </p>
      </div>
      <div className="space-y-6">
        <PrivacyMyDataPanel />
        <DataRightsPanel />
      </div>
    </div>
  );
});

export default PrivacyPage;
