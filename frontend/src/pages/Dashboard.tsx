import { useAuth } from "../hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();

  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || user?.email}
        </p>
      </div>

      {isSuperAdmin ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <DashboardCard
            title="Companies"
            description="Manage tenant companies"
            href="/admin/tenants"
            icon={
              <svg
                className="w-8 h-8 text-primary-600"
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
            }
          />
          <DashboardCard
            title="Modules"
            description="Manage platform modules"
            href="/admin/modules"
            icon={
              <svg
                className="w-8 h-8 text-primary-600"
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
            }
          />
          <DashboardCard
            title="Audit Logs"
            description="View system activity"
            href="/admin/audit-logs"
            icon={
              <svg
                className="w-8 h-8 text-primary-600"
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
            }
          />
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Your Modules
          </h2>
          {user?.modules && user.modules.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {user.modules.map((module) => (
                <div
                  key={module}
                  className="bg-white overflow-hidden shadow rounded-lg p-6"
                >
                  <h3 className="text-lg font-medium text-gray-900 capitalize">
                    {module.replace("_", " ")}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">Module available</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white overflow-hidden shadow rounded-lg p-6">
              <p className="text-gray-500">
                No modules assigned to your account yet.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
    >
      <div className="p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">{icon}</div>
          <div className="ml-4">
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>
    </a>
  );
}
