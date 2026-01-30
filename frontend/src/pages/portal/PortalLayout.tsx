import { useState } from "react";
import { Navigate, Outlet, Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApplicantAuth } from "../../hooks/useApplicantAuth";
import portalApi from "../../config/portalApi";
import type { PortalConferenceSummary } from "../../types/portal";

function DocumentIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function InformationCircleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ClipboardListIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}

function ClipboardCheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function PortalLayout() {
  const { applicant, isLoading, logout } = useApplicantAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { companySlug } = useParams<{ companySlug: string }>();
  const basePath = `/${companySlug}/portal`;

  const { data: conferences } = useQuery({
    queryKey: ["portal-conferences"],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceSummary[]>(
        "/portal/conferences",
      );
      return res.data;
    },
    enabled: !!applicant,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!applicant) {
    return <Navigate to={`${basePath}/user/login`} replace />;
  }


  const navigation = [
    { name: "My Papers", href: `${basePath}/dashboard`, icon: DocumentIcon },
    { name: "Submit Paper", href: `${basePath}/papers/new`, icon: PlusIcon },
    { name: "Invitations", href: `${basePath}/invitations`, icon: MailIcon },
    { name: "Assigned Papers", href: `${basePath}/assigned-papers`, icon: ClipboardListIcon },
    { name: "Evaluated Papers", href: `${basePath}/evaluated-papers`, icon: ClipboardCheckIcon },
    { name: "Profile", href: `${basePath}/profile`, icon: UserIcon },
  ];

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  // Conferences with at least one CFP
  const conferencesWithCfps = (conferences ?? []).filter(
    (c) => c.cfps.length > 0,
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-gray-900 flex flex-col transform transition-all duration-200 ease-in-out lg:translate-x-0 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="flex h-16 items-center justify-between bg-gray-900 px-3 flex-shrink-0">
          {!sidebarCollapsed && (
            <Link
              to={`${basePath}/dashboard`}
              className="text-xl font-bold text-white ml-1 hover:text-gray-200"
            >
              CFP Portal
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 ${
              sidebarCollapsed ? "mx-auto" : ""
            }`}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className={`mt-6 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
            <div className="space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  title={sidebarCollapsed ? item.name : undefined}
                  className={`flex items-center py-2 text-sm font-medium rounded-md ${
                    sidebarCollapsed ? "justify-center px-2" : "px-3"
                  } ${
                    isActive(item.href)
                      ? "bg-gray-800 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  <item.icon />
                  {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                </Link>
              ))}
            </div>

            {/* Conference sections */}
            {conferencesWithCfps.length > 0 && (
              <div className={`mt-6 ${sidebarCollapsed ? "" : "pt-4 border-t border-gray-700"}`}>
                {!sidebarCollapsed && (
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Conferences
                  </p>
                )}
                <div className="space-y-3">
                  {conferencesWithCfps.map((conf) => {
                    const infoHref = `${basePath}/info/${conf.id}`;
                    const infoActive = isActive(infoHref);
                    return (
                      <div key={conf.id}>
                        {!sidebarCollapsed && (
                          <p className="px-3 text-xs font-medium text-gray-400 truncate mb-1" title={conf.name}>
                            {conf.name}
                          </p>
                        )}
                        <Link
                          to={infoHref}
                          title={sidebarCollapsed ? `${conf.name} — Info` : undefined}
                          className={`flex items-center py-1.5 text-sm font-medium rounded-md ${
                            sidebarCollapsed ? "justify-center px-2" : "px-3 pl-6"
                          } ${
                            infoActive
                              ? "bg-gray-800 text-white"
                              : "text-gray-300 hover:bg-gray-700 hover:text-white"
                          }`}
                        >
                          <InformationCircleIcon />
                          {!sidebarCollapsed && <span className="ml-2">Info</span>}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div
        className={`transition-all duration-200 ${
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
        }`}
      >
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white shadow">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div />
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <p className="font-medium text-gray-900">{`${applicant.first_name} ${applicant.last_name}`.trim()}</p>
                <p className="text-gray-500 text-xs">{applicant.email}</p>
              </div>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="py-6 px-4 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default PortalLayout;
