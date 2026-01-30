import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import { useIsAdmin } from "../../hooks/useIsAdmin";
import api from "../../config/api";
import type {
  Conference,
  PaginatedResponse,
  Location,
  ServiceProvider,
  Sponsor,
  Invoice,
  CommitteeMember,
  Applicant,
} from "../../types";
import Modal from "../../components/Modal";
import { parseApiError } from "../../utils/apiError";
import { BackIcon } from "./icons";
import {
  SectionId,
  coreSections,
  moduleSections,
} from "./conferenceSections";

// Tab components
import ConferenceDetailsTab from "./tabs/DetailsTab";
import ConferenceTeamTab from "./tabs/TeamTab";
import ConferenceSocialTab from "./tabs/SocialTab";
import ConferenceVolunteersTab from "./tabs/VolunteersTab";
import ConferenceLocationsTab from "./tabs/LocationsTab";
import ConferenceCFPsTab from "./tabs/CFPsTab";
import ConferenceSponsorsTab from "./tabs/SponsorsTab";
import ConferenceBookingTab from "./tabs/BookingTab";
import ConferenceInvoicesTab from "./tabs/InvoicesTab";
import ConferenceServiceProvidersTab from "./tabs/ServiceProvidersTab";
import ConferenceSettingsTab from "./tabs/SettingsTab";
import { CFPTopics, CFPProgramCommittee, CFPApplicants, CFPPapers, CFPEvaluatedPapers, CFPSelectedPapers, CFPAssignments } from "../modules/cfp";

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
// Delete Preview
// ---------------------------------------------------------------------------

interface DeletePreview {
  conference_name: string;
  volunteers: {
    total_linked: number;
    will_delete: number;
    will_unlink: number;
  };
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
  const isAdmin = useIsAdmin();
  const [activeSection, setActiveSection] = useState<SectionId>("details");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  // Auto-expand parent sections when a child is active
  useEffect(() => {
    for (const section of moduleSections) {
      if (
        section.children &&
        (activeSection === section.id ||
          section.children.some((c) => c.id === activeSection))
      ) {
        setExpandedSections((prev) => {
          if (prev.has(section.id)) return prev;
          const next = new Set(prev);
          next.add(section.id);
          return next;
        });
      }
    }
  }, [activeSection]);

  // Build sections: core sections are always visible, module sections depend on user's assigned modules
  const sections = useMemo(() => {
    const userModules = user?.modules ?? [];
    const isSuperAdmin = user?.role === "super_admin";
    const available = moduleSections.filter(
      (s) =>
        !s.moduleCode || isSuperAdmin || userModules.includes(s.moduleCode),
    );
    return [...coreSections, ...available];
  }, [user?.modules, user?.role]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(
    null,
  );
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Location tree state (lifted here so sidebar can render the tree)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  // Service provider selection state (lifted here so sidebar can render the list)
  const [selectedServiceProviderId, setSelectedServiceProviderId] = useState<
    string | null
  >(null);
  // Sponsor selection state (lifted here so sidebar can render the list)
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(
    null,
  );
  // Invoice selection state (lifted here so sidebar can render the list)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  // Committee member selection state (lifted here so sidebar can render the list)
  const [selectedCommitteeMemberId, setSelectedCommitteeMemberId] = useState<
    string | null
  >(null);
  // Applicant selection state (lifted here so sidebar can render the list)
  const [selectedApplicantId, setSelectedApplicantId] = useState<
    string | null
  >(null);

  const {
    data: conference,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["conference", conferenceId],
    queryFn: async () => {
      const response = await api.get<Conference>(
        `/conferences/${conferenceId}`,
      );
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

  // Service provider data for the sidebar list
  const { data: conferenceServiceProvidersData } = useQuery({
    queryKey: ["conference-service-providers", conferenceId],
    queryFn: async () => {
      const response = await api.get<{
        items: ServiceProvider[];
        total: number;
      }>(`/conferences/${conferenceId}/service-providers`);
      return response.data;
    },
    enabled: !!conferenceId,
  });

  // Sponsor data for the sidebar list
  const { data: conferenceSponsorsData } = useQuery({
    queryKey: ["conference-sponsors", conferenceId],
    queryFn: async () => {
      const response = await api.get<{
        items: Sponsor[];
        total: number;
      }>(`/conferences/${conferenceId}/sponsors`);
      return response.data;
    },
    enabled: !!conferenceId,
  });

  // Invoice data for the sidebar list
  const { data: conferenceInvoicesData } = useQuery({
    queryKey: ["conference-invoices", conferenceId],
    queryFn: async () => {
      const response = await api.get<{
        items: Invoice[];
        total: number;
      }>(`/conferences/${conferenceId}/invoices`);
      return response.data;
    },
    enabled: !!conferenceId,
  });

  // Committee member data for the sidebar list (filtered by conference)
  const { data: committeeMembersData } = useQuery({
    queryKey: ["cfp-committee-members", conferenceId ?? "all"],
    queryFn: async () => {
      const params = conferenceId ? { conference_id: conferenceId } : {};
      const response = await api.get<{
        items: CommitteeMember[];
        total: number;
      }>("/cfp/committee-members", { params });
      return response.data;
    },
  });

  // Applicant data for the sidebar list (filtered by conference)
  const { data: applicantsData } = useQuery({
    queryKey: ["cfp-applicants", conferenceId ?? "all"],
    queryFn: async () => {
      const params = conferenceId ? { conference_id: conferenceId } : {};
      const response = await api.get<{
        items: Applicant[];
        total: number;
      }>("/cfp/applicants", { params });
      return response.data;
    },
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
      setDeleteError(parseApiError(error, "Failed to delete conference"));
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
        <h2 className="text-lg font-medium text-gray-900">
          Conference not found
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          The conference you are looking for does not exist or was deleted.
        </p>
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
            <h1 className="text-2xl font-bold text-gray-900">
              {conference.name}
            </h1>
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
        {isAdmin && (
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
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Section navigation sidebar */}
        <nav
          className={`flex-shrink-0 transition-all duration-200 ${
            sidebarCollapsed
              ? "w-14"
              : activeSection === "locations" ||
                  activeSection === "service_providers" ||
                  activeSection === "sponsors" ||
                  activeSection === "invoices" ||
                  expandedSections.has("cfp")
                ? "w-64"
                : "w-56"
          }`}
        >
          <div
            className="bg-white rounded-lg shadow p-2 sticky top-24 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          >
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center p-1.5 mb-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
                (section.children?.some((c) => c.id === activeSection) ??
                  false);
              return (
                <div key={section.id}>
                  <div className="flex items-center">
                    <button
                      onClick={() => setActiveSection(section.id)}
                      title={sidebarCollapsed ? section.name : undefined}
                      className={`flex-1 flex items-center rounded-md mb-0.5 ${
                        sidebarCollapsed
                          ? "justify-center px-2 py-2"
                          : "px-3 py-2"
                      } text-sm font-medium ${
                        isParentActive
                          ? "bg-primary-50 text-primary-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <section.icon />
                      {!sidebarCollapsed && (
                        <span className="ml-3">{section.name}</span>
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
                        className="p-1 mr-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${
                            expandedSections.has(section.id) ? "rotate-90" : ""
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
                        {section.children.flatMap((child) => {
                          const items: React.ReactNode[] = [
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => {
                                setActiveSection(child.id);
                                if (child.id === "cfp-program-committee") {
                                  setSelectedCommitteeMemberId(null);
                                }
                                if (child.id === "cfp-applicants") {
                                  setSelectedApplicantId(null);
                                }
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                                activeSection === child.id
                                  ? "bg-primary-50 text-primary-700 font-medium"
                                  : "text-gray-600 hover:bg-gray-100"
                              }`}
                            >
                              <child.icon />
                              <span className="truncate text-left">
                                {child.name}
                              </span>
                            </button>,
                          ];
                          if (
                            child.id === "cfp-program-committee" &&
                            activeSection === "cfp-program-committee"
                          ) {
                            items.push(
                              <div
                                key="committee-members-list"
                                className="ml-4 space-y-0.5 my-0.5"
                              >
                                {(committeeMembersData?.items || []).map(
                                  (m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedCommitteeMemberId(m.id)
                                      }
                                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                                        m.id === selectedCommitteeMemberId
                                          ? "bg-primary-50 text-primary-700 font-medium"
                                          : "text-gray-600 hover:bg-gray-100"
                                      }`}
                                    >
                                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-400" />
                                      <span className="truncate text-left flex-1">
                                        {`${m.first_name} ${m.last_name}`.trim()}
                                      </span>
                                      <span className="text-[10px] text-gray-400 capitalize flex-shrink-0">
                                        {m.role?.replace("_", " ")}
                                      </span>
                                    </button>
                                  ),
                                )}
                                {(committeeMembersData?.items || []).length ===
                                  0 && (
                                  <p className="text-xs text-gray-400 px-3 py-2">
                                    No members
                                  </p>
                                )}
                              </div>,
                            );
                          }
                          if (
                            child.id === "cfp-applicants" &&
                            activeSection === "cfp-applicants"
                          ) {
                            items.push(
                              <div
                                key="applicants-list"
                                className="ml-4 space-y-0.5 my-0.5"
                              >
                                {(applicantsData?.items || []).map((a) => (
                                  <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => setSelectedApplicantId(a.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                                      a.id === selectedApplicantId
                                        ? "bg-primary-50 text-primary-700 font-medium"
                                        : "text-gray-600 hover:bg-gray-100"
                                    }`}
                                  >
                                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-400" />
                                    <span className="truncate text-left">
                                      {`${a.first_name} ${a.last_name}`.trim()}
                                    </span>
                                  </button>
                                ))}
                                {(applicantsData?.items || []).length === 0 && (
                                  <p className="text-xs text-gray-400 px-3 py-2">
                                    No users
                                  </p>
                                )}
                              </div>,
                            );
                          }
                          return items;
                        })}
                      </div>
                    )}
                  {/* Inline location list right below the Locations button */}
                  {section.id === "locations" &&
                    activeSection === "locations" &&
                    !sidebarCollapsed && (
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
                            <span className="truncate text-left">
                              {loc.name}
                            </span>
                          </button>
                        ))}
                        {(conferenceLocationsData?.items || []).length ===
                          0 && (
                          <p className="text-xs text-gray-400 px-3 py-2">
                            No locations
                          </p>
                        )}
                      </div>
                    )}
                  {/* Inline service provider list */}
                  {section.id === "service_providers" &&
                    activeSection === "service_providers" &&
                    !sidebarCollapsed && (
                      <div className="ml-4 mb-1 space-y-0.5">
                        {(conferenceServiceProvidersData?.items || []).map(
                          (sp) => (
                            <button
                              key={sp.id}
                              type="button"
                              onClick={() =>
                                setSelectedServiceProviderId(sp.id)
                              }
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                                sp.id === selectedServiceProviderId
                                  ? "bg-primary-50 text-primary-700 font-medium"
                                  : "text-gray-600 hover:bg-gray-100"
                              }`}
                            >
                              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-400" />
                              <span className="truncate text-left">
                                {sp.company_name}
                              </span>
                            </button>
                          ),
                        )}
                        {(conferenceServiceProvidersData?.items || [])
                          .length === 0 && (
                          <p className="text-xs text-gray-400 px-3 py-2">
                            No providers
                          </p>
                        )}
                      </div>
                    )}
                  {/* Inline sponsor list */}
                  {section.id === "sponsors" &&
                    activeSection === "sponsors" &&
                    !sidebarCollapsed && (
                      <div className="ml-4 mb-1 space-y-0.5">
                        {(conferenceSponsorsData?.items || []).map((sp) => (
                          <button
                            key={sp.id}
                            type="button"
                            onClick={() => setSelectedSponsorId(sp.id)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                              sp.id === selectedSponsorId
                                ? "bg-primary-50 text-primary-700 font-medium"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            <span
                              className={`flex-shrink-0 w-2 h-2 rounded-full ${
                                sp.is_active ? "bg-green-400" : "bg-red-400"
                              }`}
                            />
                            <span className="truncate text-left">
                              {sp.company_name}
                            </span>
                          </button>
                        ))}
                        {(conferenceSponsorsData?.items || []).length === 0 && (
                          <p className="text-xs text-gray-400 px-3 py-2">
                            No sponsors
                          </p>
                        )}
                      </div>
                    )}
                  {/* Inline invoice list */}
                  {section.id === "invoices" &&
                    activeSection === "invoices" &&
                    !sidebarCollapsed && (
                      <div className="ml-4 mb-1 space-y-0.5">
                        {(conferenceInvoicesData?.items || []).map((inv) => (
                          <button
                            key={inv.id}
                            type="button"
                            onClick={() => setSelectedInvoiceId(inv.id)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                              inv.id === selectedInvoiceId
                                ? "bg-primary-50 text-primary-700 font-medium"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            <span
                              className={`flex-shrink-0 w-2 h-2 rounded-full ${
                                inv.status === "paid"
                                  ? "bg-green-400"
                                  : inv.status === "overdue"
                                    ? "bg-red-400"
                                    : inv.status === "sent"
                                      ? "bg-blue-400"
                                      : inv.status === "cancelled"
                                        ? "bg-yellow-400"
                                        : "bg-gray-400"
                              }`}
                            />
                            <span className="truncate text-left">
                              {inv.invoice_number}
                            </span>
                          </button>
                        ))}
                        {(conferenceInvoicesData?.items || []).length === 0 && (
                          <p className="text-xs text-gray-400 px-3 py-2">
                            No invoices
                          </p>
                        )}
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
            {activeSection === "details" && (
              <ConferenceDetailsTab
                conference={conference}
                onUpdate={handleUpdate}
              />
            )}
            {activeSection === "team" && (
              <ConferenceTeamTab
                conference={conference}
                onUpdate={handleUpdate}
              />
            )}
            {activeSection === "social" && (
              <ConferenceSocialTab
                conference={conference}
                onUpdate={handleUpdate}
              />
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
            {activeSection === "cfp-topics" && <CFPTopics />}
            {activeSection === "cfp-program-committee" && (
              <CFPProgramCommittee
                selectedMemberId={selectedCommitteeMemberId}
                setSelectedMemberId={setSelectedCommitteeMemberId}
                conferenceId={conferenceId}
              />
            )}
            {activeSection === "cfp-applicants" && (
              <CFPApplicants
                selectedApplicantId={selectedApplicantId}
                setSelectedApplicantId={setSelectedApplicantId}
                conferenceId={conferenceId}
              />
            )}
            {activeSection === "cfp-papers" && (
              <CFPPapers />
            )}
            {activeSection === "cfp-assignments" && (
              <CFPAssignments conferenceId={conferenceId} />
            )}
            {activeSection === "cfp-evaluated-papers" && (
              <CFPEvaluatedPapers />
            )}
            {activeSection === "cfp-accepted-papers" && (
              <CFPSelectedPapers filter="accepted" />
            )}
            {activeSection === "cfp-rejected-papers" && (
              <CFPSelectedPapers filter="rejected" />
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
              <ConferenceSponsorsTab
                conference={conference}
                selectedSponsorId={selectedSponsorId}
                setSelectedSponsorId={setSelectedSponsorId}
              />
            )}
            {activeSection === "analytics" && (
              <ComingSoonContent name="Analytics" />
            )}
            {activeSection === "service_providers" && (
              <ConferenceServiceProvidersTab
                conference={conference}
                selectedServiceProviderId={selectedServiceProviderId}
                setSelectedServiceProviderId={setSelectedServiceProviderId}
              />
            )}
            {activeSection === "invoices" && (
              <ConferenceInvoicesTab
                conference={conference}
                selectedInvoiceId={selectedInvoiceId}
                setSelectedInvoiceId={setSelectedInvoiceId}
              />
            )}
            {activeSection === "program" && (
              <ComingSoonContent name="Program" />
            )}
            {activeSection === "booking" && conference && (
              <ConferenceBookingTab
                conferenceId={conference.id}
              />
            )}
            {activeSection === "settings" && (
              <ConferenceSettingsTab conference={conference} />
            )}
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
              Are you sure you want to delete{" "}
              <strong>{deletePreview.conference_name}</strong>? This action
              cannot be undone.
            </p>

            {(deletePreview.volunteers.will_delete > 0 ||
              deletePreview.locations.will_delete > 0 ||
              deletePreview.cfps.will_delete > 0) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm">
                <p className="font-medium text-red-800 mb-2">
                  The following will be permanently deleted:
                </p>
                <ul className="space-y-1 text-red-700">
                  {deletePreview.volunteers.will_delete > 0 && (
                    <li>
                      {deletePreview.volunteers.will_delete} volunteer
                      {deletePreview.volunteers.will_delete !== 1 ? "s" : ""}
                    </li>
                  )}
                  {deletePreview.locations.will_delete > 0 && (
                    <li>
                      {deletePreview.locations.will_delete} location
                      {deletePreview.locations.will_delete !== 1 ? "s" : ""}
                    </li>
                  )}
                  {deletePreview.cfps.will_delete > 0 && (
                    <li>
                      {deletePreview.cfps.will_delete} call for paper
                      {deletePreview.cfps.will_delete !== 1 ? "s" : ""}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {(deletePreview.volunteers.will_unlink > 0 ||
              deletePreview.locations.will_unlink > 0 ||
              deletePreview.cfps.will_unlink > 0) && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                <p className="font-medium text-yellow-800 mb-2">
                  The following will be unlinked (shared with other
                  conferences):
                </p>
                <ul className="space-y-1 text-yellow-700">
                  {deletePreview.volunteers.will_unlink > 0 && (
                    <li>
                      {deletePreview.volunteers.will_unlink} volunteer
                      {deletePreview.volunteers.will_unlink !== 1 ? "s" : ""}
                    </li>
                  )}
                  {deletePreview.locations.will_unlink > 0 && (
                    <li>
                      {deletePreview.locations.will_unlink} location
                      {deletePreview.locations.will_unlink !== 1 ? "s" : ""}
                    </li>
                  )}
                  {deletePreview.cfps.will_unlink > 0 && (
                    <li>
                      {deletePreview.cfps.will_unlink} call for paper
                      {deletePreview.cfps.will_unlink !== 1 ? "s" : ""}
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
                {deleteLoading ? "Deleting..." : "Delete Conference"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
