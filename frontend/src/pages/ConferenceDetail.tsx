import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import api from "../config/api";
import type {
  Conference,
  ConferenceUpdate,
  PaginatedResponse,
  TeamMember,
  SocialLinks,
  Volunteer,
  VolunteerCreate,
  VolunteerUpdate,
  VolunteerRole,
  VolunteerStatus,
  Location,
  LocationCreate,
  LocationContactPerson,
  TenantLocationType,
  CallForPapers,
  CFPCreate,
  ServiceProvider,
  ServiceProviderCreate,
  ServiceProviderUpdate,
} from "../types";
import AttachmentList from "../components/AttachmentList";
import LocationDetailPanel from "../components/LocationDetailPanel";
import type { LocationUpdateData } from "../components/LocationDetailPanel";
import ContactPersonList from "../components/ContactPersonList";
import ConfirmDialog from "../components/ConfirmDialog";

// ---------------------------------------------------------------------------
// Section navigation types
// ---------------------------------------------------------------------------

type SectionId = "details" | "team" | "social" | "volunteers" | "locations" | "cfp" | "sessions" | "speakers" | "attendees" | "sponsors" | "analytics" | "service_providers";

interface SectionDef {
  id: SectionId;
  name: string;
  icon: () => JSX.Element;
  moduleCode?: string; // If set, only show when user has this module assigned
}

const coreSections: SectionDef[] = [
  { id: "details", name: "Details", icon: InfoIcon },
  { id: "team", name: "Team", icon: UsersIcon },
  { id: "social", name: "Social Media", icon: ShareIcon },
];

const moduleSections: SectionDef[] = [
  { id: "sessions", name: "Sessions", icon: SessionsIcon, moduleCode: "sessions" },
  { id: "speakers", name: "Speakers", icon: SpeakerIcon, moduleCode: "speakers" },
  { id: "attendees", name: "Attendees", icon: AttendeesIcon, moduleCode: "attendees" },
  { id: "volunteers", name: "Volunteers", icon: PeopleIcon, moduleCode: "volunteers" },
  { id: "sponsors", name: "Sponsors", icon: SponsorsIcon, moduleCode: "sponsors" },
  { id: "locations", name: "Locations", icon: MapIcon, moduleCode: "locations" },
  { id: "cfp", name: "Call for Papers", icon: PaperIcon, moduleCode: "cfp" },
  { id: "service_providers", name: "Service Providers", icon: ServiceProvidersIcon, moduleCode: "service_providers" },
  { id: "analytics", name: "Analytics", icon: AnalyticsIcon, moduleCode: "analytics" },
];

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function BackIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PaperIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function SessionsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

function AttendeesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function SponsorsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function ServiceProvidersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M3 13a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v4z" />
    </svg>
  );
}

function ComingSoonContent({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{name}</h2>
      <p className="text-gray-500 text-sm">This module is coming soon.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Preview
// ---------------------------------------------------------------------------

interface DeletePreview {
  conference_name: string;
  volunteers: { total_linked: number; will_delete: number; will_unlink: number };
  locations: { total_linked: number; will_delete: number; will_unlink: number };
  cfps: { total_linked: number; will_delete: number; will_unlink: number };
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ConferenceDetail() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>("details");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Build sections: core sections are always visible, module sections depend on user's assigned modules
  const sections = useMemo(() => {
    const userModules = user?.modules ?? [];
    const isSuperAdmin = user?.role === "super_admin";
    const available = moduleSections.filter(
      (s) => !s.moduleCode || isSuperAdmin || userModules.includes(s.moduleCode),
    );
    return [...coreSections, ...available];
  }, [user?.modules, user?.role]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Location tree state (lifted here so sidebar can render the tree)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const { data: conference, isLoading, isError } = useQuery({
    queryKey: ["conference", conferenceId],
    queryFn: async () => {
      const response = await api.get<Conference>(`/conferences/${conferenceId}`);
      return response.data;
    },
    enabled: !!conferenceId,
  });

  // Location data for the sidebar tree
  const { data: conferenceLocationsData } = useQuery({
    queryKey: ["conference-locations", conferenceId],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Location>>(
        `/conferences/${conferenceId}/locations`,
      );
      return response.data;
    },
    enabled: !!conferenceId,
  });



  const handleDeleteClick = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      const response = await api.get<DeletePreview>(
        `/conferences/${conferenceId}/delete-preview`,
      );
      setDeletePreview(response.data);
      setShowDeleteConfirm(true);
    } catch {
      setDeleteError("Failed to load deletion preview");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await api.delete(`/conferences/${conferenceId}`);
      queryClient.invalidateQueries({ queryKey: ["conferences"] });
      queryClient.invalidateQueries({ queryKey: ["conference-stats"] });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
      queryClient.invalidateQueries({ queryKey: ["all-cfps"] });
      navigate("/modules/conferences");
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setDeleteError(axiosError.response?.data?.detail || "Failed to delete conference");
      setDeleteLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "upcoming":
        return "bg-blue-100 text-blue-800";
      case "ongoing":
        return "bg-green-100 text-green-800";
      case "past":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-yellow-100 text-yellow-800";
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
        <p className="mt-1 text-sm text-gray-500">The conference you are looking for does not exist or was deleted.</p>
        <button
          onClick={() => navigate("/modules/conferences")}
          className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
        >
          Back to Conferences
        </button>
      </div>
    );
  }

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ["conference", conferenceId] });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/modules/conferences")}
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
        <div className="flex items-center gap-2">
          {deleteError && !showDeleteConfirm && (
            <span className="text-sm text-red-600">{deleteError}</span>
          )}
          <button
            onClick={handleDeleteClick}
            disabled={deleteLoading}
            className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
          >
            {deleteLoading && !showDeleteConfirm ? "Loading..." : "Delete"}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Section navigation sidebar */}
        <nav
          className={`flex-shrink-0 transition-all duration-200 ${
            sidebarCollapsed
              ? "w-14"
              : activeSection === "locations" ? "w-64" : "w-56"
          }`}
        >
          <div className="bg-white rounded-lg shadow p-2 sticky top-24 overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center p-1.5 mb-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sidebarCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                )}
              </svg>
            </button>
            {sections.map((section) => (
              <div key={section.id}>
                <button
                  onClick={() => setActiveSection(section.id)}
                  title={sidebarCollapsed ? section.name : undefined}
                  className={`w-full flex items-center rounded-md mb-0.5 ${
                    sidebarCollapsed ? "justify-center px-2 py-2" : "px-3 py-2"
                  } text-sm font-medium ${
                    activeSection === section.id
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <section.icon />
                  {!sidebarCollapsed && <span className="ml-3">{section.name}</span>}
                </button>
                {/* Inline location list right below the Locations button */}
                {section.id === "locations" && activeSection === "locations" && !sidebarCollapsed && (
                  <div className="ml-4 mb-1 space-y-0.5">
                    {(conferenceLocationsData?.items || []).map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setSelectedLocationId(loc.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                          loc.id === selectedLocationId
                            ? "bg-primary-50 text-primary-700 font-medium"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 w-2 h-2 rounded-full ${
                            loc.is_active ? "bg-green-400" : "bg-red-400"
                          }`}
                        />
                        <span className="truncate text-left">{loc.name}</span>
                      </button>
                    ))}
                    {(conferenceLocationsData?.items || []).length === 0 && (
                      <p className="text-xs text-gray-400 px-3 py-2">No locations</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg shadow p-6">
            {activeSection === "details" && (
              <ConferenceDetailsTab conference={conference} onUpdate={handleUpdate} />
            )}
            {activeSection === "team" && (
              <ConferenceTeamTab conference={conference} onUpdate={handleUpdate} />
            )}
            {activeSection === "social" && (
              <ConferenceSocialTab conference={conference} onUpdate={handleUpdate} />
            )}
            {activeSection === "volunteers" && (
              <ConferenceVolunteersTab conference={conference} />
            )}
            {activeSection === "locations" && (
              <ConferenceLocationsTab
                conference={conference}
                selectedLocationId={selectedLocationId}
                setSelectedLocationId={setSelectedLocationId}
              />
            )}
            {activeSection === "cfp" && (
              <ConferenceCFPsTab conference={conference} />
            )}
            {activeSection === "sessions" && (
              <ComingSoonContent name="Sessions" />
            )}
            {activeSection === "speakers" && (
              <ComingSoonContent name="Speakers" />
            )}
            {activeSection === "attendees" && (
              <ComingSoonContent name="Attendees" />
            )}
            {activeSection === "sponsors" && (
              <ComingSoonContent name="Sponsors" />
            )}
            {activeSection === "analytics" && (
              <ComingSoonContent name="Analytics" />
            )}
            {activeSection === "service_providers" && (
              <ConferenceServiceProvidersTab conference={conference} />
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && deletePreview && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                Delete Conference
              </h3>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deletePreview.conference_name}</strong>? This action cannot be undone.
            </p>

            {(deletePreview.volunteers.will_delete > 0 ||
              deletePreview.locations.will_delete > 0 ||
              deletePreview.cfps.will_delete > 0) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm">
                <p className="font-medium text-red-800 mb-2">The following will be permanently deleted:</p>
                <ul className="space-y-1 text-red-700">
                  {deletePreview.volunteers.will_delete > 0 && (
                    <li>{deletePreview.volunteers.will_delete} volunteer{deletePreview.volunteers.will_delete !== 1 ? "s" : ""}</li>
                  )}
                  {deletePreview.locations.will_delete > 0 && (
                    <li>{deletePreview.locations.will_delete} location{deletePreview.locations.will_delete !== 1 ? "s" : ""}</li>
                  )}
                  {deletePreview.cfps.will_delete > 0 && (
                    <li>{deletePreview.cfps.will_delete} call for paper{deletePreview.cfps.will_delete !== 1 ? "s" : ""}</li>
                  )}
                </ul>
              </div>
            )}

            {(deletePreview.volunteers.will_unlink > 0 ||
              deletePreview.locations.will_unlink > 0 ||
              deletePreview.cfps.will_unlink > 0) && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                <p className="font-medium text-yellow-800 mb-2">The following will be unlinked (shared with other conferences):</p>
                <ul className="space-y-1 text-yellow-700">
                  {deletePreview.volunteers.will_unlink > 0 && (
                    <li>{deletePreview.volunteers.will_unlink} volunteer{deletePreview.volunteers.will_unlink !== 1 ? "s" : ""}</li>
                  )}
                  {deletePreview.locations.will_unlink > 0 && (
                    <li>{deletePreview.locations.will_unlink} location{deletePreview.locations.will_unlink !== 1 ? "s" : ""}</li>
                  )}
                  {deletePreview.cfps.will_unlink > 0 && (
                    <li>{deletePreview.cfps.will_unlink} call for paper{deletePreview.cfps.will_unlink !== 1 ? "s" : ""}</li>
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
                {deleteLoading ? "Deleting..." : "Delete Conference"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conference Details Tab
// ---------------------------------------------------------------------------

function ConferenceDetailsTab({
  conference,
  onUpdate,
}: {
  conference: Conference;
  onUpdate: () => void;
}) {
  const [formData, setFormData] = useState<ConferenceUpdate>({
    name: conference.name,
    abbreviation: conference.abbreviation || "",
    description: conference.description || "",
    website: conference.website || "",
    start_date: conference.start_date || "",
    end_date: conference.end_date || "",
    venue_name: conference.venue_name || "",
    venue_address: conference.venue_address || "",
    city: conference.city || "",
    country: conference.country || "",
    timezone: conference.timezone || "",
    is_virtual: conference.is_virtual,
    virtual_platform_url: conference.virtual_platform_url || "",
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (data: ConferenceUpdate) => {
      await api.put(`/conferences/${conference.id}`, data);
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      onUpdate();
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const handleFieldChange = (
    field: keyof ConferenceUpdate,
    value: string | boolean | undefined,
  ) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    if (saveTimeout) clearTimeout(saveTimeout);

    const timeout = setTimeout(() => {
      updateMutation.mutate(newFormData);
    }, 500);
    setSaveTimeout(timeout);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Conference Details
        </h4>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="animate-spin h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-600">Save failed</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Conference Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Abbreviation
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={formData.abbreviation}
              onChange={(e) =>
                handleFieldChange("abbreviation", e.target.value)
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            rows={3}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.description}
            onChange={(e) => handleFieldChange("description", e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Website
          </label>
          <input
            type="text"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            value={formData.website}
            onChange={(e) => handleFieldChange("website", e.target.value)}
          />
        </div>

        {/* Dates */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Dates</h5>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.start_date}
                onChange={(e) =>
                  handleFieldChange("start_date", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.end_date}
                onChange={(e) => handleFieldChange("end_date", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="border-t pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Location</h5>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Venue Name
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.venue_name}
                onChange={(e) =>
                  handleFieldChange("venue_name", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.venue_address}
                onChange={(e) =>
                  handleFieldChange("venue_address", e.target.value)
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  City
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.city}
                  onChange={(e) => handleFieldChange("city", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Country
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.country}
                  onChange={(e) => handleFieldChange("country", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Timezone
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="e.g., Europe/Berlin"
                  value={formData.timezone}
                  onChange={(e) =>
                    handleFieldChange("timezone", e.target.value)
                  }
                />
              </div>
            </div>
            <div className="flex items-center mt-3">
              <input
                type="checkbox"
                id="detail_is_virtual"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={formData.is_virtual}
                onChange={(e) =>
                  handleFieldChange("is_virtual", e.target.checked)
                }
              />
              <label
                htmlFor="detail_is_virtual"
                className="ml-2 block text-sm text-gray-700"
              >
                Virtual/hybrid conference
              </label>
            </div>
            {formData.is_virtual && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Virtual Platform URL
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.virtual_platform_url}
                  onChange={(e) =>
                    handleFieldChange("virtual_platform_url", e.target.value)
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conference Team Tab
// ---------------------------------------------------------------------------

function ConferenceTeamTab({
  conference,
  onUpdate,
}: {
  conference: Conference;
  onUpdate: () => void;
}) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(
    conference.team_members || [],
  );
  const [newMember, setNewMember] = useState<TeamMember>({
    name: "",
    email: "",
    phone: "",
    role: "",
    is_manager: false,
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TeamMember>({
    name: "",
    email: "",
    phone: "",
    role: "",
    is_manager: false,
  });
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const updateMutation = useMutation({
    mutationFn: async (members: TeamMember[]) => {
      await api.put(`/conferences/${conference.id}`, { team_members: members });
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      onUpdate();
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const addMember = () => {
    if (newMember.name.trim()) {
      const newMembers = [...teamMembers, { ...newMember }];
      setTeamMembers(newMembers);
      setNewMember({
        name: "",
        email: "",
        phone: "",
        role: "",
        is_manager: false,
      });
      updateMutation.mutate(newMembers);
    }
  };

  const removeMember = (index: number) => {
    const newMembers = teamMembers.filter((_, i) => i !== index);
    setTeamMembers(newMembers);
    updateMutation.mutate(newMembers);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditForm({ ...teamMembers[index] });
  };

  const cancelEditing = () => {
    setEditingIndex(null);
  };

  const saveEdit = () => {
    if (editingIndex === null || !editForm.name.trim()) return;
    const newMembers = [...teamMembers];
    newMembers[editingIndex] = { ...editForm };
    setTeamMembers(newMembers);
    setEditingIndex(null);
    updateMutation.mutate(newMembers);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">Conference Team</h4>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="animate-spin h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Existing Team Members */}
      {teamMembers.length > 0 && (
        <div className="mb-4 space-y-2">
          {teamMembers.map((member, index) =>
            editingIndex === index ? (
              <div
                key={index}
                className="bg-blue-50 border border-blue-200 rounded-lg p-4"
              >
                <h5 className="text-sm font-medium text-blue-900 mb-3">
                  Edit Team Member
                </h5>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Conference Chair"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.role || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, role: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.email || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, email: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Phone
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      value={editForm.phone || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, phone: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`edit_member_manager_${index}`}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      checked={editForm.is_manager}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          is_manager: e.target.checked,
                        })
                      }
                    />
                    <label
                      htmlFor={`edit_member_manager_${index}`}
                      className="ml-2 block text-sm text-gray-700"
                    >
                      Conference Manager
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!editForm.name.trim()}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={index}
                className="bg-gray-50 border border-gray-200 rounded-lg p-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {member.name}
                      </span>
                      {member.role && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                          {member.role}
                        </span>
                      )}
                      {member.is_manager && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Manager
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-500 space-x-3">
                      {member.email && <span>{member.email}</span>}
                      {member.phone && <span>{member.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(index)}
                      className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMember(index)}
                      className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                      title="Remove"
                    >
                      <svg
                        className="w-4 h-4"
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
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Add Team Member */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h5 className="text-sm font-medium text-blue-900 mb-3">
          Add Team Member
        </h5>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Name *
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={newMember.name}
              onChange={(e) =>
                setNewMember({ ...newMember, name: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Role
            </label>
            <input
              type="text"
              placeholder="e.g., Conference Chair"
              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={newMember.role}
              onChange={(e) =>
                setNewMember({ ...newMember, role: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email
            </label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={newMember.email}
              onChange={(e) =>
                setNewMember({ ...newMember, email: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Phone
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={newMember.phone}
              onChange={(e) =>
                setNewMember({ ...newMember, phone: e.target.value })
              }
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="new_member_manager"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={newMember.is_manager}
              onChange={(e) =>
                setNewMember({ ...newMember, is_manager: e.target.checked })
              }
            />
            <label
              htmlFor="new_member_manager"
              className="ml-2 block text-sm text-gray-700"
            >
              Conference Manager
            </label>
          </div>
          <button
            type="button"
            onClick={addMember}
            disabled={!newMember.name.trim()}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Member
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conference Social Tab
// ---------------------------------------------------------------------------

const ALL_SOCIAL_PLATFORMS: {
  key: string;
  label: string;
  placeholder: string;
}[] = [
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/company/..." },
  { key: "twitter", label: "Twitter/X", placeholder: "twitter.com/..." },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/..." },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/..." },
  { key: "bluesky", label: "BlueSky", placeholder: "bsky.app/profile/..." },
  { key: "mastodon", label: "Mastodon", placeholder: "mastodon.social/@..." },
  { key: "reddit", label: "Reddit", placeholder: "reddit.com/r/..." },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@..." },
];

function ConferenceSocialTab({
  conference,
  onUpdate,
}: {
  conference: Conference;
  onUpdate: () => void;
}) {
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(
    conference.social_links || {},
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [addPlatform, setAddPlatform] = useState("");
  const [customPlatformName, setCustomPlatformName] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (links: SocialLinks) => {
      await api.put(`/conferences/${conference.id}`, { social_links: links });
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      onUpdate();
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const saveLinks = (newLinks: SocialLinks) => {
    setSocialLinks(newLinks);
    if (saveTimeout) clearTimeout(saveTimeout);
    const timeout = setTimeout(() => {
      updateMutation.mutate(newLinks);
    }, 500);
    setSaveTimeout(timeout);
  };

  const handleLinkChange = (platform: string, value: string) => {
    saveLinks({ ...socialLinks, [platform]: value || undefined });
  };

  const handleDelete = (platform: string) => {
    const newLinks = { ...socialLinks };
    delete newLinks[platform];
    setSocialLinks(newLinks);
    updateMutation.mutate(newLinks);
  };

  const handleAdd = () => {
    const key = addPlatform === "__custom__"
      ? customPlatformName.trim().toLowerCase().replace(/\s+/g, "_")
      : addPlatform;
    if (!key || socialLinks[key] !== undefined) return;
    const newLinks = { ...socialLinks, [key]: "" };
    setSocialLinks(newLinks);
    setAddPlatform("");
    setCustomPlatformName("");
  };

  // Build the list of active entries: known platforms + any custom keys
  const knownKeys = new Set(ALL_SOCIAL_PLATFORMS.map((p) => p.key as string));
  const allEntries: { key: string; label: string; placeholder: string }[] = [];

  // First add known platforms that are present
  for (const p of ALL_SOCIAL_PLATFORMS) {
    if (socialLinks[p.key] !== undefined) {
      allEntries.push(p);
    }
  }
  // Then add custom keys (any key not in the known set)
  for (const key of Object.keys(socialLinks)) {
    if (!knownKeys.has(key)) {
      allEntries.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
        placeholder: "Enter URL...",
      });
    }
  }

  // Known platforms available to add (not yet in socialLinks)
  const availablePlatforms = ALL_SOCIAL_PLATFORMS.filter(
    (p) => socialLinks[p.key] === undefined,
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Social Media Links
        </h4>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="animate-spin h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-600">Save failed</span>
          )}
        </div>
      </div>

      {/* Existing social links */}
      {allEntries.length > 0 ? (
        <div className="space-y-3 mb-4">
          {allEntries.map((platform) => (
            <div key={platform.key} className="flex items-center gap-3">
              <label className="block text-sm font-medium text-gray-700 w-28 flex-shrink-0">
                {platform.label}
              </label>
              <input
                type="text"
                placeholder={platform.placeholder}
                className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={socialLinks[platform.key] || ""}
                onChange={(e) => handleLinkChange(platform.key, e.target.value)}
              />
              <button
                type="button"
                onClick={() => handleDelete(platform.key)}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title={`Remove ${platform.label}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200 mb-4">
          No social media links added yet.
        </div>
      )}

      {/* Add new social link */}
      <div className="flex items-center gap-3">
        <select
          value={addPlatform}
          onChange={(e) => {
            setAddPlatform(e.target.value);
            if (e.target.value !== "__custom__") setCustomPlatformName("");
          }}
          className="border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">Select platform...</option>
          {availablePlatforms.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">Custom...</option>
        </select>
        {addPlatform === "__custom__" && (
          <input
            type="text"
            placeholder="Platform name"
            value={customPlatformName}
            onChange={(e) => setCustomPlatformName(e.target.value)}
            className="border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 w-40"
          />
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!addPlatform || (addPlatform === "__custom__" && !customPlatformName.trim())}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Channel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conference Volunteers Tab
// ---------------------------------------------------------------------------

function ConferenceVolunteersTab({
  conference,
}: {
  conference: Conference;
}) {
  const queryClient = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);
  const [deleteVolunteerTarget, setDeleteVolunteerTarget] = useState<Volunteer | null>(null);
  const [editForm, setEditForm] = useState<VolunteerUpdate>({});
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "",
    tshirt_size: "",
    notes: "",
  });

  // Fetch linked volunteers
  const { data, isLoading } = useQuery({
    queryKey: ["conference-volunteers", conference.id],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Volunteer>>(
        `/conferences/${conference.id}/volunteers`,
      );
      return response.data;
    },
  });

  // Fetch all tenant volunteers for linking
  const { data: allVolunteers } = useQuery({
    queryKey: ["all-volunteers"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Volunteer>>(
        `/volunteers?page_size=100`,
      );
      return response.data;
    },
  });

  const { data: rolesData } = useQuery({
    queryKey: ["volunteer-roles"],
    queryFn: async () => {
      const response = await api.get<{ items: VolunteerRole[]; total: number }>(
        "/settings/volunteer-roles",
      );
      return response.data;
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (volunteerId: string) => {
      await api.post(`/conferences/${conference.id}/volunteers`, {
        id: volunteerId,
      });
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to link volunteer");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: VolunteerCreate) => {
      await api.post("/volunteers", data);
    },
    onSuccess: () => {
      setLinkError(null);
      setShowCreateForm(false);
      setCreateForm({ first_name: "", last_name: "", email: "", phone: "", role: "", tshirt_size: "", notes: "" });
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to create volunteer");
    },
  });

  const volunteerUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VolunteerUpdate }) => {
      await api.put(`/volunteers/${id}`, data);
    },
    onSuccess: () => {
      setEditingVolunteer(null);
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to update volunteer");
    },
  });

  const volunteerDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/volunteers/${id}`);
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-volunteers", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-volunteers"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to delete volunteer");
    },
  });

  const openEditVolunteer = (volunteer: Volunteer) => {
    setEditingVolunteer(volunteer);
    setEditForm({
      first_name: volunteer.first_name,
      last_name: volunteer.last_name,
      email: volunteer.email,
      phone: volunteer.phone || "",
      status: volunteer.status,
      role: volunteer.role || "",
      tshirt_size: volunteer.tshirt_size || "",
      notes: volunteer.notes || "",
      emergency_contact_name: volunteer.emergency_contact_name || "",
      emergency_contact_phone: volunteer.emergency_contact_phone || "",
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVolunteer) return;
    volunteerUpdateMutation.mutate({ id: editingVolunteer.id, data: editForm });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...createForm,
      conference_id: conference.id,
    });
  };

  const linkedIds = new Set(data?.items?.map((v) => v.id) || []);
  const unlinkableVolunteers =
    allVolunteers?.items?.filter((v) => !linkedIds.has(v.id)) || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Linked Volunteers ({data?.total || 0})
        </h4>
        <div className="flex items-center gap-2">
          {unlinkableVolunteers.length > 0 && (
            <select
              className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  linkMutation.mutate(e.target.value);
                  e.target.value = "";
                }
              }}
            >
              <option value="">Link existing...</option>
              {unlinkableVolunteers.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.full_name} ({v.email})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            {showCreateForm ? "Cancel" : "Create New"}
          </button>
        </div>
      </div>

      {linkError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {linkError}
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreateSubmit} className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">First Name *</label>
              <input
                type="text"
                required
                value={createForm.first_name}
                onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Last Name *</label>
              <input
                type="text"
                required
                value={createForm.last_name}
                onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Email *</label>
              <input
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Role</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select a role...</option>
                {rolesData?.items
                  ?.filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">T-Shirt Size</label>
              <select
                value={createForm.tshirt_size}
                onChange={(e) => setCreateForm({ ...createForm, tshirt_size: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select size</option>
                {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Comments</label>
            <textarea
              rows={2}
              placeholder="Any notes or comments about this volunteer..."
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Volunteer"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.items.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {volunteer.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {volunteer.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        volunteer.status === "active"
                          ? "bg-green-100 text-green-700"
                          : volunteer.status === "approved"
                            ? "bg-blue-100 text-blue-700"
                            : volunteer.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {volunteer.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {volunteer.role || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditVolunteer(volunteer)}
                        className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteVolunteerTarget(volunteer)}
                        disabled={volunteerDeleteMutation.isPending}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <svg
                          className="w-4 h-4"
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
          No volunteers linked to this conference yet.
        </div>
      )}

      {/* Edit Volunteer Modal */}
      {editingVolunteer && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleEditSubmit}>
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">
                    Edit Volunteer
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingVolunteer(null)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.first_name || ""}
                      onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.last_name || ""}
                      onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      required
                      value={editForm.email || ""}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={editForm.phone || ""}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                      value={editForm.status || "pending"}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as VolunteerStatus })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    >
                      {(["pending", "approved", "active", "inactive", "rejected"] as const).map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <select
                      value={editForm.role || ""}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">Select a role...</option>
                      {rolesData?.items
                        ?.filter((r) => r.is_active)
                        .map((r) => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">T-Shirt Size</label>
                    <select
                      value={editForm.tshirt_size || ""}
                      onChange={(e) => setEditForm({ ...editForm, tshirt_size: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">Select size</option>
                      {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div></div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    rows={2}
                    value={editForm.notes || ""}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Emergency Contact Name</label>
                    <input
                      type="text"
                      value={editForm.emergency_contact_name || ""}
                      onChange={(e) => setEditForm({ ...editForm, emergency_contact_name: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Emergency Contact Phone</label>
                    <input
                      type="tel"
                      value={editForm.emergency_contact_phone || ""}
                      onChange={(e) => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>

                <AttachmentList entityType="volunteer" entityId={editingVolunteer.id} />
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingVolunteer(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={volunteerUpdateMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {volunteerUpdateMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteVolunteerTarget}
        title="Delete Volunteer"
        message={`Are you sure you want to delete "${deleteVolunteerTarget?.full_name}"? This will permanently remove them.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteVolunteerTarget) volunteerDeleteMutation.mutate(deleteVolunteerTarget.id);
          setDeleteVolunteerTarget(null);
        }}
        onCancel={() => setDeleteVolunteerTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conference Locations Tab
// ---------------------------------------------------------------------------

function ConferenceLocationsTab({
  conference,
  selectedLocationId,
  setSelectedLocationId,
}: {
  conference: Conference;
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeleteLocationConfirm, setShowDeleteLocationConfirm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    location_type: "room" as LocationCreate["location_type"],
    description: "",
    capacity: "" as string | number,
    building: "",
    floor: "",
    city: "",
    virtual_url: "",
    virtual_platform: "",
    contact_persons: [] as LocationContactPerson[],
  });
  const [newContact, setNewContact] = useState<LocationContactPerson>({
    name: "",
    email: "",
    phone: "",
    comment: "",
  });

  const addContactToCreate = () => {
    if (newContact.name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [...createForm.contact_persons, { ...newContact }],
      });
      setNewContact({ name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeContactFromCreate = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons.filter((_, i) => i !== index),
    });
  };

  const updateContactInCreate = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons: createForm.contact_persons.map((c, i) => (i === index ? contact : c)),
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["conference-locations", conference.id],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Location>>(
        `/conferences/${conference.id}/locations`,
      );
      return response.data;
    },
  });

  const { data: allLocations } = useQuery({
    queryKey: ["all-locations"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Location>>(
        `/locations?page_size=100`,
      );
      return response.data;
    },
  });

  const { data: locationTypesData } = useQuery({
    queryKey: ["location-types"],
    queryFn: async () => {
      const response = await api.get<{ items: TenantLocationType[]; total: number }>(
        "/settings/location-types",
      );
      return response.data;
    },
  });

  const selectedLocation = useMemo(
    () => data?.items?.find((loc) => loc.id === selectedLocationId) || null,
    [data, selectedLocationId],
  );

  const linkMutation = useMutation({
    mutationFn: async (locationId: string) => {
      await api.post(`/conferences/${conference.id}/locations`, {
        id: locationId,
      });
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to link location");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: LocationCreate) => {
      const response = await api.post<Location>("/locations", data);
      return response.data;
    },
    onSuccess: (newLocation) => {
      setLinkError(null);
      setShowCreateForm(false);
      setCreateForm({ name: "", code: "", location_type: "room", description: "", capacity: "", building: "", floor: "", city: "", virtual_url: "", virtual_platform: "", contact_persons: [] });
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
      setSelectedLocationId(newLocation.id);
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to create location");
    },
  });

  const locationUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: LocationUpdateData }) => {
      await api.put(`/locations/${id}`, data);
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to update location");
    },
  });

  const locationDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/locations/${id}`);
    },
    onSuccess: () => {
      setLinkError(null);
      setSelectedLocationId(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-locations", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-locations"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to delete location");
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const contacts = [...createForm.contact_persons];
    if (newContact.name.trim()) {
      contacts.push({ ...newContact });
    }
    const payload: LocationCreate = {
      name: createForm.name,
      location_type: createForm.location_type,
      conference_id: conference.id,
    };
    if (createForm.code) payload.code = createForm.code;
    if (createForm.description) payload.description = createForm.description;
    if (createForm.capacity !== "") payload.capacity = Number(createForm.capacity);
    if (createForm.building) payload.building = createForm.building;
    if (createForm.floor) payload.floor = createForm.floor;
    if (createForm.city) payload.city = createForm.city;
    if (createForm.virtual_url) payload.virtual_url = createForm.virtual_url;
    if (createForm.virtual_platform) payload.virtual_platform = createForm.virtual_platform;
    if (contacts.length > 0) payload.contact_persons = contacts;
    createMutation.mutate(payload);
  };

  const isVirtual = createForm.location_type === "virtual";

  const linkedIds = new Set(data?.items?.map((l) => l.id) || []);
  const unlinkableLocations =
    allLocations?.items?.filter((l) => !linkedIds.has(l.id)) || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Linked Locations ({data?.total || 0})
        </h4>
        <div className="flex items-center gap-2">
          {unlinkableLocations.length > 0 && (
            <select
              className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  linkMutation.mutate(e.target.value);
                  e.target.value = "";
                }
              }}
            >
              <option value="">Link existing...</option>
              {unlinkableLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.location_type})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            {showCreateForm ? "Cancel" : "Create New"}
          </button>
        </div>
      </div>

      {linkError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {linkError}
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreateSubmit} className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">Name *</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Code</label>
              <input
                type="text"
                value={createForm.code}
                onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Type *</label>
              <select
                required
                value={createForm.location_type}
                onChange={(e) => setCreateForm({ ...createForm, location_type: e.target.value as LocationCreate["location_type"] })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                {locationTypesData?.items
                  ?.filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.slug}>{t.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Capacity</label>
            <input
              type="number"
              min="0"
              value={createForm.capacity}
              onChange={(e) => setCreateForm({ ...createForm, capacity: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          {isVirtual ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">Platform</label>
                <select
                  value={createForm.virtual_platform}
                  onChange={(e) => setCreateForm({ ...createForm, virtual_platform: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select platform</option>
                  {["zoom", "teams", "meet", "webex", "other"].map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">URL</label>
                <input
                  type="url"
                  value={createForm.virtual_url}
                  onChange={(e) => setCreateForm({ ...createForm, virtual_url: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">Building</label>
                <input
                  type="text"
                  value={createForm.building}
                  onChange={(e) => setCreateForm({ ...createForm, building: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Floor</label>
                <input
                  type="text"
                  value={createForm.floor}
                  onChange={(e) => setCreateForm({ ...createForm, floor: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">City</label>
                <input
                  type="text"
                  value={createForm.city}
                  onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          {/* Contact Persons */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Persons</label>
            <ContactPersonList
              contacts={createForm.contact_persons}
              newContact={newContact}
              setNewContact={setNewContact}
              addContact={addContactToCreate}
              removeContact={removeContactFromCreate}
              updateContact={updateContactInCreate}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Location"}
            </button>
          </div>
        </form>
      )}

      {/* Detail Panel (tree is in the sidebar) */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      ) : selectedLocation ? (
        <LocationDetailPanel
          location={selectedLocation}
          onSave={(updateData) =>
            locationUpdateMutation.mutate({ id: selectedLocation.id, data: updateData })
          }
          onDelete={() => setShowDeleteLocationConfirm(true)}
          isSaving={locationUpdateMutation.isPending}
          locationTypes={locationTypesData?.items}
        />
      ) : data?.items && data.items.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg
            className="w-12 h-12 text-gray-300 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-500">Select a location</p>
          <p className="text-xs text-gray-400 mt-1">
            Choose a location from the sidebar to view and edit its details
          </p>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
          No locations linked to this conference yet.
        </div>
      )}

      {selectedLocation && (
        <ConfirmDialog
          open={showDeleteLocationConfirm}
          title="Delete Location"
          message={`Are you sure you want to delete "${selectedLocation.name}"? This will permanently remove it.`}
          confirmLabel="Delete"
          onConfirm={() => {
            locationDeleteMutation.mutate(selectedLocation.id);
            setShowDeleteLocationConfirm(false);
          }}
          onCancel={() => setShowDeleteLocationConfirm(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conference CFPs Tab
// ---------------------------------------------------------------------------

function ConferenceCFPsTab({
  conference,
}: {
  conference: Conference;
}) {
  const queryClient = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    open_date: "",
    close_date: "",
    max_submissions_per_speaker: "",
    require_abstract: true,
    require_bio: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["conference-cfps", conference.id],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CallForPapers>>(
        `/conferences/${conference.id}/cfps`,
      );
      return response.data;
    },
  });

  const { data: allCFPs } = useQuery({
    queryKey: ["all-cfps"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CallForPapers>>(
        `/cfp?page_size=100`,
      );
      return response.data;
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (cfpId: string) => {
      await api.post(`/conferences/${conference.id}/cfps`, { id: cfpId });
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-cfps", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-cfps"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to link CFP");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (cfpId: string) => {
      await api.delete(`/conferences/${conference.id}/cfps/${cfpId}`);
    },
    onSuccess: () => {
      setLinkError(null);
      queryClient.invalidateQueries({
        queryKey: ["conference-cfps", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-cfps"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to unlink CFP");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CFPCreate) => {
      await api.post("/cfp", data);
    },
    onSuccess: () => {
      setLinkError(null);
      setShowCreateForm(false);
      setCreateForm({ title: "", description: "", open_date: "", close_date: "", max_submissions_per_speaker: "", require_abstract: true, require_bio: true });
      queryClient.invalidateQueries({
        queryKey: ["conference-cfps", conference.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-cfps"] });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setLinkError(axiosError.response?.data?.detail || "Failed to create CFP");
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CFPCreate = {
      title: createForm.title,
      conference_id: conference.id,
      require_abstract: createForm.require_abstract,
      require_bio: createForm.require_bio,
    };
    if (createForm.description) payload.description = createForm.description;
    if (createForm.open_date) payload.open_date = createForm.open_date;
    if (createForm.close_date) payload.close_date = createForm.close_date;
    if (createForm.max_submissions_per_speaker)
      payload.max_submissions_per_speaker = Number(createForm.max_submissions_per_speaker);
    createMutation.mutate(payload);
  };

  const linkedIds = new Set(data?.items?.map((c) => c.id) || []);
  const unlinkableCFPs =
    allCFPs?.items?.filter((c) => !linkedIds.has(c.id)) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return "bg-green-100 text-green-700";
      case "closed":
        return "bg-red-100 text-red-700";
      case "review":
        return "bg-purple-100 text-purple-700";
      case "completed":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900">
          Linked Call for Papers ({data?.total || 0})
        </h4>
        <div className="flex items-center gap-2">
          {unlinkableCFPs.length > 0 && (
            <select
              className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  linkMutation.mutate(e.target.value);
                  e.target.value = "";
                }
              }}
            >
              <option value="">Link existing...</option>
              {unlinkableCFPs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            {showCreateForm ? "Cancel" : "Create New"}
          </button>
        </div>
      </div>

      {linkError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {linkError}
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreateSubmit} className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">Title *</label>
            <input
              type="text"
              required
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Open Date</label>
              <input
                type="datetime-local"
                value={createForm.open_date}
                onChange={(e) => setCreateForm({ ...createForm, open_date: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Close Date</label>
              <input
                type="datetime-local"
                value={createForm.close_date}
                onChange={(e) => setCreateForm({ ...createForm, close_date: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Max Submissions per Speaker</label>
            <input
              type="number"
              min="1"
              placeholder="Leave empty for unlimited"
              value={createForm.max_submissions_per_speaker}
              onChange={(e) => setCreateForm({ ...createForm, max_submissions_per_speaker: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={createForm.require_abstract}
                onChange={(e) => setCreateForm({ ...createForm, require_abstract: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Require Abstract
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={createForm.require_bio}
                onChange={(e) => setCreateForm({ ...createForm, require_bio: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Require Speaker Bio
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create CFP"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Submissions
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Close Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.items.map((cfp) => (
                <tr key={cfp.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {cfp.title}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(cfp.status)}`}
                    >
                      {cfp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {cfp.submission_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {cfp.close_date
                      ? new Date(cfp.close_date).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => unlinkMutation.mutate(cfp.id)}
                      disabled={unlinkMutation.isPending}
                      className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                      title="Unlink"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
          No Call for Papers linked to this conference yet.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Providers Tab
// ---------------------------------------------------------------------------

function ConferenceServiceProvidersTab({
  conference,
}: {
  conference: Conference;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state for create
  const [createForm, setCreateForm] = useState<ServiceProviderCreate>({
    company_name: "",
    service_description: "",
    contact_persons: [],
  });
  const [createNewContact, setCreateNewContact] =
    useState<LocationContactPerson>({
      name: "",
      email: "",
      phone: "",
      comment: "",
    });

  // Form state for edit
  const [editForm, setEditForm] = useState<ServiceProviderUpdate>({});
  const [editNewContact, setEditNewContact] = useState<LocationContactPerson>({
    name: "",
    email: "",
    phone: "",
    comment: "",
  });

  const [deleteTarget, setDeleteTarget] = useState<ServiceProvider | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["conference-service-providers", conference.id],
    queryFn: async () => {
      const response = await api.get<{
        items: ServiceProvider[];
        total: number;
      }>(`/conferences/${conference.id}/service-providers`);
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (spData: ServiceProviderCreate) => {
      const response = await api.post<ServiceProvider>(
        `/conferences/${conference.id}/service-providers`,
        spData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conference-service-providers", conference.id],
      });
      setIsAdding(false);
      setCreateForm({
        company_name: "",
        service_description: "",
        contact_persons: [],
      });
      setCreateNewContact({ name: "", email: "", phone: "", comment: "" });
      setError(null);
    },
    onError: (err: unknown) => {
      const axiosError = err as {
        response?: { data?: { detail?: string } };
      };
      setError(
        axiosError.response?.data?.detail || "Failed to create service provider",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data: spData,
    }: {
      id: string;
      data: ServiceProviderUpdate;
    }) => {
      const response = await api.put<ServiceProvider>(
        `/conferences/${conference.id}/service-providers/${id}`,
        spData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conference-service-providers", conference.id],
      });
      setEditingId(null);
      setEditForm({});
      setEditNewContact({ name: "", email: "", phone: "", comment: "" });
      setError(null);
    },
    onError: (err: unknown) => {
      const axiosError = err as {
        response?: { data?: { detail?: string } };
      };
      setError(
        axiosError.response?.data?.detail || "Failed to update service provider",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(
        `/conferences/${conference.id}/service-providers/${id}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conference-service-providers", conference.id],
      });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...createForm };
    if (createNewContact.name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...createNewContact },
      ];
    }
    createMutation.mutate(finalData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const finalData = { ...editForm };
    if (editNewContact.name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...editNewContact },
      ];
    }
    updateMutation.mutate({ id: editingId, data: finalData });
  };

  const startEdit = (sp: ServiceProvider) => {
    setEditingId(sp.id);
    setEditForm({
      company_name: sp.company_name,
      service_description: sp.service_description || "",
      contact_persons: sp.contact_persons || [],
    });
    setEditNewContact({ name: "", email: "", phone: "", comment: "" });
    setIsAdding(false);
    setError(null);
  };

  const addCreateContact = () => {
    if (createNewContact.name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [
          ...(createForm.contact_persons || []),
          { ...createNewContact },
        ],
      });
      setCreateNewContact({ name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const addEditContact = () => {
    if (editNewContact.name.trim()) {
      setEditForm({
        ...editForm,
        contact_persons: [
          ...(editForm.contact_persons || []),
          { ...editNewContact },
        ],
      });
      setEditNewContact({ name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeEditContact = (index: number) => {
    setEditForm({
      ...editForm,
      contact_persons:
        editForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (index: number, contact: LocationContactPerson) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const updateEditContact = (index: number, contact: LocationContactPerson) => {
    setEditForm({
      ...editForm,
      contact_persons:
        editForm.contact_persons?.map((c, i) => (i === index ? contact : c)) || [],
    });
  };

  const providerCount = data?.items?.length || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Service Providers
            {providerCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                {providerCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">
            Manage service providers for this conference.
          </p>
        </div>
        {!isAdding && !editingId && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setError(null);
            }}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Provider
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Create form */}
      {isAdding && (
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-4"
        >
          <h5 className="text-sm font-medium text-gray-900">
            New Service Provider
          </h5>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={createForm.company_name}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    company_name: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Description
              </label>
              <textarea
                rows={2}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={createForm.service_description || ""}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    service_description: e.target.value,
                  })
                }
              />
            </div>
            <ContactPersonList
              contacts={createForm.contact_persons || []}
              newContact={createNewContact}
              setNewContact={setCreateNewContact}
              addContact={addCreateContact}
              removeContact={removeCreateContact}
              updateContact={updateCreateContact}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setError(null);
                setCreateForm({
                  company_name: "",
                  service_description: "",
                  contact_persons: [],
                });
                setCreateNewContact({
                  name: "",
                  email: "",
                  phone: "",
                  comment: "",
                });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Provider list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((sp) =>
            editingId === sp.id ? (
              /* Edit form */
              <form
                key={sp.id}
                onSubmit={handleEditSubmit}
                className="bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-4"
              >
                <h5 className="text-sm font-medium text-gray-900">
                  Edit Provider
                </h5>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={editForm.company_name || ""}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          company_name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Service Description
                    </label>
                    <textarea
                      rows={2}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={editForm.service_description || ""}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          service_description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <ContactPersonList
                    contacts={editForm.contact_persons || []}
                    newContact={editNewContact}
                    setNewContact={setEditNewContact}
                    addContact={addEditContact}
                    removeContact={removeEditContact}
                    updateContact={updateEditContact}
                  />
                </div>

                <AttachmentList
                  entityType="service_provider"
                  entityId={sp.id}
                />

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Display card */
              <div
                key={sp.id}
                className="bg-white border border-gray-200 border-l-4 border-l-primary-300 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h5 className="text-sm font-semibold text-gray-900">
                      {sp.company_name}
                    </h5>
                    {sp.service_description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {sp.service_description}
                      </p>
                    )}
                    {sp.contact_persons && sp.contact_persons.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sp.contact_persons.map((cp, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-xs"
                          >
                            <span className="w-4 h-4 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                              {cp.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium">{cp.name}</span>
                            {cp.email && (
                              <span className="text-gray-500">{cp.email}</span>
                            )}
                            {cp.phone && (
                              <span className="text-gray-500">{cp.phone}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 ml-3 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(sp)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                      title="Edit"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(sp)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <svg
                        className="w-4 h-4"
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
                  </div>
                </div>

                <AttachmentList
                  entityType="service_provider"
                  entityId={sp.id}
                />
              </div>
            ),
          )}
        </div>
      ) : (
        !isAdding && (
          <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            No service providers yet. Click "+ Add Provider" to get started.
          </div>
        )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Service Provider"
        message={`Are you sure you want to delete "${deleteTarget?.company_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
