import { memo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { useSaveStatus } from '../../../hooks/useSaveStatus';
import { useAuthMedia } from '../../../hooks/useAuthMedia';
import { DeleteIcon } from '../../ConferenceDetail/icons';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import type { CommitteeMember, CFPTopic, Applicant, CFPCommitteeRole } from '../../../types';
import { parseApiError } from '../../../utils/apiError';
import ConfirmDialog from '../../../components/ConfirmDialog';

interface MemberListResponse {
  items: CommitteeMember[];
  total: number;
}

interface ApplicantListResponse {
  items: Applicant[];
  total: number;
}

interface MemberFormData {
  applicant_id: string | null;
  role: string;
  topic_ids: string[];
}

const emptyForm: MemberFormData = {
  applicant_id: null,
  role: '',
  topic_ids: [],
};

function getInitials(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((p) => p?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Row in the all-members list view
// ---------------------------------------------------------------------------

const MemberListRow = memo(function MemberListRow({
  member,
  onClick,
}: {
  member: CommitteeMember;
  onClick: () => void;
}) {
  const imgSrc = useAuthMedia(member.picture_url);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left border-b border-gray-100 dark:border-gray-700 last:border-b-0"
    >
      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={`${member.first_name} ${member.last_name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-50">
            <span className="text-sm font-semibold text-primary-300">
              {getInitials(member.first_name, member.last_name)}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {member.first_name} {member.last_name}
          </p>
          {member.role && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {member.role}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
        {member.topics && member.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {member.topics.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-900/30 text-red-600"
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {member.company && (
        <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
          {member.company}
        </span>
      )}
      <svg
        className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Read-only user info card (shown when editing a member)
// ---------------------------------------------------------------------------

function ReadOnlyUserInfo({ member }: { member: CommitteeMember }) {
  const imgSrc = useAuthMedia(member.picture_url);

  return (
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={`${member.first_name} ${member.last_name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary-50">
              <span className="text-sm font-semibold text-primary-300">
                {getInitials(member.first_name, member.last_name)}
              </span>
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {member.first_name} {member.last_name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
        </div>
        {member.company && (
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{member.company}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline form for creating or editing a member
// ---------------------------------------------------------------------------

function MemberForm({
  member,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  isDeleting,
  error,
  conferenceId,
}: {
  member: CommitteeMember | null; // null = creating
  onSave: (data: MemberFormData) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  isDeleting?: boolean;
  error: string | null;
  conferenceId?: string;
}) {
  const isEditing = !!member;

  const { saveStatus, setSaving, setSaved, setError: setSaveError } = useSaveStatus();

  const [formData, setFormData] = useState<MemberFormData>(
    member
      ? {
          applicant_id: member.applicant_id,
          role: member.role,
          topic_ids: member.topics?.map((t) => t.id) || [],
        }
      : emptyForm
  );
  const [applicantSearch, setApplicantSearch] = useState('');

  // Fetch available committee roles from settings
  const { data: rolesData } = useQuery({
    queryKey: ['committee-roles', conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: CFPCommitteeRole[]; total: number }>(
        `/conferences/${conferenceId}/settings/committee-roles`
      );
      return response.data;
    },
    enabled: !!conferenceId,
  });
  const availableRoles = rolesData?.items?.filter((r) => r.is_active) ?? [];

  // Fetch available topics
  const { data: topicsData } = useQuery({
    queryKey: ['cfp-topics'],
    queryFn: async () => {
      const response = await api.get<{ items: CFPTopic[]; total: number }>('/cfp/topics');
      return response.data;
    },
  });
  const allTopics = topicsData?.items || [];

  // Fetch applicants for linking (only when creating in "link" mode)
  const { data: applicantsData } = useQuery({
    queryKey: ['cfp-applicants-for-committee'],
    queryFn: async () => {
      const response = await api.get<ApplicantListResponse>('/cfp/applicants?page_size=500');
      return response.data;
    },
    enabled: !isEditing,
  });
  const allApplicants = applicantsData?.items || [];

  // Filter applicants by search
  const filteredApplicants = applicantSearch.trim()
    ? allApplicants.filter(
        (a) =>
          `${a.first_name} ${a.last_name}`.toLowerCase().includes(applicantSearch.toLowerCase()) ||
          a.email.toLowerCase().includes(applicantSearch.toLowerCase())
      )
    : allApplicants;

  // Reset form when the member changes
  useEffect(() => {
    setFormData(
      member
        ? {
            applicant_id: member.applicant_id,
            role: member.role,
            topic_ids: member.topics?.map((t) => t.id) || [],
          }
        : emptyForm
    );
    setApplicantSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  // Track save status based on isSaving prop changes
  useEffect(() => {
    if (isSaving) {
      setSaving();
    }
  }, [isSaving, setSaving]);

  // When saving completes (isSaving goes from true to false), update status
  useEffect(() => {
    if (saveStatus === 'saving' && !isSaving) {
      if (error) {
        setSaveError();
      } else {
        setSaved();
      }
    }
  }, [isSaving, error, saveStatus, setSaveError, setSaved]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEditing && !formData.applicant_id) return;

    setSaving();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <ErrorBanner message={error} />

      {/* Select existing user */}
      {!isEditing && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Select User <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={applicantSearch}
            onChange={(e) => setApplicantSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 mb-2"
          />
          <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto">
            {filteredApplicants.length > 0 ? (
              filteredApplicants.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    setFormData((d) => ({
                      ...d,
                      applicant_id: d.applicant_id === a.id ? null : a.id,
                    }))
                  }
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                    formData.applicant_id === a.id
                      ? 'bg-primary-50 text-primary-900'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
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
                  {formData.applicant_id === a.id && (
                    <svg
                      className="w-5 h-5 text-primary-600 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                {applicantSearch ? 'No users match your search.' : 'No users available.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* When editing: show user info as read-only */}
      {isEditing && member && <ReadOnlyUserInfo member={member} />}

      {/* Role */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Role
        </label>
        <select
          value={formData.role}
          onChange={(e) => setFormData((d) => ({ ...d, role: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Select a role…</option>
          {availableRoles.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
        {availableRoles.some((r) => r.description) && (
          <>
            <dl className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              {availableRoles
                .filter((r) => r.description)
                .map((r) => (
                  <div key={r.id} className="flex gap-1.5">
                    <dt className="font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {r.name}
                    </dt>
                    <dd>{r.description}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-1.5 text-xs italic text-gray-400 dark:text-gray-500">
              Roles are labels for organization and messaging; they don&apos;t change a
              member&apos;s access.
            </p>
          </>
        )}
      </div>

      {/* Topics */}
      {allTopics.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Excluded Topics
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Select topics this member cannot review
          </p>
          <div className="flex flex-wrap gap-2">
            {allTopics.map((topic) => {
              const checked = formData.topic_ids.includes(topic.id);
              return (
                <label
                  key={topic.id}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors border ${
                    checked
                      ? 'bg-red-50 dark:bg-red-900/30 border-red-300 text-red-700 dark:text-red-300'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setFormData((d) => ({
                        ...d,
                        topic_ids: checked
                          ? d.topic_ids.filter((id) => id !== topic.id)
                          : [...d.topic_ids, topic.id],
                      }));
                    }}
                    className="sr-only"
                  />
                  {topic.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
        <div>
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <DeleteIcon />
              {isDeleting ? 'Removing...' : 'Remove from Committee'}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-all duration-300 inline-flex items-center gap-2 ${
              saveStatus === 'saved'
                ? 'bg-green-600 hover:bg-green-700'
                : saveStatus === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {saveStatus === 'saving' && (
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {saveStatus === 'saved' && (
              <svg
                className="h-4 w-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved!'
                : isEditing
                  ? 'Save Changes'
                  : 'Add to Committee'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CFPProgramCommittee({
  selectedMemberId: externalSelectedId,
  setSelectedMemberId: externalSetSelectedId,
  conferenceId,
  isAdmin: isAdminProp,
}: {
  selectedMemberId?: string | null;
  setSelectedMemberId?: (id: string | null) => void;
  conferenceId?: string;
  isAdmin?: boolean;
} = {}) {
  const isAdminFallback = useIsAdmin();
  const isAdmin = isAdminProp ?? isAdminFallback;
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedMemberId = externalSelectedId ?? internalSelectedId;
  const setSelectedMemberId = externalSetSelectedId ?? setInternalSelectedId;

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommitteeMember | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['cfp-committee-members', conferenceId ?? 'all'],
    queryFn: async () => {
      const params = conferenceId ? { conference_id: conferenceId } : {};
      const response = await api.get<MemberListResponse>('/cfp/committee-members', { params });
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: MemberFormData) => {
      const payload: Record<string, unknown> = {
        conference_id: conferenceId,
        applicant_id: data.applicant_id,
        role: data.role,
        topic_ids: data.topic_ids,
      };
      const response = await api.post<CommitteeMember>('/cfp/committee-members', payload);
      return response.data;
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create committee member'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MemberFormData }) => {
      const payload: Record<string, unknown> = {
        role: data.role,
        topic_ids: data.topic_ids,
      };
      const response = await api.put<CommitteeMember>(`/cfp/committee-members/${id}`, payload);
      return response.data;
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update committee member'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cfp/committee-members/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      setSelectedMemberId(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-committee-members'] });
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to remove committee member'));
      setDeleteTarget(null);
    },
  });

  const handleCreate = async (formData: MemberFormData) => {
    try {
      const member = await createMutation.mutateAsync(formData);
      setError(null);
      setIsAdding(false);
      queryClient.invalidateQueries({ queryKey: ['cfp-committee-members'] });
      setSelectedMemberId(member.id);
    } catch {
      // error is handled by onError
    }
  };

  const handleUpdate = async (formData: MemberFormData) => {
    if (!selectedMemberId) return;
    try {
      await updateMutation.mutateAsync({ id: selectedMemberId, data: formData });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-committee-members'] });
    } catch {
      // error is handled by onError
    }
  };

  const members = data?.items || [];
  const selectedMember = members.find((m) => m.id === selectedMemberId);
  const memberCount = members.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {(isAdding || selectedMember) && (
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setSelectedMemberId(null);
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
              {isAdding
                ? 'Add Committee Member'
                : selectedMember
                  ? `${selectedMember.first_name} ${selectedMember.last_name}`
                  : 'Program Committee'}
              {!isAdding && !selectedMember && memberCount > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  {memberCount}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isAdding
                ? 'Select an existing user to add to the committee.'
                : selectedMember
                  ? 'Edit committee role and topics.'
                  : 'Manage program committee members.'}
            </p>
          </div>
        </div>
        {isAdmin && !isAdding && !selectedMember && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setSelectedMemberId(null);
              setError(null);
            }}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
          >
            + Add Member
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isAdding && isAdmin ? (
        <MemberForm
          member={null}
          onSave={handleCreate}
          onCancel={() => {
            setIsAdding(false);
            setError(null);
          }}
          isSaving={createMutation.isPending}
          error={error}
          conferenceId={conferenceId}
        />
      ) : selectedMember ? (
        <MemberForm
          member={selectedMember}
          onSave={isAdmin ? handleUpdate : () => {}}
          onCancel={() => {
            setSelectedMemberId(null);
            setError(null);
          }}
          onDelete={isAdmin ? () => setDeleteTarget(selectedMember) : undefined}
          isSaving={updateMutation.isPending}
          isDeleting={deleteMutation.isPending}
          error={error}
          conferenceId={conferenceId}
        />
      ) : members.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {members.map((m) => (
            <MemberListRow key={m.id} member={m} onClick={() => setSelectedMemberId(m.id)} />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          No committee members yet. Click "+ Add Member" to get started.
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Committee Member"
        message={`Are you sure you want to remove "${deleteTarget?.first_name} ${deleteTarget?.last_name}" from the program committee? The user account will not be deleted.`}
        confirmLabel="Remove"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
