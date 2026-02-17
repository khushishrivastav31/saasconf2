import { useState } from 'react';
import { Navigate, Outlet, Link, useLocation, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import portalApi from '../../config/portalApi';
import ConferenceLogo from '../../components/ConferenceLogo';
import type {
  PortalConferenceSummary,
  PortalTenant,
  PortalCommitteeMembershipListResponse,
} from '../../types/portal';

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
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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

function NewspaperIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
      />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
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
    queryKey: ['portal-conferences'],
    queryFn: async () => {
      const res = await portalApi.get<PortalConferenceSummary[]>('/portal/conferences');
      return res.data;
    },
    enabled: !!applicant,
  });

  const { data: tenant } = useQuery({
    queryKey: ['portal-tenant', companySlug],
    queryFn: async () => {
      const res = await portalApi.get<PortalTenant>(`/portal/tenant/${companySlug}`);
      return res.data;
    },
    enabled: !!companySlug,
  });

  // Unread message count
  const { data: unreadData } = useQuery({
    queryKey: ['portal-unread-count'],
    queryFn: async () => {
      const res = await portalApi.get('/portal/messages/unread-count');
      return res.data as { unread_count: number };
    },
    enabled: !!applicant,
    refetchInterval: 30000, // Poll every 30s
  });
  const unreadCount = unreadData?.unread_count ?? 0;

  // Pending assignment count (for committee badge)
  const { data: pendingData } = useQuery({
    queryKey: ['portal-pending-assignments'],
    queryFn: async () => {
      const res = await portalApi.get('/portal/assigned-papers/pending-count');
      return res.data as { pending_count: number };
    },
    enabled: !!applicant,
    refetchInterval: 30000,
  });
  const pendingAssignments = pendingData?.pending_count ?? 0;

  // Committee membership check
  const { data: committeeMemberships } = useQuery({
    queryKey: ['portal-committee-memberships'],
    queryFn: async () => {
      const res = await portalApi.get<PortalCommitteeMembershipListResponse>(
        '/portal/me/committee-memberships'
      );
      return res.data;
    },
    enabled: !!applicant,
  });
  const isCommitteeMember = (committeeMemberships?.items.length ?? 0) > 0;

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

  type NavItem = {
    name: string;
    href: string;
    icon: () => React.JSX.Element;
    badge?: number;
  };
  type NavSection = { label: string; items: NavItem[] };

  const navSections: NavSection[] = [
    {
      label: 'Papers',
      items: [
        { name: 'My Papers', href: `${basePath}/dashboard`, icon: DocumentIcon },
        { name: 'Submit Paper', href: `${basePath}/papers/new`, icon: PlusIcon },
        { name: 'Co-Speaker Invitations', href: `${basePath}/invitations`, icon: MailIcon },
      ],
    },
    ...(isCommitteeMember
      ? [
          {
            label: 'Program Committee',
            items: [
              {
                name: 'Assigned Papers',
                href: `${basePath}/assigned-papers`,
                icon: ClipboardListIcon,
                badge: pendingAssignments,
              },
              {
                name: 'Evaluated Papers',
                href: `${basePath}/evaluated-papers`,
                icon: ClipboardCheckIcon,
              },
            ],
          },
        ]
      : []),
    {
      label: 'Account',
      items: [{ name: 'My Profile', href: `${basePath}/profile`, icon: UserIcon }],
    },
  ];

  // Messages as standalone item (with badge)
  const messagesItem: NavItem = {
    name: 'Messages',
    href: `${basePath}/messages`,
    icon: ChatBubbleIcon,
    badge: unreadCount,
  };

  // News as standalone item
  const newsItem: NavItem = {
    name: 'News',
    href: `${basePath}/news`,
    icon: NewspaperIcon,
  };

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  // Conferences with at least one CFP
  const conferencesWithCfps = (conferences ?? []).filter((c) => c.cfps.length > 0);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-gray-900 flex flex-col transform transition-all duration-200 ease-in-out lg:translate-x-0 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div
          className={`flex flex-col items-center bg-gray-900 px-3 flex-shrink-0 ${
            !sidebarCollapsed && tenant?.logo_url ? 'pt-5 pb-4' : 'h-16 justify-center'
          }`}
        >
          {!sidebarCollapsed && (
            <div className="flex items-center justify-between w-full">
              <Link
                to={`${basePath}/dashboard`}
                className={`flex flex-col items-center hover:opacity-90 ${
                  tenant?.logo_url ? 'flex-1' : 'flex-1 ml-1'
                }`}
              >
                {tenant?.logo_url ? (
                  <div className="w-28 h-28 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden mb-2">
                    <ConferenceLogo
                      logoUrl={tenant.logo_url}
                      apiInstance={portalApi}
                      alt={tenant.name}
                      className="w-24 h-24 object-contain"
                      showPlaceholder={false}
                    />
                  </div>
                ) : null}
                <span className="text-lg font-bold text-white">Portal</span>
              </Link>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 self-start"
                title="Collapse sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                </svg>
              </button>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="flex flex-col items-center gap-2">
              {tenant?.logo_url && (
                <Link
                  to={`${basePath}/dashboard`}
                  className="flex items-center justify-center w-10 h-10 rounded bg-white/10 overflow-hidden hover:opacity-90"
                >
                  <ConferenceLogo
                    logoUrl={tenant.logo_url}
                    apiInstance={portalApi}
                    alt={tenant.name}
                    className="w-8 h-8 object-contain"
                    showPlaceholder={false}
                  />
                </Link>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700"
                title="Expand sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <nav className={`mt-4 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {/* Communication (News & Messages) — first section */}
            <div>
              {!sidebarCollapsed && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Communication
                </p>
              )}
              <div className="space-y-0.5">
                <Link
                  to={newsItem.href}
                  title={sidebarCollapsed ? newsItem.name : undefined}
                  className={`relative flex items-center py-2 text-sm font-medium rounded-md ${
                    sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                  } ${
                    isActive(newsItem.href)
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <newsItem.icon />
                  {!sidebarCollapsed && <span className="ml-3">{newsItem.name}</span>}
                </Link>
                <Link
                  to={messagesItem.href}
                  title={sidebarCollapsed ? messagesItem.name : undefined}
                  className={`relative flex items-center py-2 text-sm font-medium rounded-md ${
                    sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                  } ${
                    isActive(messagesItem.href)
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <messagesItem.icon />
                  {!sidebarCollapsed && (
                    <span className="ml-3 flex-1 flex items-center justify-between">
                      {messagesItem.name}
                      {(messagesItem.badge ?? 0) > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                          {messagesItem.badge}
                        </span>
                      )}
                    </span>
                  )}
                  {sidebarCollapsed && (messagesItem.badge ?? 0) > 0 && (
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Link>
              </div>
            </div>

            {/* Grouped sections */}
            {navSections.map((section) => (
              <div
                key={section.label}
                className={`mt-4 ${sidebarCollapsed ? '' : 'pt-3 border-t border-gray-700'}`}
              >
                {!sidebarCollapsed && (
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`relative flex items-center py-2 text-sm font-medium rounded-md ${
                        sidebarCollapsed ? 'justify-center px-2' : 'px-3'
                      } ${
                        isActive(item.href)
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      <item.icon />
                      {!sidebarCollapsed && (
                        <span className="ml-3 flex-1 flex items-center justify-between">
                          {item.name}
                          {(item.badge ?? 0) > 0 && (
                            <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                              {item.badge}
                            </span>
                          )}
                        </span>
                      )}
                      {sidebarCollapsed && (item.badge ?? 0) > 0 && (
                        <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {/* Conference sections */}
            {conferencesWithCfps.length > 0 && (
              <div className={`mt-4 ${sidebarCollapsed ? '' : 'pt-3 border-t border-gray-700'}`}>
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
                          <p
                            className="px-3 text-xs font-medium text-gray-400 truncate mb-1"
                            title={conf.name}
                          >
                            {conf.name}
                          </p>
                        )}
                        <Link
                          to={infoHref}
                          title={sidebarCollapsed ? `${conf.name} — Info` : undefined}
                          className={`flex items-center py-1.5 text-sm font-medium rounded-md ${
                            sidebarCollapsed ? 'justify-center px-2' : 'px-3 pl-6'
                          } ${
                            infoActive
                              ? 'bg-gray-800 text-white'
                              : 'text-gray-300 hover:bg-gray-700 hover:text-white'
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
      <div className={`transition-all duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white shadow">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div />
            <div className="flex items-center gap-4">
              <Link
                to={`${basePath}/messages`}
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title={unreadCount > 0 ? `${unreadCount} unread message(s)` : 'Messages'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              <div className="text-sm">
                <p className="font-medium text-gray-900">
                  {`${applicant.first_name} ${applicant.last_name}`.trim()}
                </p>
                <p className="text-gray-500 text-xs">{applicant.email}</p>
              </div>
              <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">
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
