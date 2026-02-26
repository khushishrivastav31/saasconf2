import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { sanitizeHtml } from '../../utils/richText';
import portalApi from '../../config/portalApi';
import type { PortalConferenceSummary, PortalCFP } from '../../types/portal';

type InfoTab =
  | 'code_of_conduct'
  | 'incentives_conditions'
  | 'tips_for_submission'
  | 'guidelines_for_submissions'
  | 'faqs';

const TAB_CONFIG: {
  key: InfoTab;
  label: string;
  fieldKey: keyof PortalCFP;
}[] = [
  { key: 'code_of_conduct', label: 'Code of Conduct', fieldKey: 'code_of_conduct' },
  {
    key: 'incentives_conditions',
    label: 'Incentives & Conditions',
    fieldKey: 'incentives_conditions',
  },
  {
    key: 'tips_for_submission',
    label: 'Tips for a Strong Submission',
    fieldKey: 'tips_for_submission',
  },
  {
    key: 'guidelines_for_submissions',
    label: 'Guidelines for Submissions',
    fieldKey: 'guidelines_for_submissions',
  },
  { key: 'faqs', label: 'FAQs', fieldKey: 'faqs' },
];

function InfoPage() {
  const { conferenceId } = useParams<{ conferenceId: string }>();

  const { data: conferences, isLoading } = useQuery({
    queryKey: ['portal-conferences'],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceSummary[]>('/portal/conferences');
      return res.data;
    },
  });

  const conference = conferences?.find((c) => c.id === conferenceId);
  const cfps = useMemo(() => conference?.cfps ?? [], [conference?.cfps]);

  const [selectedCfpId, setSelectedCfpId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<InfoTab>('code_of_conduct');

  // Auto-select first CFP when conference loads
  useEffect(() => {
    if (cfps.length > 0 && !cfps.find((c) => c.id === selectedCfpId)) {
      setSelectedCfpId(cfps[0].id);
    }
  }, [cfps, selectedCfpId]);

  const selectedCfp = cfps.find((c) => c.id === selectedCfpId);
  const showCfpSelector = cfps.length > 1;

  const handleCfpChange = (cfpId: string) => {
    setSelectedCfpId(cfpId);
    setActiveTab('code_of_conduct');
  };

  // Only show tabs that have content (Code of Conduct always visible)
  const visibleTabs = useMemo(() => {
    if (!selectedCfp) return [TAB_CONFIG[0]];
    return TAB_CONFIG.filter((tab) => {
      if (tab.key === 'code_of_conduct') return true;
      const content = selectedCfp[tab.fieldKey];
      return (
        content !== null &&
        content !== undefined &&
        typeof content === 'string' &&
        content.trim() !== ''
      );
    });
  }, [selectedCfp]);

  // Reset tab if current tab is no longer visible
  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === activeTab)) {
      setActiveTab('code_of_conduct');
    }
  }, [visibleTabs, activeTab]);

  // Get content for active tab
  const activeTabConfig = TAB_CONFIG.find((t) => t.key === activeTab);
  const tabContent =
    selectedCfp && activeTabConfig
      ? (selectedCfp[activeTabConfig.fieldKey] as string | null)
      : null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!conference || cfps.length === 0) {
    return (
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{conference?.name ?? 'Info'}</h2>
          <p className="text-sm text-gray-500">Conference guidelines and information.</p>
        </div>
        <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          No information available for this conference.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{conference.name}</h2>
        <p className="text-sm text-gray-500">Conference guidelines and information.</p>
      </div>

      {/* CFP selector (only if multiple CFPs) */}
      {showCfpSelector && (
        <div className="mb-4">
          <select
            value={selectedCfpId}
            onChange={(e) => handleCfpChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {cfps.map((cfp) => (
              <option key={cfp.id} value={cfp.id}>
                {cfp.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {tabContent && tabContent.trim() ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(tabContent) }}
          />
        ) : activeTab === 'code_of_conduct' ? (
          <p className="text-sm text-gray-500 italic">
            No Code of Conduct has been published yet. Please check back later.
          </p>
        ) : (
          <p className="text-sm text-gray-400">No content available for this section.</p>
        )}
      </div>
    </div>
  );
}

export default InfoPage;
