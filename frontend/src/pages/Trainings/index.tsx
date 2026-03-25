import { lazy, Suspense, useState, useMemo, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../utils/apiError';
import { useTrainingsModule } from './useTrainingsModule';

// Lazy-loaded tab components
const ProgramYearManager = lazy(() => import('./tabs/program/ProgramYearManager'));
const DesignProgramTab = lazy(() => import('./tabs/program/DesignProgramTab'));
const AssignTrainersTab = lazy(() => import('./tabs/program/AssignTrainersTab'));
const FinalProgramTab = lazy(() => import('./tabs/program/FinalProgramTab'));
const CustomersTab = lazy(() => import('./tabs/CustomersTab'));
const InhouseTrainingsTab = lazy(() => import('./tabs/InhouseTrainingsTab'));
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

/** Parse dynamic program section IDs like "program-2026-design" */
function parseProgramSection(section: string): { year: number; tab: string } | null {
  const match = section.match(/^program-(\d{4})-(design|trainers|final)$/);
  if (!match) return null;
  return { year: Number(match[1]), tab: match[2] };
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
    programYears,
    refetchProgramYears,
  } = useTrainingsModule();

  const programInfo = useMemo(() => parseProgramSection(activeSection), [activeSection]);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Track which program years are collapsed in the sidebar
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const [yearToDelete, setYearToDelete] = useState<{ id: string; year: number } | null>(null);

  // Auto-collapse past years: only latest year expanded
  const latestYear = useMemo(
    () => (programYears.length > 0 ? Math.max(...programYears.map((py) => py.year)) : null),
    [programYears]
  );

  useEffect(() => {
    if (programYears.length > 1 && latestYear) {
      setCollapsedYears(
        new Set(programYears.filter((py) => py.year !== latestYear).map((py) => String(py.year)))
      );
    }
  }, [programYears, latestYear]);

  const toggleYearCollapse = useCallback((year: string) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (yearId: string) => {
      await api.delete(`/trainings/programs/years/${yearId}`);
    },
    onSuccess: () => {
      refetchProgramYears();
      queryClient.invalidateQueries({ queryKey: ['training-program-years'] });
      showToast('Program year deleted', 'success');
      setYearToDelete(null);
      setActiveSection('program');
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      setYearToDelete(null);
    },
  });

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
                          {section.children && section.children.length > 0 && !sidebarCollapsed && (
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
                          section.children.length > 0 &&
                          expandedSections.has(section.id) &&
                          !sidebarCollapsed && (
                            <div className="ml-4 mb-1 space-y-0.5">
                              {section.children.map((child, childIdx) => {
                                const prevGroup =
                                  childIdx > 0 ? section.children![childIdx - 1].group : undefined;
                                const showGroupHeader = child.group && child.group !== prevGroup;
                                const isYearGroup = child.group && /^\d{4}$/.test(child.group);
                                const isYearCollapsed =
                                  isYearGroup && collapsedYears.has(child.group!);
                                const currentCalendarYear = new Date().getFullYear();
                                const isPastYear =
                                  isYearGroup && Number(child.group) < currentCalendarYear;
                                const yearObj = isYearGroup
                                  ? programYears.find((py) => py.year === Number(child.group))
                                  : null;

                                // Skip rendering children of collapsed years
                                if (isYearGroup && isYearCollapsed && !showGroupHeader) return null;

                                return (
                                  <div key={child.id}>
                                    {showGroupHeader && isYearGroup ? (
                                      <div
                                        className={`flex items-center justify-between ${childIdx > 0 ? 'pt-2 mt-1 border-t border-gray-200 dark:border-gray-700' : 'pt-1'} pb-0.5`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => toggleYearCollapse(child.group!)}
                                          className="flex items-center gap-1 px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                                        >
                                          <svg
                                            className={`w-3 h-3 transition-transform ${isYearCollapsed ? '' : 'rotate-90'}`}
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
                                          {child.group}
                                        </button>
                                        {isPastYear && yearObj && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setYearToDelete({
                                                id: yearObj.id,
                                                year: yearObj.year,
                                              })
                                            }
                                            className="p-0.5 mr-2 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                            title={`Delete ${child.group}`}
                                          >
                                            <svg
                                              className="w-3.5 h-3.5"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                              />
                                            </svg>
                                          </button>
                                        )}
                                      </div>
                                    ) : showGroupHeader ? (
                                      <p
                                        className={`px-3 font-semibold tracking-wider text-gray-400 dark:text-gray-500 ${childIdx > 0 ? 'pt-2 mt-1 border-t border-gray-200 dark:border-gray-700' : 'pt-1'} pb-0.5 text-[9px] uppercase`}
                                      >
                                        {child.group}
                                      </p>
                                    ) : null}
                                    {!isYearCollapsed && (
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
                                    )}
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
              {activeSection === 'program' && (
                <ProgramYearManager
                  programYears={programYears}
                  onNavigateToYear={(year) => setActiveSection(`program-${year}-design`)}
                />
              )}
              {programInfo?.tab === 'design' && <DesignProgramTab year={programInfo.year} />}
              {programInfo?.tab === 'trainers' && <AssignTrainersTab year={programInfo.year} />}
              {programInfo?.tab === 'final' && <FinalProgramTab year={programInfo.year} />}
              {activeSection === 'inhouse-trainings' && <InhouseTrainingsTab />}
              {activeSection === 'offer-management' && (
                <div className="text-center py-12">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Offer Management
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Coming soon.</p>
                </div>
              )}
              {activeSection === 'customers' && <CustomersTab />}
              {activeSection === 'attendees' && (
                <div className="text-center py-12">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Attendees
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Coming soon.</p>
                </div>
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

      {/* Delete year confirmation dialog */}
      {yearToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Program Year {yearToDelete.year}?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This will permanently delete the {yearToDelete.year} program year and all its
              placements. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setYearToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(yearToDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
