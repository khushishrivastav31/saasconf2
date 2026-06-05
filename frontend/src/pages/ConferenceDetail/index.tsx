import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import { useToast } from '../../components/Toast';
import UnsavedChangesDialog from '../../components/UnsavedChangesDialog';
import { BackIcon } from './icons';
import { useConferenceDetail } from './useConferenceDetail';
import { SelectionProvider, useSelection } from './SelectionContext';
import { DirtyContext } from './DirtyContext';

// Lazy-loaded tab components
const ConferenceDetailsTab = lazy(() => import('./tabs/DetailsTab'));
const ConferenceTeamTab = lazy(() => import('./tabs/TeamTab'));
const ConferenceSocialTab = lazy(() => import('./tabs/SocialTab'));
const TaskAssignmentTab = lazy(() => import('./tabs/TaskAssignmentTab'));
const VolunteersTab = lazy(() => import('./tabs/VolunteersTab'));
const VolunteerAssignmentTab = lazy(() => import('./tabs/VolunteerAssignmentTab'));
const VolunteerScheduleTab = lazy(() => import('./tabs/VolunteerScheduleTab'));
const ConferenceLocationsTab = lazy(() => import('./tabs/LocationsTab'));
const ConferenceCFPsTab = lazy(() => import('./tabs/CFPsTab'));
const ConferenceSponsorsTab = lazy(() => import('./tabs/SponsorsTab'));
const ConferenceBookingTab = lazy(() => import('./tabs/BookingTab'));
const ConferenceInvoicesTab = lazy(() => import('./tabs/InvoicesTab'));
const PaymentRemindersTab = lazy(() => import('./tabs/PaymentRemindersTab'));
const ConferenceServiceProvidersTab = lazy(() => import('./tabs/ServiceProvidersTab'));
const ConferenceSettingsTab = lazy(() => import('./tabs/SettingsTab'));
const ProgramDesignTab = lazy(() => import('./tabs/ProgramDesignTab'));
const ProgramBuildTab = lazy(() => import('./tabs/ProgramBuildTab'));
const SessionsTab = lazy(() => import('./tabs/SessionsTab'));
const SpeakersTab = lazy(() => import('./tabs/SpeakersTab'));
const MessagingTab = lazy(() => import('./tabs/MessagingTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const RegistrationTab = lazy(() => import('./tabs/RegistrationTab'));
const AttendeesTab = lazy(() => import('./tabs/AttendeesTab'));
const AlumniTab = lazy(() => import('./tabs/AlumniTab'));
const BadgesTab = lazy(() => import('./tabs/BadgesTab'));
const DeadlinesTab = lazy(() => import('./tabs/DeadlinesTab'));
const RegistrationQuestionsAnalyticsTab = lazy(
  () => import('./tabs/analytics/RegistrationQuestionsAnalyticsTab')
);
const CostManagementTab = lazy(() => import('./tabs/CostManagementTab'));
const BudgetPlanningTab = lazy(() => import('./tabs/BudgetPlanningTab'));
const SpeakerExpensesTab = lazy(() => import('./tabs/SpeakerExpensesTab'));
const ConferenceStatisticsTab = lazy(() => import('./tabs/analytics/ConferenceStatisticsTab'));
const RevenueTrackingTab = lazy(() => import('./tabs/analytics/RevenueTrackingTab'));
const FinancialReportingTab = lazy(() => import('./tabs/analytics/FinancialReportingTab'));
const CFPTopics = lazy(() => import('../modules/cfp').then((m) => ({ default: m.CFPTopics })));
const CFPProgramCommittee = lazy(() =>
  import('../modules/cfp').then((m) => ({ default: m.CFPProgramCommittee }))
);
const RoleMembers = lazy(() => import('../modules/cfp').then((m) => ({ default: m.RoleMembers })));
const CFPApplicants = lazy(() =>
  import('../modules/cfp').then((m) => ({ default: m.CFPApplicants }))
);
const CFPPapers = lazy(() => import('../modules/cfp').then((m) => ({ default: m.CFPPapers })));
const CFPEvaluatedPapers = lazy(() =>
  import('../modules/cfp').then((m) => ({ default: m.CFPEvaluatedPapers }))
);
const CFPSelectedPapers = lazy(() =>
  import('../modules/cfp').then((m) => ({ default: m.CFPSelectedPapers }))
);
const CFPAssignments = lazy(() =>
  import('../modules/cfp').then((m) => ({ default: m.CFPAssignments }))
);

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ConferenceDetail() {
  return (
    <SelectionProvider>
      <ConferenceDetailContent />
    </SelectionProvider>
  );
}

function ConferenceDetailContent() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const [papersKey, setPapersKey] = useState(0);
  const { setSelectedCommitteeMemberId, setSelectedApplicantId } = useSelection();

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    // Conference data
    conference,
    isLoading,
    isError,
    isAdmin,
    handleUpdate,

    // Sidebar navigation
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    expandedSections,
    setExpandedSections,
    filteredGroups,

    // Router helpers
    navigate,

    // Unsaved changes guard
    setIsDirty,
    showUnsavedDialog,
    confirmLeaveTab,
    cancelLeaveTab,
  } = useConferenceDetail(conferenceId);

  // Fetch deadlines for approaching-deadline toast warnings
  const { data: deadlineData } = useQuery({
    queryKey: queryKeys.deadlines.byConference(conferenceId ?? ''),
    queryFn: async () => {
      const response = await api.get<{
        items: { id: string; title: string; due_date: string; is_active: boolean }[];
        total: number;
      }>(`/conferences/${conferenceId}/deadlines`);
      return response.data;
    },
    enabled: !!conferenceId && !!conference,
    staleTime: 60_000,
  });

  const DEADLINE_OVERDUE_CUTOFF_DAYS = 30;

  // Show toast warnings for approaching/overdue deadlines — once per browser session per conference.
  useEffect(() => {
    if (!deadlineData?.items) return;
    if (sessionStorage.getItem(`deadline_toast_shown:${conferenceId}`)) return;

    const now = new Date();
    const approaching = deadlineData.items.filter((d) => {
      if (!d.is_active) return false;
      const due = new Date(d.due_date);
      const diffDays = (due.getTime() - now.getTime()) / 86_400_000;
      return diffDays > -DEADLINE_OVERDUE_CUTOFF_DAYS && diffDays <= 7;
    });

    if (approaching.length === 0) return;
    sessionStorage.setItem(`deadline_toast_shown:${conferenceId}`, '1');

    if (approaching.length <= 2) {
      approaching.forEach((d) => {
        const due = new Date(d.due_date);
        const isOverdue = due < now;
        const action = isOverdue
          ? {
              label: 'Mark as resolved',
              onClick: async () => {
                await api.patch(`/conferences/${conferenceId}/deadlines/${d.id}/toggle`);
                queryClient.invalidateQueries({
                  queryKey: queryKeys.deadlines.byConference(conferenceId ?? ''),
                });
              },
            }
          : undefined;
        showToast(
          `${isOverdue ? 'Overdue' : 'Deadline approaching'}: "${d.title}" is due ${due.toLocaleDateString()}`,
          'warning',
          action
        );
      });
    } else {
      showToast(
        `${approaching.length} deadlines are approaching or overdue. Check the Deadlines tab.`,
        'warning'
      );
    }
  }, [deadlineData, showToast, conferenceId, queryClient]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-100 text-blue-800';
      case 'ongoing':
        return 'bg-green-100 text-green-800';
      case 'past':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (isError || !conference) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Conference not found
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The conference you are looking for does not exist or was deleted.
        </p>
        <button
          onClick={() => navigate('/modules/conferences')}
          className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
        >
          Back to Conferences
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/modules/conferences')}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Go back"
          >
            <BackIcon />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {conference.name}
            </h1>
            {conference.abbreviation && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{conference.abbreviation}</p>
            )}
          </div>
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(conference.status)}`}
          >
            {conference.status}
          </span>
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
            {/* Collapse toggle — pinned at top */}
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
                  {/* Group divider (thin line between groups, not before the first) */}
                  {groupIdx > 0 && (
                    <div
                      className={`border-t border-gray-200 dark:border-gray-700 ${sidebarCollapsed ? 'my-1.5 mx-1' : 'my-2 mx-1'}`}
                    />
                  )}
                  {/* Group label (hidden when collapsed) */}
                  {!sidebarCollapsed && (
                    <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {group.name}
                    </p>
                  )}
                  {/* Sections within the group */}
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
                            {!sidebarCollapsed && section.hasSubContent && !section.children && (
                              <svg
                                className="w-4 h-4 ml-auto text-gray-400 dark:text-gray-500"
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
                            )}
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
                        {/* Expandable children (e.g. CFP sub-sections) */}
                        {section.children &&
                          expandedSections.has(section.id) &&
                          !sidebarCollapsed && (
                            <div className="ml-4 mb-1 space-y-0.5">
                              {section.children.map((child) => (
                                <button
                                  key={child.id}
                                  type="button"
                                  onClick={() => {
                                    setActiveSection(child.id);
                                    if (child.id === 'cfp-program-committee') {
                                      setSelectedCommitteeMemberId(null);
                                    }
                                    if (child.id === 'cfp-applicants') {
                                      setSelectedApplicantId(null);
                                    }
                                    if (child.id === 'cfp-papers') {
                                      setPapersKey((k) => k + 1);
                                    }
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                                    activeSection === child.id
                                      ? 'bg-primary-50 text-primary-700 font-medium'
                                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  <child.icon />
                                  <span className="truncate text-left">{child.name}</span>
                                </button>
                              ))}
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
            <DirtyContext.Provider value={setIsDirty}>
              <Suspense
                fallback={
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                }
              >
                {activeSection === 'details' && (
                  <ConferenceDetailsTab
                    conference={conference}
                    onUpdate={handleUpdate}
                    isAdmin={isAdmin}
                  />
                )}
                {activeSection === 'team' && (
                  <ConferenceTeamTab
                    conference={conference}
                    onUpdate={handleUpdate}
                    isAdmin={isAdmin}
                  />
                )}
                {activeSection === 'social' && (
                  <ConferenceSocialTab
                    conference={conference}
                    onUpdate={handleUpdate}
                    isAdmin={isAdmin}
                  />
                )}
                {activeSection === 'volunteers' && (
                  <VolunteersTab conferenceId={conferenceId} isAdmin={isAdmin} />
                )}
                {activeSection === 'volunteer-task-assignment' && (
                  <TaskAssignmentTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'volunteer-assignment' && (
                  <VolunteerAssignmentTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'volunteer-schedule' && (
                  <VolunteerScheduleTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'locations' && (
                  <ConferenceLocationsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'cfp' && (
                  <ConferenceCFPsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'cfp-topics' && <CFPTopics isAdmin={isAdmin} />}
                {activeSection === 'cfp-program-committee' && (
                  <CFPProgramCommittee conferenceId={conferenceId} isAdmin={isAdmin} />
                )}
                {activeSection === 'role-keynote' && (
                  <RoleMembers conferenceId={conferenceId} isAdmin={isAdmin} roleName="Keynote" />
                )}
                {activeSection === 'role-tutorial' && (
                  <RoleMembers conferenceId={conferenceId} isAdmin={isAdmin} roleName="Tutorial" />
                )}
                {activeSection === 'role-social-event' && (
                  <RoleMembers
                    conferenceId={conferenceId}
                    isAdmin={isAdmin}
                    roleName="Social Event"
                  />
                )}
                {activeSection === 'role-bonus-session' && (
                  <RoleMembers
                    conferenceId={conferenceId}
                    isAdmin={isAdmin}
                    roleName="Bonus Session"
                  />
                )}
                {activeSection === 'role-active-session' && (
                  <RoleMembers
                    conferenceId={conferenceId}
                    isAdmin={isAdmin}
                    roleName="Active Session"
                  />
                )}
                {activeSection === 'role-sponsor-talk' && (
                  <RoleMembers
                    conferenceId={conferenceId}
                    isAdmin={isAdmin}
                    roleName="Sponsor Talk"
                  />
                )}
                {activeSection === 'cfp-applicants' && (
                  <CFPApplicants conferenceId={conferenceId} isAdmin={isAdmin} />
                )}
                {activeSection === 'cfp-papers' && <CFPPapers key={papersKey} isAdmin={isAdmin} />}
                {activeSection === 'cfp-assignments' && (
                  <CFPAssignments conferenceId={conferenceId} isAdmin={isAdmin} />
                )}
                {activeSection === 'cfp-evaluated-papers' && <CFPEvaluatedPapers />}
                {activeSection === 'cfp-accepted-papers' && <CFPSelectedPapers filter="accepted" />}
                {activeSection === 'cfp-rejected-papers' && <CFPSelectedPapers filter="rejected" />}
                {activeSection === 'sessions' && (
                  <SessionsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'speakers' && (
                  <SpeakersTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'attendees' && (
                  <AttendeesTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'badges' && conference && (
                  <BadgesTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'sponsors' && (
                  <ConferenceSponsorsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'analytics' && (
                  <RegistrationQuestionsAnalyticsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'analytics-questions' && (
                  <RegistrationQuestionsAnalyticsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'analytics-statistics' && (
                  <ConferenceStatisticsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'analytics-revenue' && (
                  <RevenueTrackingTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'analytics-financial' && (
                  <FinancialReportingTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'service_providers' && (
                  <ConferenceServiceProvidersTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'invoices' && (
                  <ConferenceInvoicesTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'payment-reminders' && (
                  <PaymentRemindersTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'cost-management' && (
                  <CostManagementTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'budget-planning' && (
                  <BudgetPlanningTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'speaker-expenses' && (
                  <SpeakerExpensesTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'program' && (
                  <ProgramDesignTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'program-design' && (
                  <ProgramDesignTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'program-build' && (
                  <ProgramBuildTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'booking' && conference && (
                  <ConferenceBookingTab
                    conferenceId={conference.id}
                    conferenceSlug={(conference.abbreviation || conference.name || '')
                      .toUpperCase()
                      .replace(/\s+/g, '')}
                    isAdmin={isAdmin}
                    conferenceCurrency={conference.currency}
                  />
                )}
                {activeSection === 'messaging' && conference && (
                  <MessagingTab conference={conference} />
                )}
                {activeSection === 'news' && conference && (
                  <NewsTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'registration' && conference && (
                  <RegistrationTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'alumni' && conference && (
                  <AlumniTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'deadlines' && conference && (
                  <DeadlinesTab conference={conference} isAdmin={isAdmin} />
                )}
                {activeSection === 'settings' && (
                  <ConferenceSettingsTab conference={conference} isAdmin={isAdmin} />
                )}
              </Suspense>
            </DirtyContext.Provider>
          </div>
        </div>
      </div>

      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onConfirm={confirmLeaveTab}
        onCancel={cancelLeaveTab}
      />
    </div>
  );
}
