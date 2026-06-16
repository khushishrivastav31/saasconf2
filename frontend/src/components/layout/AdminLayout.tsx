import { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import ThemeToggle from '../ThemeToggle';
import ChangePasswordModal from '../ChangePasswordModal';
import NotificationDropdown from './NotificationDropdown';

const baseNavigation = [{ name: 'Welcome', href: '/dashboard', icon: HomeIcon }];

const handbookLinks = [
  {
    name: 'Conference Handbook',
    href: '/handbook/conferences',
    icon: BookIcon,
    moduleCode: 'conferences',
  },
  {
    name: 'Training Handbook',
    href: '/handbook/trainings',
    icon: BookIcon,
    moduleCode: 'trainings',
  },
];

const adminNavigation = [
  { name: 'Companies', href: '/admin/tenants', icon: BuildingIcon },
  { name: 'Audit Logs', href: '/admin/audit-logs', icon: DocumentIcon },
  { name: 'Settings', href: '/admin/settings', icon: CogIcon },
];

const moduleNavigation = [
  {
    name: 'Conferences',
    href: '/modules/conferences',
    icon: CalendarIcon,
    moduleCode: 'conferences',
  },
  {
    name: 'Trainings',
    href: '/modules/trainings',
    icon: AcademicCapIcon,
    moduleCode: 'trainings',
  },
];

function HomeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

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

function AcademicCapIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function ActivityIcon() {
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

function PronounIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

function MyCompanyLink({
  active,
  collapsed,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const { data } = useQuery<{ pending_review: number }>({
    queryKey: queryKeys.privacyRequests.pendingCount,
    queryFn: () => api.get('/privacy-requests/pending-count').then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const pending = data?.pending_review ?? 0;

  return (
    <Link
      to={pending > 0 ? '/my-company?tab=privacy' : '/my-company'}
      onClick={onClick}
      title={collapsed ? 'My Company' : undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center py-2 text-sm font-medium rounded-md ${
        collapsed ? 'justify-center px-2' : 'px-3'
      } ${active ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
    >
      <span className="relative">
        <BuildingIcon />
        {pending > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 text-[9px] font-bold text-white bg-red-500 rounded-full">
            {pending > 99 ? '99+' : pending}
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="ml-3 flex items-center gap-2">
          My Company
          {pending > 0 && (
            <span
              className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full"
              data-testid="privacy-pending-badge"
            >
              {pending > 99 ? '99+' : pending}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

export default function AdminLayout() {
  const { user, logout, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const lastRefreshRef = useRef(0);

  // Restore scroll position on page refresh
  useScrollRestoration();

  // Refresh user data on route changes to pick up module assignment changes
  useEffect(() => {
    const now = Date.now();
    // Throttle to at most once per 30 seconds to avoid excessive API calls
    if (now - lastRefreshRef.current > 30_000) {
      lastRefreshRef.current = now;
      refreshUser();
    }
  }, [location.pathname, refreshUser]);

  // Close user menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isSuperAdmin = user?.role === 'super_admin';

  const { data: sidebarConferences } = useQuery({
    queryKey: queryKeys.conferences.sidebar,
    queryFn: async () => {
      const res = await api.get<{ items: Array<{ id: string; name: string }> }>(
        '/conferences?page_size=50'
      );
      return res.data.items;
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-gray-900 flex flex-col transform transition-all duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 ${sidebarCollapsed ? 'w-16' : 'w-64'}`}
      >
        <div className="flex h-16 items-center justify-between bg-gray-900 px-3 shrink-0">
          {!sidebarCollapsed && <h1 className="text-xl font-bold text-white ml-1">SaaSConf</h1>}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 ${
              sidebarCollapsed ? 'mx-auto' : ''
            }`}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            aria-label="Toggle sidebar navigation"
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
          <nav
            className={`mt-6 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}
            role="navigation"
            aria-label="Main navigation"
          >
            <div className="space-y-1">
              {baseNavigation.map((item) => {
                const isActive =
                  location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={sidebarCollapsed ? item.name : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center py-2 text-sm font-medium rounded-md ${
                      sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                    } ${
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <item.icon />
                    {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                  </Link>
                );
              })}
              {handbookLinks
                .filter(
                  (h) => user?.role === 'super_admin' || user?.modules?.includes(h.moduleCode)
                )
                .map((item) => {
                  const isActive =
                    location.pathname === item.href ||
                    location.pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      title={sidebarCollapsed ? item.name : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center py-2 text-sm font-medium rounded-md ${
                        sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                      } ${
                        isActive
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      <item.icon />
                      {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                    </Link>
                  );
                })}
            </div>

            {/* Module Navigation — filtered by tenant-enabled modules so an
                admin on a conferences-only tenant doesn't see the Trainings
                sidebar link (QA 0.5.1.3). Super admins see everything. */}
            {(() => {
              const availableModules = moduleNavigation.filter(
                (m) =>
                  user?.role === 'super_admin' ||
                  user?.role === 'tenant_admin' ||
                  (user?.modules?.includes(m.moduleCode) &&
                    (user?.is_tenant_super_user ||
                      user?.tenant_roles?.some(
                        (r) => r.scope === 'all' || r.scope === m.moduleCode
                      )))
              );
              if (availableModules.length === 0) return null;
              return (
                <div className="mt-8">
                  {!sidebarCollapsed && (
                    <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Modules
                    </h3>
                  )}
                  {sidebarCollapsed && <div className="border-t border-gray-700 mx-1 mb-2" />}
                  <div className={`${sidebarCollapsed ? '' : 'mt-2'} space-y-1`}>
                    {availableModules.map((item) => {
                      const isActive =
                        location.pathname === item.href ||
                        location.pathname.startsWith(item.href + '/');
                      const conferenceSubList =
                        !sidebarCollapsed &&
                        item.moduleCode === 'conferences' &&
                        sidebarConferences &&
                        sidebarConferences.length > 0 ? (
                          <div className="mt-0.5 ml-4 space-y-0.5">
                            {sidebarConferences.map((conf) => {
                              const isConfActive = location.pathname.startsWith(
                                `/modules/conferences/${conf.id}`
                              );
                              return (
                                <Link
                                  key={conf.id}
                                  to={`/modules/conferences/${conf.id}`}
                                  onClick={() => setSidebarOpen(false)}
                                  aria-current={isConfActive ? 'page' : undefined}
                                  className={`flex items-center py-1.5 px-3 text-sm rounded-md truncate ${
                                    isConfActive
                                      ? 'bg-gray-800 text-white'
                                      : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                                  }`}
                                >
                                  {conf.name}
                                </Link>
                              );
                            })}
                          </div>
                        ) : null;
                      return (
                        <div key={item.name}>
                          <Link
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            title={sidebarCollapsed ? item.name : undefined}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex items-center py-2 text-sm font-medium rounded-md ${
                              sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                            } ${
                              isActive
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            }`}
                          >
                            <item.icon />
                            {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                          </Link>
                          {conferenceSubList}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Team Management (tenant admin) */}
            {(user?.role === 'tenant_admin' || user?.role === 'super_admin') && (
              <div className="mt-8">
                {!sidebarCollapsed && (
                  <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Management
                  </h3>
                )}
                {sidebarCollapsed && <div className="border-t border-gray-700 mx-1 mb-2" />}
                <div className={`${sidebarCollapsed ? '' : 'mt-2'} space-y-1`}>
                  {/* My Company - tenant admin only */}
                  {user?.role === 'tenant_admin' && (
                    <MyCompanyLink
                      active={location.pathname === '/my-company'}
                      collapsed={sidebarCollapsed}
                      onClick={() => setSidebarOpen(false)}
                    />
                  )}
                  {/* Team - tenant admin only (super admin has no tenant, so Team is empty) */}
                  {user?.role === 'tenant_admin' && (
                    <Link
                      to="/team"
                      onClick={() => setSidebarOpen(false)}
                      title={sidebarCollapsed ? 'Team' : undefined}
                      aria-current={location.pathname === '/team' ? 'page' : undefined}
                      className={`flex items-center py-2 text-sm font-medium rounded-md ${
                        sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                      } ${
                        location.pathname === '/team'
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      <TeamIcon />
                      {!sidebarCollapsed && <span className="ml-3">Team</span>}
                    </Link>
                  )}
                  {/* Pronoun Options - tenant admin only */}
                  {user?.role === 'tenant_admin' && (
                    <Link
                      to="/pronoun-options"
                      onClick={() => setSidebarOpen(false)}
                      title={sidebarCollapsed ? 'Pronoun Options' : undefined}
                      aria-current={location.pathname === '/pronoun-options' ? 'page' : undefined}
                      className={`flex items-center py-2 text-sm font-medium rounded-md ${
                        sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                      } ${
                        location.pathname === '/pronoun-options'
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      <PronounIcon />
                      {!sidebarCollapsed && <span className="ml-3">Pronoun Options</span>}
                    </Link>
                  )}
                  {/* Applicant Activity - tenant admin only */}
                  {user?.role === 'tenant_admin' && (
                    <Link
                      to="/applicant-activity"
                      onClick={() => setSidebarOpen(false)}
                      title={sidebarCollapsed ? 'Activity Log' : undefined}
                      aria-current={
                        location.pathname === '/applicant-activity' ? 'page' : undefined
                      }
                      className={`flex items-center py-2 text-sm font-medium rounded-md ${
                        sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                      } ${
                        location.pathname === '/applicant-activity'
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      <ActivityIcon />
                      {!sidebarCollapsed && <span className="ml-3">Activity Log</span>}
                    </Link>
                  )}
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
                {sidebarCollapsed && <div className="border-t border-gray-700 mx-1 mb-2" />}
                <div className={`${sidebarCollapsed ? '' : 'mt-2'} space-y-1`}>
                  {adminNavigation.map((item) => {
                    const isActive =
                      location.pathname === item.href ||
                      location.pathname.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        title={sidebarCollapsed ? item.name : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center py-2 text-sm font-medium rounded-md ${
                          sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                        } ${
                          isActive
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        }`}
                      >
                        <item.icon />
                        {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className={`transition-all duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white dark:bg-gray-800 shadow">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              className="lg:hidden -ml-2 p-2 text-gray-500 dark:text-gray-400"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <div ref={userMenuRef} className="relative ml-auto flex items-center gap-4">
              <ThemeToggle
                onPersist={(t) => api.patch('/auth/me/preferences', { theme_preference: t })}
              />
              <NotificationDropdown />
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md px-2 py-1"
              >
                <div className="text-left">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs capitalize">
                    {user?.role?.replace('_', ' ')}
                  </p>
                </div>
                <svg
                  className="w-4 h-4 text-gray-400 dark:text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {`${user?.first_name || ''} ${user?.last_name || ''}`.trim()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      setChangePasswordOpen(true);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Change Password
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <ChangePasswordModal
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
        />

        {/* Page content */}
        <main className="py-6 px-4 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
