import { Link, Outlet, useLocation } from "react-router-dom";

const cfpTabs = [
  { name: "All CFPs", href: "/modules/cfp" },
  { name: "Topics", href: "/modules/cfp/topics" },
  { name: "Program Committee", href: "/modules/cfp/program-committee" },
  { name: "Applicants", href: "/modules/cfp/applicants" },
  { name: "Papers", href: "/modules/cfp/papers" },
  { name: "Assignments", href: "/modules/cfp/assignments" },
  { name: "Evaluated Papers", href: "/modules/cfp/evaluated-papers" },
  { name: "Accepted Papers", href: "/modules/cfp/accepted-papers" },
  { name: "Rejected Papers", href: "/modules/cfp/rejected-papers" },
];

export default function CFPLayout() {
  const location = useLocation();

  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {cfpTabs.map((tab) => {
            const isActive = location.pathname === tab.href;
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                  isActive
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
