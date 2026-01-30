import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const navigation = [{ name: "Dashboard", href: "/dashboard", icon: HomeIcon }];

const adminNavigation = [
  { name: "Companies", href: "/admin/tenants", icon: BuildingIcon },
  { name: "Modules", href: "/admin/modules", icon: CubeIcon },
  { name: "Audit Logs", href: "/admin/audit-logs", icon: DocumentIcon },
  { name: "Settings", href: "/admin/settings", icon: CogIcon },
];

const moduleNavigation = [
  {
    name: "Conferences",
    href: "/modules/conferences",
    icon: CalendarIcon,
    moduleCode: "conferences",
  },
  {
    name: "Users",
    href: "/modules/cfp/applicants",
    icon: UsersIcon,
    moduleCode: "cfp",
  },
];

function HomeIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}


function TeamIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

export default function AdminLayout() {
  const { user, logout, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastRefreshRef = useRef(0);

  // Refresh user data on route changes to pick up module assignment changes
  useEffect(() => {
    const now = Date.now();
    // Throttle to at most once per 30 seconds to avoid excessive API calls
    if (now - lastRefreshRef.current > 30_000) {
      lastRefreshRef.current = now;
      refreshUser();
    }
  }, [location.pathname, refreshUser]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isSuperAdmin = user?.role === "super_admin";

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
            <h1 className="text-xl font-bold text-white ml-1">SaaSConf</h1>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 ${
              sidebarCollapsed ? "mx-auto" : ""
            }`}
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
                    location.pathname === item.href ||
                    location.pathname.startsWith(item.href + "/")
                      ? "bg-gray-800 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  <item.icon />
                  {!sidebarCollapsed && (
                    <span className="ml-3">{item.name}</span>
                  )}
                </Link>
              ))}
            </div>

            {/* Module Navigation */}
            {(() => {
              const availableModules = isSuperAdmin
                ? moduleNavigation
                : moduleNavigation.filter((item) =>
                    user?.modules?.includes(item.moduleCode),
                  );
              if (availableModules.length === 0) return null;
              return (
                <div className="mt-8">
                  {!sidebarCollapsed && (
                    <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Modules
                    </h3>
                  )}
                  {sidebarCollapsed && (
                    <div className="border-t border-gray-700 mx-1 mb-2" />
                  )}
                  <div
                    className={`${sidebarCollapsed ? "" : "mt-2"} space-y-1`}
                  >
                    {availableModules.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        title={sidebarCollapsed ? item.name : undefined}
                        className={`flex items-center py-2 text-sm font-medium rounded-md ${
                          sidebarCollapsed ? "justify-center px-2" : "px-3"
                        } ${
                          location.pathname === item.href ||
                          location.pathname.startsWith(item.href + "/")
                            ? "bg-gray-800 text-white"
                            : "text-gray-300 hover:bg-gray-700 hover:text-white"
                        }`}
                      >
                        <item.icon />
                        {!sidebarCollapsed && (
                          <span className="ml-3">{item.name}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Team Management (tenant admin) */}
            {(user?.role === "tenant_admin" || user?.role === "super_admin") && (
              <div className="mt-8">
                {!sidebarCollapsed && (
                  <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Management
                  </h3>
                )}
                {sidebarCollapsed && (
                  <div className="border-t border-gray-700 mx-1 mb-2" />
                )}
                <div
                  className={`${sidebarCollapsed ? "" : "mt-2"} space-y-1`}
                >
                  <Link
                    to="/team"
                    title={sidebarCollapsed ? "Team" : undefined}
                    className={`flex items-center py-2 text-sm font-medium rounded-md ${
                      sidebarCollapsed ? "justify-center px-2" : "px-3"
                    } ${
                      location.pathname === "/team"
                        ? "bg-gray-800 text-white"
                        : "text-gray-300 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    <TeamIcon />
                    {!sidebarCollapsed && (
                      <span className="ml-3">Team</span>
                    )}
                  </Link>
                </div>
              </div>
            )}

            {isSuperAdmin && (
              <div className="mt-8">
                {!sidebarCollapsed && (
                  <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Administration
                  </h3>
                )}
                {sidebarCollapsed && (
                  <div className="border-t border-gray-700 mx-1 mb-2" />
                )}
                <div className={`${sidebarCollapsed ? "" : "mt-2"} space-y-1`}>
                  {adminNavigation.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`flex items-center py-2 text-sm font-medium rounded-md ${
                        sidebarCollapsed ? "justify-center px-2" : "px-3"
                      } ${
                        location.pathname === item.href ||
                        location.pathname.startsWith(item.href + "/")
                          ? "bg-gray-800 text-white"
                          : "text-gray-300 hover:bg-gray-700 hover:text-white"
                      }`}
                    >
                      <item.icon />
                      {!sidebarCollapsed && (
                        <span className="ml-3">{item.name}</span>
                      )}
                    </Link>
                  ))}
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
            <button
              className="lg:hidden -ml-2 p-2 text-gray-500"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <div className="flex items-center gap-4">
              <div className="text-sm">
                <p className="font-medium text-gray-900">
                  {`${user?.first_name || ""} ${user?.last_name || ""}`.trim() || user?.email}
                </p>
                <p className="text-gray-500 text-xs capitalize">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
              <button
                onClick={handleLogout}
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
