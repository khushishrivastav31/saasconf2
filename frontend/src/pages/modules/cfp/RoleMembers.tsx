import { memo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { useAuthMedia } from '../../../hooks/useAuthMedia';
import { DeleteIcon } from '../../ConferenceDetail/icons';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { parseApiError } from '../../../utils/apiError';
import { queryKeys } from '../../../config/queryKeys';
import { useToast } from '../../../components/Toast';
import type { UserRole } from '../../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleAssignment {
  id: string;
  applicant_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  picture_url: string | null;
  created_at: string;
}

interface AssignableApplicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AssignmentListResponse {
  items: RoleAssignment[];
  total: number;
}

interface AssignableListResponse {
  items: AssignableApplicant[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((p) => p?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Assignment Row
// ---------------------------------------------------------------------------

const AssignmentRow = memo(function AssignmentRow({
  assignment,
  onRemove,
  isAdmin,
}: {
  assignment: RoleAssignment;
  onRemove: () => void;
  isAdmin: boolean;
}) {
  const imgSrc = useAuthMedia(assignment.picture_url);

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={`${assignment.first_name} ${assignment.last_name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-50">
            <span className="text-xs font-semibold text-primary-300">
              {getInitials(assignment.first_name, assignment.last_name)}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {assignment.first_name} {assignment.last_name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{assignment.email}</p>
      </div>
      {assignment.company && (
        <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
          {assignment.company}
        </span>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
          title="Remove from role"
          aria-label="Remove from role"
        >
          <DeleteIcon />
        </button>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RoleMembers({
  roleName,
  conferenceId,
  isAdmin: isAdminProp,
}: {
  roleName: string;
  conferenceId?: string;
  isAdmin?: boolean;
}) {
  const isAdminFallback = useIsAdmin();
  const isAdmin = isAdminProp ?? isAdminFallback;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleAssignment | null>(null);

  // Step 1: Get the role ID by name
  const { data: rolesData } = useQuery({
    queryKey: ['user-roles', conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: UserRole[] }>(
        `/conferences/${conferenceId}/settings/user-roles`
      );
      return response.data;
    },
    enabled: !!conferenceId,
    staleTime: 60_000,
  });

  const role = rolesData?.items?.find((r) => r.name === roleName);
  const roleId = role?.id;

  // Step 2: Fetch assignments for this role
  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['role-assignments', conferenceId, roleId],
    queryFn: async () => {
      const response = await api.get<AssignmentListResponse>(
        `/conferences/${conferenceId}/settings/user-roles/${roleId}/assignments`
      );
      return response.data;
    },
    enabled: !!conferenceId && !!roleId,
  });

  const assignments = assignmentsData?.items || [];
  const memberCount = assignments.length;

  // Step 3: Fetch assignable applicants (when adding)
  const { data: assignableData } = useQuery({
    queryKey: ['role-assignable', conferenceId, roleId, search],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      const response = await api.get<AssignableListResponse>(
        `/conferences/${conferenceId}/settings/user-roles/${roleId}/assignable-applicants`,
        { params }
      );
      return response.data;
    },
    enabled: !!conferenceId && !!roleId && isAdding,
  });

  const assignableApplicants = assignableData?.items || [];

  // Mutations
  const assignMutation = useMutation({
    mutationFn: async (applicantId: string) => {
      const response = await api.post<RoleAssignment>(
        `/conferences/${conferenceId}/settings/user-roles/${roleId}/assignments`,
        { applicant_id: applicantId }
      );
      return response.data;
    },
    onSuccess: (data) => {
      setError(null);
      showToast(`${data.first_name} ${data.last_name} assigned as ${roleName}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['role-assignments', conferenceId, roleId] });
      queryClient.invalidateQueries({ queryKey: ['role-assignable', conferenceId, roleId] });
      queryClient.invalidateQueries({ queryKey: ['user-roles', conferenceId] });
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
      if (roleName === 'Volunteer' && conferenceId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.volunteers.profiles(conferenceId),
        });
      }
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to assign user'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.delete(
        `/conferences/${conferenceId}/settings/user-roles/${roleId}/assignments/${assignmentId}`
      );
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      showToast(`${roleName} role removed`, 'success');
      queryClient.invalidateQueries({ queryKey: ['role-assignments', conferenceId, roleId] });
      queryClient.invalidateQueries({ queryKey: ['role-assignable', conferenceId, roleId] });
      queryClient.invalidateQueries({ queryKey: ['user-roles', conferenceId] });
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
      if (roleName === 'Volunteer' && conferenceId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.volunteers.profiles(conferenceId),
        });
      }
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to remove user'));
      setDeleteTarget(null);
    },
  });

  const handleAssign = useCallback(
    (applicantId: string) => {
      assignMutation.mutate(applicantId);
    },
    [assignMutation]
  );

  const isLoading = !rolesData || assignmentsLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isAdding && (
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setSearch('');
                setError(null);
              }}
              className="p-1.5 -ml-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Back to list"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isAdding ? `Add ${roleName}` : roleName}
              {!isAdding && memberCount > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  {memberCount}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isAdding
                ? `Select a user to assign the ${roleName} role.`
                : `Manage users with the ${roleName} role.`}
            </p>
          </div>
        </div>
        {isAdmin && !isAdding && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setSearch('');
              setError(null);
            }}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add Member
          </button>
        )}
      </div>

      <ErrorBanner message={error} />

      {isLoading ? (
        <LoadingSpinner />
      ) : isAdding ? (
        /* Add user view */
        <div className="space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-80 overflow-y-auto">
            {assignableApplicants.length > 0 ? (
              assignableApplicants.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleAssign(a.id)}
                  disabled={assignMutation.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                >
                  <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-semibold text-primary-300">
                      {getInitials(a.first_name, a.last_name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {a.first_name} {a.last_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.email}</p>
                  </div>
                  <span className="text-xs text-primary-600 font-medium flex-shrink-0">
                    + Assign
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                {search ? 'No users match your search.' : 'No users available to assign.'}
              </div>
            )}
          </div>
        </div>
      ) : assignments.length > 0 ? (
        /* List view */
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {assignments.map((a) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              onRemove={() => setDeleteTarget(a)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No users assigned to the {roleName} role yet.
          {isAdmin && ' Click "+ Add Member" to get started.'}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Remove ${roleName}`}
        message={`Are you sure you want to remove "${deleteTarget?.first_name} ${deleteTarget?.last_name}" from the ${roleName} role?`}
        confirmLabel="Remove"
        onConfirm={() => deleteTarget && removeMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
