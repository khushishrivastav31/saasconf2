import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../config/api";
import { parseApiError } from "../utils/apiError";
import { useIsTenantAdmin } from "../hooks/useIsAdmin";
import CreateConferenceModal from "../components/CreateConferenceModal";
import ConferenceLogo from "../components/ConferenceLogo";
import type {
  Conference,
  ConferenceCreate,
  ConferenceStats,
  PaginatedResponse,
} from "../types";

export default function Conferences() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isTenantAdmin = useIsTenantAdmin();

  const { data, isLoading } = useQuery({
    queryKey: ["conferences", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      const response = await api.get<PaginatedResponse<Conference>>(
        `/conferences?${params}`,
      );
      return response.data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["conference-stats"],
    queryFn: async () => {
      const response = await api.get<ConferenceStats>("/conferences/stats");
      return response.data;
    },
  });

  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: ConferenceCreate) => {
      const response = await api.post<Conference>("/conferences", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conferences"] });
      queryClient.invalidateQueries({ queryKey: ["conference-stats"] });
      setCreateError(null);
      setIsCreateModalOpen(false);
    },
    onError: (error: unknown) => {
      setCreateError(parseApiError(error, "Failed to create conference"));
    },
  });

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

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conferences</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your conferences and events
          </p>
        </div>
        {isTenantAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg
              className="w-4 h-4 mr-2"
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
            Create Conference
          </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Total</div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.total}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Upcoming</div>
            <div className="text-2xl font-bold text-blue-600">
              {stats.upcoming}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Ongoing</div>
            <div className="text-2xl font-bold text-green-600">
              {stats.ongoing}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Past</div>
            <div className="text-2xl font-bold text-gray-600">{stats.past}</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
        >
          <option value="">All Conferences</option>
          <option value="upcoming">Upcoming</option>
          <option value="ongoing">Ongoing</option>
          <option value="past">Past</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((conference) => (
            <div
              key={conference.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/modules/conferences/${conference.id}`)}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-start gap-3">
                    {conference.logo_url && (
                      <div className="w-12 h-12 flex-shrink-0 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                        <ConferenceLogo
                          logoUrl={conference.logo_url}
                          className="max-w-full max-h-full object-contain"
                          showPlaceholder={false}
                        />
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {conference.name}
                      </h3>
                      {conference.abbreviation && (
                        <p className="text-sm text-gray-500">
                          {conference.abbreviation}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(conference.status)}`}
                  >
                    {conference.status}
                  </span>
                </div>

                {conference.start_date && (
                  <div className="flex items-center text-sm text-gray-600 mb-2">
                    <svg
                      className="w-4 h-4 mr-2"
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
                    {new Date(conference.start_date).toLocaleDateString()}
                    {conference.end_date &&
                      conference.end_date !== conference.start_date && (
                        <>
                          {" "}
                          - {new Date(conference.end_date).toLocaleDateString()}
                        </>
                      )}
                  </div>
                )}

                {(conference.city || conference.country) && (
                  <div className="flex items-center text-sm text-gray-600 mb-2">
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {[conference.city, conference.country]
                      .filter(Boolean)
                      .join(", ")}
                    {conference.venue_type !== "onsite" && (
                      <span className="ml-2 text-blue-600">
                        ({conference.venue_type === "hybrid" ? "Hybrid" : "Virtual"})
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center text-sm text-gray-500 mt-4">
                  <svg
                    className="w-4 h-4 mr-1"
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
                  {conference.team_count} team members
                  {conference.managers_count > 0 && (
                    <span className="ml-2">
                      ({conference.managers_count} managers)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-3">
                  {conference.is_published ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      Published
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      Draft
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No conferences
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first conference.
          </p>
          {isTenantAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              Create Conference
            </button>
          )}
        </div>
      )}

      {/* Create Modal */}
      <CreateConferenceModal
        open={isCreateModalOpen}
        onClose={() => {
          setCreateError(null);
          setIsCreateModalOpen(false);
        }}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        error={createError}
      />
    </div>
  );
}
