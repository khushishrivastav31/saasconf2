import { lazy, Suspense, useState } from 'react';
import { useParams } from 'react-router';
import Modal from '../../components/Modal';
import { BackIcon } from './icons';
import { useConferenceDetail } from './useConferenceDetail';

// Lazy-loaded tab components
const ConferenceDetailsTab = lazy(() => import('./tabs/DetailsTab'));
const ConferenceTeamTab = lazy(() => import('./tabs/TeamTab'));
const ConferenceSocialTab = lazy(() => import('./tabs/SocialTab'));
const ConferenceVolunteersTab = lazy(() => import('./tabs/VolunteersTab'));
const ConferenceLocationsTab = lazy(() => import('./tabs/LocationsTab'));
const ConferenceCFPsTab = lazy(() => import('./tabs/CFPsTab'));
const ConferenceSponsorsTab = lazy(() => import('./tabs/SponsorsTab'));
const ConferenceBookingTab = lazy(() => import('./tabs/BookingTab'));
const ConferenceInvoicesTab = lazy(() => import('./tabs/InvoicesTab'));
const ConferenceServiceProvidersTab = lazy(() => import('./tabs/ServiceProvidersTab'));
const ConferenceSettingsTab = lazy(() => import('./tabs/SettingsTab'));
const ProgramDesignTab = lazy(() => import('./tabs/ProgramDesignTab'));
const ProgramBuildTab = lazy(() => import('./tabs/ProgramBuildTab'));
const SessionsTab = lazy(() => import('./tabs/SessionsTab'));
const SpeakersTab = lazy(() => import('./tabs/SpeakersTab'));
const MessagingTab = lazy(() => import('./tabs/MessagingTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const RegistrationTab = lazy(() => import('./tabs/RegistrationTab'));
const CFPTopics = lazy(() => import('../modules/cfp').then((m) => ({ default: m.CFPTopics })));
const CFPProgramCommittee = lazy(() =>
  import('../modules/cfp').then((m) => ({ default: m.CFPProgramCommittee }))
);
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
// Coming Soon placeholder
// ---------------------------------------------------------------------------

function ComingSoonContent({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{name}</h2>
      <p className="text-gray-500 text-sm">This module is coming soon.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ConferenceDetail() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const [papersKey, setPapersKey] = useState(0);

  const {
    // Conference data
    conference,
    isLoading,
    isError,
    isAdmin,
    canDelete,
    handleUpdate,

    // Sidebar navigation
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    expandedSections,
    setExpandedSections,
    sections,

    // Selection states
    selectedLocationId,
    setSelectedLocationId,
    selectedServiceProviderId,
    setSelectedServiceProviderId,
    selectedSponsorId,
    setSelectedSponsorId,
    selectedInvoiceId,
    setSelectedInvoiceId,
    selectedCommitteeMemberId,
    setSelectedCommitteeMemberId,
    selectedApplicantId,
    setSelectedApplicantId,

    // Delete logic
    showDeleteConfirm,
    setShowDeleteConfirm,
    deletePreview,
    setDeletePreview,
    deleteLoading,
    deleteError,
    setDeleteError,
    handleDeleteClick,
    handleConfirmDelete,

    // Router helpers
    navigate,
  } = useConferenceDetail(conferenceId);

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
        <h2 className="text-lg font-medium text-gray-900">Conference not found</h2>
        <p className="mt-1 text-sm text-gray-500">
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
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          >
            <BackIcon />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{conference.name}</h1>
            {conference.abbreviation && (
              <p className="text-sm text-gray-500">{conference.abbreviation}</p>
            )}
          </div>
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(conference.status)}`}
          >
            {conference.status}
          </span>
        </div>
        {canDelete && (
          <div className="flex items-center gap-2">
            {deleteError && !showDeleteConfirm && (
              <span className="text-sm text-red-600">{deleteError}</span>
            )}
            <button
              onClick={handleDeleteClick}
              disabled={deleteLoading}
              className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
            >
              {deleteLoading && !showDeleteConfirm ? 'Loading...' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Section navigation sidebar */}
        <nav
          className={`flex-shrink-0 transition-all duration-200 ${
            sidebarCollapsed ? 'w-14' : 'w-56'
          }`}
        >
          <div
            className="bg-white rounded-lg shadow p-2 sticky top-24 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          >
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center p-1.5 mb-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
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
            {sections.map((section) => {
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
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
                        className="p-1 mr-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
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
                  {section.children && expandedSections.has(section.id) && !sidebarCollapsed && (
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
                              : 'text-gray-600 hover:bg-gray-100'
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
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg shadow p-6">
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
                <ConferenceVolunteersTab conference={conference} isAdmin={isAdmin} />
              )}
              {activeSection === 'locations' && (
                <ConferenceLocationsTab
                  conference={conference}
                  selectedLocationId={selectedLocationId}
                  setSelectedLocationId={setSelectedLocationId}
                  isAdmin={isAdmin}
                />
              )}
              {activeSection === 'cfp' && (
                <ConferenceCFPsTab conference={conference} isAdmin={isAdmin} />
              )}
              {activeSection === 'cfp-topics' && <CFPTopics isAdmin={isAdmin} />}
              {activeSection === 'cfp-program-committee' && (
                <CFPProgramCommittee
                  selectedMemberId={selectedCommitteeMemberId}
                  setSelectedMemberId={setSelectedCommitteeMemberId}
                  conferenceId={conferenceId}
                  isAdmin={isAdmin}
                />
              )}
              {activeSection === 'cfp-applicants' && (
                <CFPApplicants
                  selectedApplicantId={selectedApplicantId}
                  setSelectedApplicantId={setSelectedApplicantId}
                  conferenceId={conferenceId}
                  isAdmin={isAdmin}
                />
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
              {activeSection === 'attendees' && <ComingSoonContent name="Attendees" />}
              {activeSection === 'sponsors' && (
                <ConferenceSponsorsTab
                  conference={conference}
                  selectedSponsorId={selectedSponsorId}
                  setSelectedSponsorId={setSelectedSponsorId}
                  isAdmin={isAdmin}
                />
              )}
              {activeSection === 'analytics' && <ComingSoonContent name="Analytics" />}
              {activeSection === 'service_providers' && (
                <ConferenceServiceProvidersTab
                  conference={conference}
                  selectedServiceProviderId={selectedServiceProviderId}
                  setSelectedServiceProviderId={setSelectedServiceProviderId}
                  isAdmin={isAdmin}
                />
              )}
              {activeSection === 'invoices' && (
                <ConferenceInvoicesTab
                  conference={conference}
                  selectedInvoiceId={selectedInvoiceId}
                  setSelectedInvoiceId={setSelectedInvoiceId}
                  isAdmin={isAdmin}
                />
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
              {activeSection === 'settings' && (
                <ConferenceSettingsTab conference={conference} isAdmin={isAdmin} />
              )}
            </Suspense>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Modal
        open={showDeleteConfirm && !!deletePreview}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeletePreview(null);
          setDeleteError(null);
        }}
        title="Delete Conference"
        size="max-w-md"
      >
        {deletePreview && (
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deletePreview.conference_name}</strong>? This
              action cannot be undone.
            </p>

            {/* Items that will be permanently deleted */}
            {(deletePreview.volunteers.will_delete > 0 ||
              deletePreview.locations.will_delete > 0 ||
              deletePreview.cfps.will_delete > 0 ||
              deletePreview.sponsors.count > 0 ||
              deletePreview.invoices.count > 0 ||
              deletePreview.papers.count > 0 ||
              deletePreview.applicants.orphaned_count > 0) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm">
                <p className="font-medium text-red-800 mb-2">
                  The following will be permanently deleted:
                </p>
                <ul className="space-y-1 text-red-700">
                  {deletePreview.volunteers.will_delete > 0 && (
                    <li>
                      {deletePreview.volunteers.will_delete} volunteer
                      {deletePreview.volunteers.will_delete !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.locations.will_delete > 0 && (
                    <li>
                      {deletePreview.locations.will_delete} location
                      {deletePreview.locations.will_delete !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.cfps.will_delete > 0 && (
                    <li>
                      {deletePreview.cfps.will_delete} call for paper
                      {deletePreview.cfps.will_delete !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.papers.count > 0 && (
                    <li>
                      {deletePreview.papers.count} paper
                      {deletePreview.papers.count !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.applicants.orphaned_count > 0 && (
                    <li>
                      {deletePreview.applicants.orphaned_count} applicant
                      {deletePreview.applicants.orphaned_count !== 1 ? 's' : ''}{' '}
                      <span className="text-red-600">(only have papers in this conference)</span>
                    </li>
                  )}
                  {deletePreview.sponsors.count > 0 && (
                    <li>
                      {deletePreview.sponsors.count} sponsor
                      {deletePreview.sponsors.count !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.invoices.count > 0 && (
                    <li>
                      {deletePreview.invoices.count} invoice
                      {deletePreview.invoices.count !== 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Items that will be unlinked (shared with other conferences) */}
            {(deletePreview.volunteers.will_unlink > 0 ||
              deletePreview.locations.will_unlink > 0 ||
              deletePreview.cfps.will_unlink > 0) && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                <p className="font-medium text-yellow-800 mb-2">
                  The following will be unlinked (shared with other conferences):
                </p>
                <ul className="space-y-1 text-yellow-700">
                  {deletePreview.volunteers.will_unlink > 0 && (
                    <li>
                      {deletePreview.volunteers.will_unlink} volunteer
                      {deletePreview.volunteers.will_unlink !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.locations.will_unlink > 0 && (
                    <li>
                      {deletePreview.locations.will_unlink} location
                      {deletePreview.locations.will_unlink !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.cfps.will_unlink > 0 && (
                    <li>
                      {deletePreview.cfps.will_unlink} call for paper
                      {deletePreview.cfps.will_unlink !== 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePreview(null);
                  setDeleteError(null);
                }}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Delete Conference'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
