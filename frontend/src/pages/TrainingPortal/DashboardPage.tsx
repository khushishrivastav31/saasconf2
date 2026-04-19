import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { portalApi, getPortalTenantSlug } from '../../config/portalApi';

interface TrainingRegistration {
  id: number;
  training_name: string;
  training_date: string | null;
  location: string | null;
  trainers: string[];
  status: string;
}

const statusColors: Record<string, string> = {
  registered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  waitlisted: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

function getStatusClasses(status: string): string {
  return statusColors[status.toLowerCase()] || statusColors.pending;
}

const DashboardPage = React.memo(function DashboardPage() {
  const navigate = useNavigate();
  const tenantSlug = getPortalTenantSlug();

  const {
    data: registrations,
    isLoading,
    error,
  } = useQuery<TrainingRegistration[]>({
    queryKey: ['portal-my-trainings'],
    queryFn: async () => {
      const response = await portalApi.get('/portal/unified/my-trainings');
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-500 dark:text-gray-400">Loading your trainings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Failed to load training registrations. Please try again later.
        </div>
      </div>
    );
  }

  if (!registrations || registrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <svg
          className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          No training registrations found
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You have not been registered for any trainings yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">My Trainings</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {registrations.map((reg) => (
          <button
            key={reg.id}
            onClick={() => navigate(`/${tenantSlug}/portal/trainings/${reg.id}`)}
            className="w-full rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
            aria-label={`View details for ${reg.training_name}`}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {reg.training_name}
              </h3>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusClasses(reg.status)}`}
              >
                {reg.status}
              </span>
            </div>

            {reg.training_date && (
              <p className="text-sm text-gray-600 dark:text-gray-300">{reg.training_date}</p>
            )}

            {reg.location && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{reg.location}</p>
            )}

            {reg.trainers && reg.trainers.length > 0 && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium">Trainers:</span> {reg.trainers.join(', ')}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

export default DashboardPage;
