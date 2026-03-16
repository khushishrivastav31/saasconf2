import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../config/api';
import { parseApiError } from '../utils/apiError';
import { formatDate } from '../utils/formatDate';
import { useAuth } from '../hooks/useAuth';
import { useIsTenantAdmin } from '../hooks/useIsAdmin';
import CreateConferenceModal from '../components/CreateConferenceModal';
import DuplicateConferenceModal from '../components/modals/DuplicateConferenceModal';
import ConferenceLogo from '../components/ConferenceLogo';
import Modal from '../components/Modal';
import type { Conference, ConferenceCreate, ConferenceStats, PaginatedResponse } from '../types';
import type { DeletePreview } from './ConferenceDetail/useConferenceDetail';

export default function Conferences() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTenantAdmin = useIsTenantAdmin();
  const canDelete = user?.role === 'super_admin' || user?.is_tenant_super_user;

  // Duplicate state
  const [duplicateTarget, setDuplicateTarget] = useState<Conference | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const duplicateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name: string; abbreviation: string; start_date?: string };
    }) => {
      const response = await api.post<Conference>(`/conferences/${id}/duplicate`, data);
      return response.data;
    },
    onSuccess: (newConference) => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      queryClient.invalidateQueries({ queryKey: ['conference-stats'] });
      setDuplicateError(null);
      setDuplicateTarget(null);
      navigate(`/modules/conferences/${newConference.id}`);
    },
    onError: (error: unknown) => {
      setDuplicateError(parseApiError(error, 'Failed to duplicate conference'));
    },
  });

  // Delete state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteClick = async (e: React.MouseEvent, conferenceId: string) => {
    e.stopPropagation();
    try {
      setDeleteTargetId(conferenceId);
      setDeleteLoading(true);
      setDeleteError(null);
      const response = await api.get<DeletePreview>(`/conferences/${conferenceId}/delete-preview`);
      setDeletePreview(response.data);
      setShowDeleteConfirm(true);
    } catch {
      setDeleteError('Failed to load deletion preview');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      // Deactivate first if conference is still active
      if (deletePreview?.must_deactivate_first) {
        await api.put(`/conferences/${deleteTargetId}`, { is_active: false });
      }
      await api.delete(`/conferences/${deleteTargetId}`);
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      queryClient.invalidateQueries({ queryKey: ['conference-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-volunteers'] });
      queryClient.invalidateQueries({ queryKey: ['all-locations'] });
      queryClient.invalidateQueries({ queryKey: ['all-cfps'] });
      setShowDeleteConfirm(false);
      setDeletePreview(null);
      setDeleteTargetId(null);
    } catch (error: unknown) {
      setDeleteError(parseApiError(error, 'Failed to delete conference'));
      setDeleteLoading(false);
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteConfirm(false);
    setDeletePreview(null);
    setDeleteError(null);
    setDeleteTargetId(null);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['conferences', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const response = await api.get<PaginatedResponse<Conference>>(`/conferences?${params}`);
      return response.data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['conference-stats'],
    queryFn: async () => {
      const response = await api.get<ConferenceStats>('/conferences/stats');
      return response.data;
    },
  });

  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: ConferenceCreate) => {
      const response = await api.post<Conference>('/conferences', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      queryClient.invalidateQueries({ queryKey: ['conference-stats'] });
      setCreateError(null);
      setIsCreateModalOpen(false);
    },
    onError: (error: unknown) => {
      setCreateError(parseApiError(error, 'Failed to create conference'));
    },
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-100 text-blue-800';
      case 'ongoing':
        return 'bg-green-100 text-green-800';
      case 'past':
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:text-yellow-300';
    }
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Conferences</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your conferences and events
          </p>
        </div>
        {isTenantAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Upcoming</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.upcoming}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Ongoing</div>
            <div className="text-2xl font-bold text-green-600">{stats.ongoing}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Past</div>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">{stats.past}</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
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
              className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer flex flex-col"
              onClick={() => navigate(`/modules/conferences/${conference.id}`)}
            >
              <div className="p-6 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-start gap-3">
                    {conference.logo_url && (
                      <div className="w-12 h-12 flex-shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                        <ConferenceLogo
                          logoUrl={conference.logo_url}
                          className="max-w-full max-h-full object-contain"
                          showPlaceholder={false}
                        />
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {conference.name}
                      </h3>
                      {conference.abbreviation && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
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
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-300 mb-2">
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
                    {formatDate(conference.start_date)}
                    {conference.end_date && conference.end_date !== conference.start_date && (
                      <> - {formatDate(conference.end_date)}</>
                    )}
                  </div>
                )}

                {(conference.city || conference.country) && (
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-300 mb-2">
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
                    {[conference.city, conference.country].filter(Boolean).join(', ')}
                    {conference.venue_type !== 'onsite' && (
                      <span className="ml-2 text-blue-600 dark:text-blue-400">
                        ({conference.venue_type === 'hybrid' ? 'Hybrid' : 'Virtual'})
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mt-4">
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
                    <span className="ml-2">({conference.managers_count} managers)</span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-auto pt-3">
                  <div className="flex items-center gap-2">
                    {conference.is_published ? (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                        Published
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                        Draft
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isTenantAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDuplicateTarget(conference);
                        }}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/30"
                        title="Duplicate conference"
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
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={(e) => handleDeleteClick(e, conference.id)}
                        disabled={deleteLoading && deleteTargetId === conference.id}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                        title="Delete conference"
                      >
                        {deleteLoading && deleteTargetId === conference.id ? (
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                        ) : (
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
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
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
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            No conferences
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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

      {/* Duplicate Modal */}
      <DuplicateConferenceModal
        open={!!duplicateTarget}
        onClose={() => {
          setDuplicateError(null);
          setDuplicateTarget(null);
        }}
        onSubmit={(data) => {
          if (duplicateTarget) {
            duplicateMutation.mutate({ id: duplicateTarget.id, data });
          }
        }}
        isLoading={duplicateMutation.isPending}
        error={duplicateError}
        sourceName={duplicateTarget?.name ?? ''}
        sourceAbbreviation={duplicateTarget?.abbreviation ?? ''}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteConfirm && !!deletePreview}
        onClose={closeDeleteModal}
        title="Delete Conference"
        size="max-w-md"
      >
        {deletePreview && (
          <div className="p-6">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete <strong>{deletePreview.conference_name}</strong>? This
              action cannot be undone.
            </p>

            {(deletePreview.volunteers.will_delete > 0 ||
              deletePreview.locations.will_delete > 0 ||
              deletePreview.cfps.will_delete > 0 ||
              deletePreview.sponsors.count > 0 ||
              deletePreview.invoices.count > 0 ||
              deletePreview.papers.count > 0 ||
              deletePreview.applicants.orphaned_count > 0) && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm">
                <p className="font-medium text-red-800 dark:text-red-200 mb-2">
                  The following will be permanently deleted:
                </p>
                <ul className="space-y-1 text-red-700 dark:text-red-300">
                  {deletePreview.volunteers.will_delete > 0 && (
                    <li>
                      {deletePreview.volunteers.will_delete} volunteer
                      {deletePreview.volunteers.will_delete !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.locations.will_delete > 0 && (
                    <li>
                      {deletePreview.locations.will_delete} location
                      {deletePreview.locations.will_delete !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.cfps.will_delete > 0 && (
                    <li>
                      {deletePreview.cfps.will_delete} call for paper
                      {deletePreview.cfps.will_delete !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.papers.count > 0 && (
                    <li>
                      {deletePreview.papers.count} paper
                      {deletePreview.papers.count !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.applicants.orphaned_count > 0 && (
                    <li>
                      {deletePreview.applicants.orphaned_count} applicant
                      {deletePreview.applicants.orphaned_count !== 1 ? 's' : ''}{' '}
                      <span className="text-red-600">(only have papers in this conference)</span>
                    </li>
                  )}
                  {deletePreview.sponsors.count > 0 && (
                    <li>
                      {deletePreview.sponsors.count} sponsor
                      {deletePreview.sponsors.count !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.invoices.count > 0 && (
                    <li>
                      {deletePreview.invoices.count} invoice
                      {deletePreview.invoices.count !== 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {(deletePreview.volunteers.will_unlink > 0 ||
              deletePreview.locations.will_unlink > 0 ||
              deletePreview.cfps.will_unlink > 0) && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-amber-900/30 border border-yellow-200 dark:border-yellow-800 rounded-md text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                  The following will be unlinked (shared with other conferences):
                </p>
                <ul className="space-y-1 text-yellow-700 dark:text-yellow-300">
                  {deletePreview.volunteers.will_unlink > 0 && (
                    <li>
                      {deletePreview.volunteers.will_unlink} volunteer
                      {deletePreview.volunteers.will_unlink !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.locations.will_unlink > 0 && (
                    <li>
                      {deletePreview.locations.will_unlink} location
                      {deletePreview.locations.will_unlink !== 1 ? 's' : ''}
                    </li>
                  )}
                  {deletePreview.cfps.will_unlink > 0 && (
                    <li>
                      {deletePreview.cfps.will_unlink} call for paper
                      {deletePreview.cfps.will_unlink !== 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {deletePreview.must_deactivate_first && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-700 dark:text-amber-300">
                This conference is still active. It will be deactivated automatically before
                deletion.
              </div>
            )}

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeDeleteModal}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading
                  ? 'Deleting...'
                  : deletePreview?.must_deactivate_first
                    ? 'Deactivate & Delete'
                    : 'Delete Conference'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
