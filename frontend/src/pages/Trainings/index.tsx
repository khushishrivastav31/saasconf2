import { lazy, Suspense } from 'react';
import { useTrainingsModule } from './useTrainingsModule';

// Lazy-loaded tab components
const TrainingsListTab = lazy(() => import('./tabs/TrainingsListTab'));
const TeamTab = lazy(() => import('./tabs/TeamTab'));
const SettingsTab = lazy(() => import('./tabs/SettingsTab'));
const RegistrationsTab = lazy(() => import('./tabs/RegistrationsTab'));
const InvoicesTab = lazy(() => import('./tabs/InvoicesTab'));
const PaymentRemindersTab = lazy(() => import('./tabs/PaymentRemindersTab'));
const MessagesTab = lazy(() => import('./tabs/MessagesTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const RevenueTab = lazy(() => import('./tabs/analytics/RevenueTab'));
const TrainingsStatisticsTab = lazy(() => import('./tabs/analytics/TrainingsStatisticsTab'));

function LazyFallback() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  );
}

export default function Trainings() {
  const {
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    expandedSections,
    setExpandedSections,
    filteredGroups,
    setSelectedTrainingId,
    selectedTraining,
    refetchTraining,
  } = useTrainingsModule();

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Training Management
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage trainings, trainers, registrations, and more.
            </p>
          </div>
          {selectedTraining && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg">
              <span className="text-sm text-primary-700 dark:text-primary-300 font-medium">
                {selectedTraining.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedTrainingId(null)}
                className="text-primary-400 hover:text-primary-600 dark:hover:text-primary-200"
                title="Deselect training"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Section navigation sidebar */}
        <nav
          className={`shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-14' : 'w-56'}`}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-2 sticky top-24 flex flex-col"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          >
            {/* Collapse toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="shrink-0 w-full flex items-center justify-center p-1.5 mb-1 border-b border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-t-md hover:bg-gray-100 dark:hover:bg-gray-700"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sidebarCollapsed ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                )}
              </svg>
            </button>
            <div className="flex-1 overflow-y-auto">
              {filteredGroups.map((group, groupIdx) => (
                <div key={group.name}>
                  {groupIdx > 0 && (
                    <div
                      className={`border-t border-gray-200 dark:border-gray-700 ${sidebarCollapsed ? 'my-1.5 mx-1' : 'my-2 mx-1'}`}
                    />
                  )}
                  {!sidebarCollapsed && (
                    <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {group.name}
                    </p>
                  )}
                  {group.sections.map((section) => {
                    const isParentActive =
                      activeSection === section.id ||
                      (section.children?.some((c) => c.id === activeSection) ?? false);
                    return (
                      <div key={section.id}>
                        <div className="flex items-center">
                          <button
                            onClick={() => setActiveSection(section.id)}
                            title={sidebarCollapsed ? section.name : undefined}
                            className={`flex-1 flex items-center rounded-md mb-0.5 ${
                              sidebarCollapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
                            } text-sm font-medium ${
                              isParentActive
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                          >
                            <section.icon />
                            {!sidebarCollapsed && <span className="ml-3">{section.name}</span>}
                          </button>
                          {section.children && !sidebarCollapsed && (
                            <button
                              onClick={() =>
                                setExpandedSections((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(section.id)) {
                                    next.delete(section.id);
                                  } else {
                                    next.add(section.id);
                                  }
                                  return next;
                                })
                              }
                              className="p-1 mr-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                                  expandedSections.has(section.id) ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Expandable children */}
                        {section.children &&
                          expandedSections.has(section.id) &&
                          !sidebarCollapsed && (
                            <div className="ml-4 mb-1 space-y-0.5">
                              {section.children.map((child, childIdx) => {
                                const prevGroup =
                                  childIdx > 0 ? section.children![childIdx - 1].group : undefined;
                                const showGroupHeader = child.group && child.group !== prevGroup;
                                return (
                                  <div key={child.id}>
                                    {showGroupHeader && (
                                      <p
                                        className={`px-3 text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${childIdx > 0 ? 'pt-2 mt-1 border-t border-gray-200 dark:border-gray-700' : 'pt-1'} pb-0.5`}
                                      >
                                        {child.group}
                                      </p>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setActiveSection(child.id)}
                                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                                        activeSection === child.id
                                          ? 'bg-primary-50 text-primary-700 font-medium'
                                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                      }`}
                                    >
                                      <child.icon />
                                      <span className="truncate text-left">{child.name}</span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <Suspense fallback={<LazyFallback />}>
              {activeSection === 'trainings-list' && (
                <>
                  <TrainingsListTab
                    onSelectTraining={(id) => setSelectedTrainingId(id)}
                    selectedTrainingId={selectedTraining?.id ?? null}
                  />
                  {selectedTraining && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                      <TeamTab training={selectedTraining} onUpdate={refetchTraining} />
                    </div>
                  )}
                </>
              )}
              {activeSection === 'registrations' && <RegistrationsTab />}
              {activeSection === 'invoices' && <InvoicesTab />}
              {activeSection === 'payment-reminders' && <PaymentRemindersTab />}
              {activeSection === 'messages' && <MessagesTab />}
              {activeSection === 'news' && <NewsTab />}
              {activeSection === 'analytics' && <RevenueTab />}
              {activeSection === 'analytics-revenue' && <RevenueTab />}
              {activeSection === 'analytics-statistics' && <TrainingsStatisticsTab />}
              {/* Settings: parent or any settings-* child */}
              {(activeSection === 'settings' || activeSection.startsWith('settings-')) && (
                <SettingsTab activeSection={activeSection} />
              )}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
