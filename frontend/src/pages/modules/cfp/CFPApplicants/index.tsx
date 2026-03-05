import { memo, useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { useIsAdmin } from '../../../../hooks/useIsAdmin';
import { useAuthMedia } from '../../../../hooks/useAuthMedia';
import type { Applicant, Conference, PaginatedResponse } from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';
import AlertDialog from '../../../../components/AlertDialog';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';
import { ChevronLeftIcon, CloseIcon } from '../../../ConferenceDetail/icons';
import { ApplicantForm } from './ApplicantForm';
import { ApplicantPapers } from './ApplicantPapers';
import type { ApplicantFormData } from './ApplicantForm';

interface ApplicantListResponse {
  items: Applicant[];
  total: number;
}

function getInitials(firstName: string, lastName: string): string {
  const first = firstName?.[0] || '';
  const last = lastName?.[0] || '';
  return (first + last).toUpperCase() || '?';
}

// ---------------------------------------------------------------------------
// Row in the all-applicants list view
// ---------------------------------------------------------------------------

const ApplicantListRow = memo(function ApplicantListRow({
  applicant,
  onClick,
}: {
  applicant: Applicant;
  onClick: () => void;
}) {
  const imgSrc = useAuthMedia(applicant.picture_url);

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
            alt={`${applicant.first_name} ${applicant.last_name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-50">
            <span className="text-sm font-semibold text-primary-300">
              {getInitials(applicant.first_name, applicant.last_name)}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {`${applicant.first_name} ${applicant.last_name}`}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{applicant.email}</p>
        {applicant.company && (
          <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
            {applicant.company}
          </span>
        )}
      </div>
      {applicant.title && (
        <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
          {applicant.title}
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
// Main component
// ---------------------------------------------------------------------------

export default function CFPApplicants({
  selectedApplicantId: externalSelectedId,
  setSelectedApplicantId: externalSetSelectedId,
  conferenceId,
  isAdmin: isAdminProp,
}: {
  selectedApplicantId?: string | null;
  setSelectedApplicantId?: (id: string | null) => void;
  conferenceId?: string;
  isAdmin?: boolean;
} = {}) {
  const isAdminFallback = useIsAdmin();
  const isAdmin = isAdminProp ?? isAdminFallback;
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedApplicantId = externalSelectedId ?? internalSelectedId;
  const setSelectedApplicantId = externalSetSelectedId ?? setInternalSelectedId;

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Applicant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Conference filter — only used when no conferenceId prop is passed (standalone view)
  const isStandalone = !conferenceId;
  const [filterConferenceId, setFilterConferenceId] = useState<string>('');

  const { data: conferencesData } = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Conference>>('/conferences');
      return response.data;
    },
    enabled: isStandalone,
  });

  const effectiveConferenceId = conferenceId || filterConferenceId || undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['cfp-applicants', effectiveConferenceId ?? 'all'],
    queryFn: async () => {
      const params = effectiveConferenceId ? { conference_id: effectiveConferenceId } : {};
      const response = await api.get<ApplicantListResponse>('/cfp/applicants', { params });
      return response.data;
    },
  });

  const uploadPicture = useCallback(
    async (applicantId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('entity_type', 'applicant_picture');
      form.append('entity_id', applicantId);
      form.append('description', 'Profile picture');
      await api.post('/attachments', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
    },
    [queryClient]
  );

  const uploadVideo = useCallback(
    async (applicantId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('entity_type', 'applicant_video');
      form.append('entity_id', applicantId);
      form.append('description', 'Introduction video');
      await api.post('/attachments', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
    },
    [queryClient]
  );

  const createMutation = useMutation({
    mutationFn: async (data: ApplicantFormData) => {
      const payload: Record<string, unknown> = {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        password: data.password,
        allow_out_of_timeframe: data.allow_out_of_timeframe,
        needs_accessibility: data.needs_accessibility,
        agrees_to_recording: data.agrees_to_recording,
      };
      if (data.pronouns.trim()) payload.pronouns = data.pronouns.trim();
      if (data.phone.trim()) payload.phone = data.phone.trim();
      if (data.title.trim()) payload.title = data.title.trim();
      if (data.company.trim()) payload.company = data.company.trim();
      if (data.bio.trim()) payload.bio = data.bio.trim();
      if (data.needs_accessibility && data.accessibility_details.trim()) {
        payload.accessibility_details = data.accessibility_details.trim();
      }
      // Filter out empty social links
      const socialLinks: Record<string, string> = {};
      Object.entries(data.social_links).forEach(([key, value]) => {
        if (value && value.trim()) {
          socialLinks[key] = value.trim();
        }
      });
      if (Object.keys(socialLinks).length > 0) {
        payload.social_links = socialLinks;
      }
      const response = await api.post<Applicant>('/cfp/applicants', payload);
      return response.data;
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to create applicant'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ApplicantFormData }) => {
      const payload: Record<string, unknown> = {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        allow_out_of_timeframe: data.allow_out_of_timeframe,
        needs_accessibility: data.needs_accessibility,
        agrees_to_recording: data.agrees_to_recording,
      };
      payload.pronouns = data.pronouns.trim() || null;
      payload.phone = data.phone.trim() || '';
      payload.title = data.title.trim() || '';
      payload.company = data.company.trim() || '';
      payload.bio = data.bio.trim() || '';
      payload.accessibility_details = data.needs_accessibility
        ? data.accessibility_details.trim()
        : '';
      if (data.password.trim()) payload.password = data.password.trim();
      // Filter out empty social links
      const socialLinks: Record<string, string> = {};
      Object.entries(data.social_links).forEach(([key, value]) => {
        if (value && value.trim()) {
          socialLinks[key] = value.trim();
        }
      });
      payload.social_links = socialLinks;
      const response = await api.put<Applicant>(`/cfp/applicants/${id}`, payload);
      return response.data;
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, 'Failed to update applicant'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cfp/applicants/${id}`);
    },
    onSuccess: () => {
      setError(null);
      setDeleteTarget(null);
      setSelectedApplicantId(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
    },
    onError: (err: unknown) => {
      setDeleteError(parseApiError(err, 'Failed to delete applicant'));
      setDeleteTarget(null);
    },
  });

  const handleCreate = async (
    formData: ApplicantFormData,
    pictureFile: File | null,
    videoFile: File | null
  ) => {
    try {
      const applicant = await createMutation.mutateAsync(formData);
      if (pictureFile) {
        try {
          await uploadPicture(applicant.id, pictureFile);
        } catch {
          // non-fatal
        }
      }
      if (videoFile) {
        try {
          await uploadVideo(applicant.id, videoFile);
        } catch {
          // non-fatal
        }
      }
      setError(null);
      setIsAdding(false);
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
      setSelectedApplicantId(applicant.id);
    } catch {
      // error is handled by onError
    }
  };

  const handleUpdate = async (
    formData: ApplicantFormData,
    pictureFile: File | null,
    videoFile: File | null
  ) => {
    if (!selectedApplicantId) return;
    try {
      const applicant = await updateMutation.mutateAsync({
        id: selectedApplicantId,
        data: formData,
      });
      if (pictureFile) {
        try {
          await uploadPicture(applicant.id, pictureFile);
        } catch {
          // non-fatal
        }
      }
      if (videoFile) {
        try {
          await uploadVideo(applicant.id, videoFile);
        } catch {
          // non-fatal
        }
      }
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['cfp-applicants'] });
    } catch {
      // error is handled by onError
    }
  };

  const applicants = useMemo(() => data?.items || [], [data?.items]);
  const selectedApplicant = applicants.find((a) => a.id === selectedApplicantId);
  const applicantCount = applicants.length;

  // Filter applicants by search query
  const filteredApplicants = useMemo(() => {
    if (!searchQuery.trim()) return applicants;
    const q = searchQuery.toLowerCase();
    return applicants.filter(
      (a) =>
        a.first_name.toLowerCase().includes(q) ||
        a.last_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.title && a.title.toLowerCase().includes(q))
    );
  }, [applicants, searchQuery]);

  return (
    <div>
      {(isAdding || selectedApplicant) && (
        <button
          type="button"
          onClick={() => {
            setSelectedApplicantId(null);
            setIsAdding(false);
            setError(null);
          }}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronLeftIcon />
          Back to users list
        </button>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isAdding
              ? 'New User'
              : selectedApplicant
                ? `${selectedApplicant.first_name} ${selectedApplicant.last_name}`
                : 'Users'}
            {!isAdding && !selectedApplicant && applicantCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {applicantCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isAdding
              ? 'Fill in the details to add a new user.'
              : selectedApplicant
                ? 'Edit the user details below.'
                : 'Manage paper submission users.'}
          </p>
        </div>
        {isAdmin && !isAdding && !selectedApplicant && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setSelectedApplicantId(null);
              setError(null);
            }}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
          >
            + Add User
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isAdding && isAdmin ? (
        <ApplicantForm
          applicant={null}
          onSave={handleCreate}
          onCancel={() => {
            setIsAdding(false);
            setError(null);
          }}
          isSaving={createMutation.isPending}
          error={error}
          conferenceId={effectiveConferenceId}
        />
      ) : selectedApplicant ? (
        <div className="space-y-6">
          <ApplicantForm
            applicant={selectedApplicant}
            onSave={isAdmin ? handleUpdate : () => {}}
            onCancel={() => {
              setSelectedApplicantId(null);
              setError(null);
            }}
            onDelete={isAdmin ? () => setDeleteTarget(selectedApplicant) : undefined}
            isSaving={updateMutation.isPending}
            isDeleting={deleteMutation.isPending}
            error={error}
            conferenceId={effectiveConferenceId}
          />

          {/* Papers */}
          <ApplicantPapers applicantId={selectedApplicant.id} />
        </div>
      ) : applicants.length > 0 || (isStandalone && filterConferenceId) ? (
        <div className="space-y-3">
          {/* Conference filter + Search */}
          <div className="flex gap-2">
            {isStandalone && conferencesData && conferencesData.items.length > 0 && (
              <select
                value={filterConferenceId}
                onChange={(e) => setFilterConferenceId(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100 min-w-[180px]"
              >
                <option value="">All Conferences</option>
                {conferencesData.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, company, or title..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          {filteredApplicants.length > 0 ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {filteredApplicants.map((a) => (
                <ApplicantListRow
                  key={a.id}
                  applicant={a}
                  onClick={() => setSelectedApplicantId(a.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              No users match "{searchQuery}"
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {isStandalone && conferencesData && conferencesData.items.length > 0 && (
            <select
              value={filterConferenceId}
              onChange={(e) => setFilterConferenceId(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100 min-w-[180px]"
            >
              <option value="">All Conferences</option>
              {conferencesData.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            {filterConferenceId
              ? 'No users for this conference.'
              : 'No users yet. Click "+ Add User" to get started.'}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget ? `${deleteTarget.first_name} ${deleteTarget.last_name}` : ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Delete Error Popup */}
      <AlertDialog
        open={!!deleteError}
        title="Cannot Delete User"
        message={deleteError || ''}
        onClose={() => setDeleteError(null)}
      />
    </div>
  );
}
