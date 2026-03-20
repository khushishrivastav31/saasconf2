import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { COUNTRY_OPTIONS } from '../../../../config/countries';
import type { Conference } from '../../../../types';
import type {
  RecipientListListResponse,
  RecipientListDetailResponse,
  DynamicRecipientListListResponse,
  DynamicRecipientList,
  RecipientPreviewResponse,
} from '../../../../types/messaging';

interface Props {
  conference: Conference;
  isAdmin: boolean;
}

interface Applicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export default function RecipientListsTab({ conference, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const basePath = `/conferences/${conference.id}/messaging/recipient-lists`;

  const [showModal, setShowModal] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formApplicantIds, setFormApplicantIds] = useState<string[]>([]);
  const [applicantSearch, setApplicantSearch] = useState('');

  // Fetch all lists
  const { data, isLoading } = useQuery<RecipientListListResponse>({
    queryKey: queryKeys.messaging.recipientLists(conference.id),
    queryFn: () => api.get(basePath).then((r) => r.data),
  });

  // Fetch list detail for editing
  const { data: editDetail } = useQuery<RecipientListDetailResponse>({
    queryKey: queryKeys.messaging.recipientListDetail(conference.id, editingListId),
    queryFn: () => api.get(`${basePath}/${editingListId}`).then((r) => r.data),
    enabled: !!editingListId,
  });

  // Fetch all applicants for member selection
  const { data: allApplicants } = useQuery({
    queryKey: queryKeys.cfp.applicantsForMessaging(conference.id),
    queryFn: async () => {
      const resp = await api.get(`/cfp/applicants?conference_id=${conference.id}`);
      return resp.data.items as Applicant[];
    },
    enabled: showModal,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string; applicant_ids: string[] }) =>
      api.post(basePath, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.recipientLists(conference.id),
      });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name: string;
      description: string;
      applicant_ids: string[];
    }) => api.put(`${basePath}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.recipientLists(conference.id),
      });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${basePath}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.recipientLists(conference.id),
      });
      setDeleteConfirm(null);
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingListId(null);
    setFormName('');
    setFormDescription('');
    setFormApplicantIds([]);
    setApplicantSearch('');
  };

  const openCreate = () => {
    setEditingListId(null);
    setFormName('');
    setFormDescription('');
    setFormApplicantIds([]);
    setApplicantSearch('');
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    setEditingListId(id);
    setShowModal(true);
  };

  // Load edit data when detail arrives
  useEffect(() => {
    if (editDetail && editingListId) {
      setFormName(editDetail.name);
      setFormDescription(editDetail.description ?? '');
      setFormApplicantIds(editDetail.members.map((m) => m.id));
    }
  }, [editDetail, editingListId]);

  const handleSave = () => {
    const payload = {
      name: formName,
      description: formDescription,
      applicant_ids: formApplicantIds,
    };
    if (editingListId) {
      updateMutation.mutate({ id: editingListId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const lists = data?.items ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  // --- Dynamic Lists ---
  const dynamicBasePath = `/conferences/${conference.id}/messaging/dynamic-lists`;

  const [showDynamicModal, setShowDynamicModal] = useState(false);
  const [editingDynamicId, setEditingDynamicId] = useState<string | null>(null);
  const [deleteDynamicConfirm, setDeleteDynamicConfirm] = useState<string | null>(null);

  const [dlName, setDlName] = useState('');
  const [dlDescription, setDlDescription] = useState('');
  const [dlTargetType, setDlTargetType] = useState<'registration' | 'sponsor'>('registration');
  const [dlFilters, setDlFilters] = useState<Record<string, unknown>>({});

  const { data: dynamicListsData, isLoading: dynamicLoading } =
    useQuery<DynamicRecipientListListResponse>({
      queryKey: queryKeys.messaging.dynamicLists(conference.id),
      queryFn: () => api.get(dynamicBasePath).then((r) => r.data),
    });

  const dynamicLists = dynamicListsData?.items ?? [];

  // Fetch filter options
  const { data: bookingOptions } = useQuery({
    queryKey: queryKeys.booking.options(conference.id),
    queryFn: () =>
      api.get(`/conferences/${conference.id}/booking/options`).then((r) => r.data?.items ?? r.data),
    enabled: showDynamicModal && dlTargetType === 'registration',
  });

  const { data: bookableSessions } = useQuery({
    queryKey: queryKeys.program.sessions(conference.id),
    queryFn: () =>
      api
        .get(`/conferences/${conference.id}/program/sessions?bookable=true`)
        .then((r) => r.data?.items ?? r.data),
    enabled: showDynamicModal && dlTargetType === 'registration',
  });

  const { data: sponsorPackages } = useQuery({
    queryKey: queryKeys.sponsors.packages(conference.id),
    queryFn: () =>
      api
        .get(`/conferences/${conference.id}/settings/sponsor-packages`)
        .then((r) => r.data?.items ?? r.data),
    enabled: showDynamicModal && dlTargetType === 'sponsor',
  });

  // Live preview count for dynamic list filters
  const previewFilter = useMemo(() => {
    if (!showDynamicModal) return null;
    if (dlTargetType === 'registration') return { all_registrations: true };
    if (dlTargetType === 'sponsor') return { all_sponsors: true };
    return null;
  }, [showDynamicModal, dlTargetType]);

  // For dynamic list preview we use the dedicated preview endpoint
  const { data: dlPreview, isFetching: dlPreviewLoading } = useQuery<RecipientPreviewResponse>({
    queryKey: ['dl-preview', conference.id, dlTargetType, dlFilters],
    queryFn: async () => {
      // If we have an editing dynamic list ID, preview that; otherwise preview via recipient-count
      if (editingDynamicId) {
        return api.get(`${dynamicBasePath}/${editingDynamicId}/preview`).then((r) => r.data);
      }
      // For new lists, use the recipient-count endpoint with the filter
      return api
        .post(`/conferences/${conference.id}/messaging/recipient-count`, previewFilter)
        .then((r) => r.data);
    },
    enabled: showDynamicModal && previewFilter !== null,
    staleTime: 15_000,
  });

  const createDynamicMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description: string;
      target_type: string;
      filters: Record<string, unknown>;
    }) => api.post(dynamicBasePath, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.dynamicLists(conference.id),
      });
      closeDynamicModal();
    },
  });

  const updateDynamicMutation = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name: string;
      description: string;
      filters: Record<string, unknown>;
    }) => api.put(`${dynamicBasePath}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.dynamicLists(conference.id),
      });
      closeDynamicModal();
    },
  });

  const deleteDynamicMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${dynamicBasePath}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.dynamicLists(conference.id),
      });
      setDeleteDynamicConfirm(null);
    },
  });

  const closeDynamicModal = useCallback(() => {
    setShowDynamicModal(false);
    setEditingDynamicId(null);
    setDlName('');
    setDlDescription('');
    setDlTargetType('registration');
    setDlFilters({});
  }, []);

  const openDynamicCreate = () => {
    setEditingDynamicId(null);
    setDlName('');
    setDlDescription('');
    setDlTargetType('registration');
    setDlFilters({});
    setShowDynamicModal(true);
  };

  const openDynamicEdit = (dl: DynamicRecipientList) => {
    setEditingDynamicId(dl.id);
    setDlName(dl.name);
    setDlDescription(dl.description ?? '');
    setDlTargetType(dl.target_type);
    setDlFilters(dl.filters);
    setShowDynamicModal(true);
  };

  const handleDynamicSave = () => {
    if (editingDynamicId) {
      updateDynamicMutation.mutate({
        id: editingDynamicId,
        name: dlName,
        description: dlDescription,
        filters: dlFilters,
      });
    } else {
      createDynamicMutation.mutate({
        name: dlName,
        description: dlDescription,
        target_type: dlTargetType,
        filters: dlFilters,
      });
    }
  };

  const dynamicSaving = createDynamicMutation.isPending || updateDynamicMutation.isPending;

  const updateFilter = (key: string, value: unknown) => {
    setDlFilters((prev) => {
      const next = { ...prev };
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  // Filter applicants for search in modal
  const selectedSet = new Set(formApplicantIds);
  const filteredApplicants = allApplicants?.filter((a) => {
    if (selectedSet.has(a.id)) return false;
    if (!applicantSearch.trim()) return true;
    const q = applicantSearch.toLowerCase();
    return (
      a.first_name.toLowerCase().includes(q) ||
      a.last_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q)
    );
  });

  const selectedApplicants = allApplicants?.filter((a) => selectedSet.has(a.id)) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recipient Lists
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create named lists of applicants for bulk messaging.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Create List
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No recipient lists yet.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Members
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {lists.map((list) => (
                <tr key={list.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {list.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {list.description || (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {list.member_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isAdmin && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(list.id)}
                          className="text-sm text-primary-600 hover:text-primary-800"
                        >
                          Edit
                        </button>
                        {deleteConfirm === list.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMutation.mutate(list.id)}
                              className="text-sm text-red-600 hover:text-red-800 font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(list.id)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Dynamic Lists Section ── */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Dynamic Lists
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Filter-based lists that automatically resolve recipients at send time.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={openDynamicCreate}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              Create Dynamic List
            </button>
          )}
        </div>

        {dynamicLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : dynamicLists.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No dynamic lists yet.</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Recipients
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {dynamicLists.map((dl) => (
                  <tr key={dl.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {dl.name}
                      </div>
                      {dl.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {dl.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {dl.target_type === 'registration' ? 'Registration' : 'Sponsor'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {dl.recipient_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openDynamicEdit(dl)}
                            className="text-sm text-primary-600 hover:text-primary-800"
                          >
                            Edit
                          </button>
                          {deleteDynamicConfirm === dl.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteDynamicMutation.mutate(dl.id)}
                                className="text-sm text-red-600 hover:text-red-800 font-medium"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteDynamicConfirm(null)}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteDynamicConfirm(dl.id)}
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Manual List Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingListId ? 'Edit Recipient List' : 'Create Recipient List'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="e.g. Accepted Speakers 2025"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Optional description"
                />
              </div>

              {/* Members */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Members ({formApplicantIds.length})
                </label>
                {selectedApplicants.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedApplicants.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 text-sm text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full"
                      >
                        {a.first_name} {a.last_name}
                        <button
                          onClick={() =>
                            setFormApplicantIds((prev) => prev.filter((id) => id !== a.id))
                          }
                          className="text-blue-400 hover:text-blue-600 ml-0.5"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Search applicants to add..."
                  value={applicantSearch}
                  onChange={(e) => setApplicantSearch(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                />
                {applicantSearch.trim() && filteredApplicants && filteredApplicants.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md mt-1">
                    {filteredApplicants.slice(0, 30).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setFormApplicantIds((prev) => [...prev, a.id]);
                          setApplicantSearch('');
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b last:border-b-0 dark:border-gray-700"
                      >
                        {a.first_name} {a.last_name}{' '}
                        <span className="text-gray-400 dark:text-gray-500">{a.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {applicantSearch.trim() &&
                  filteredApplicants &&
                  filteredApplicants.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      No applicants found
                    </p>
                  )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formName.trim() || formApplicantIds.length === 0 || saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingListId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic List Create / Edit Modal */}
      {showDynamicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingDynamicId ? 'Edit Dynamic List' : 'Create Dynamic List'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={dlName}
                  onChange={(e) => setDlName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  placeholder="e.g. Tutorial Attendees from Germany"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={dlDescription}
                  onChange={(e) => setDlDescription(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Optional description"
                />
              </div>

              {/* Target type (only when creating) */}
              {!editingDynamicId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Target Type
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="radio"
                        checked={dlTargetType === 'registration'}
                        onChange={() => {
                          setDlTargetType('registration');
                          setDlFilters({});
                        }}
                      />
                      Registrations
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="radio"
                        checked={dlTargetType === 'sponsor'}
                        onChange={() => {
                          setDlTargetType('sponsor');
                          setDlFilters({});
                        }}
                      />
                      Sponsors
                    </label>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</h4>

                {dlTargetType === 'registration' && (
                  <>
                    {/* Booking Options */}
                    {Array.isArray(bookingOptions) && bookingOptions.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                          Booking Options
                        </label>
                        <select
                          multiple
                          value={(dlFilters.booking_option_ids as string[]) ?? []}
                          onChange={(e) =>
                            updateFilter(
                              'booking_option_ids',
                              Array.from(e.target.selectedOptions, (o) => o.value)
                            )
                          }
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                          size={Math.min(4, bookingOptions.length)}
                        >
                          {bookingOptions.map((opt: { id: string; name: string }) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Hold Ctrl/Cmd to select multiple
                        </p>
                      </div>
                    )}

                    {/* Bookable Sessions */}
                    {Array.isArray(bookableSessions) && bookableSessions.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                          Bookable Sessions
                        </label>
                        <select
                          multiple
                          value={(dlFilters.session_ids as string[]) ?? []}
                          onChange={(e) =>
                            updateFilter(
                              'session_ids',
                              Array.from(e.target.selectedOptions, (o) => o.value)
                            )
                          }
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                          size={Math.min(4, bookableSessions.length)}
                        >
                          {bookableSessions.map((s: { id: string; title: string }) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Hold Ctrl/Cmd to select multiple
                        </p>
                      </div>
                    )}

                    {/* Country */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Country
                      </label>
                      <select
                        value={(dlFilters.country as string) ?? ''}
                        onChange={(e) => updateFilter('country', e.target.value || null)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">Any country</option>
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* City */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={(dlFilters.city as string) ?? ''}
                        onChange={(e) => updateFilter('city', e.target.value || null)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                        placeholder="e.g. Berlin"
                      />
                    </div>

                    {/* Company */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Company
                      </label>
                      <input
                        type="text"
                        value={(dlFilters.company as string) ?? ''}
                        onChange={(e) => updateFilter('company', e.target.value || null)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                        placeholder="e.g. Acme Corp"
                      />
                    </div>

                    {/* Registration Mode */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Registration Mode
                      </label>
                      <select
                        value={(dlFilters.registration_mode as string) ?? ''}
                        onChange={(e) => updateFilter('registration_mode', e.target.value || null)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">Any</option>
                        <option value="individual">Individual</option>
                        <option value="bulk">Bulk</option>
                      </select>
                    </div>

                    {/* Status */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Status
                      </label>
                      <select
                        value={(dlFilters.status as string) ?? ''}
                        onChange={(e) => updateFilter('status', e.target.value || null)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">Any</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending</option>
                        <option value="waitlisted">Waitlisted</option>
                      </select>
                    </div>
                  </>
                )}

                {dlTargetType === 'sponsor' && (
                  <>
                    {/* Sponsor Packages */}
                    {Array.isArray(sponsorPackages) && sponsorPackages.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                          Sponsor Packages
                        </label>
                        <select
                          multiple
                          value={(dlFilters.sponsor_package_ids as string[]) ?? []}
                          onChange={(e) =>
                            updateFilter(
                              'sponsor_package_ids',
                              Array.from(e.target.selectedOptions, (o) => o.value)
                            )
                          }
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                          size={Math.min(4, sponsorPackages.length)}
                        >
                          {sponsorPackages.map((pkg: { id: string; name: string }) => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Hold Ctrl/Cmd to select multiple
                        </p>
                      </div>
                    )}

                    {/* Country */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Country
                      </label>
                      <select
                        value={(dlFilters.country as string) ?? ''}
                        onChange={(e) => updateFilter('country', e.target.value || null)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">Any country</option>
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* City */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={(dlFilters.city as string) ?? ''}
                        onChange={(e) => updateFilter('city', e.target.value || null)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                        placeholder="e.g. Berlin"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Live recipient count */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2 text-sm">
                {dlPreviewLoading ? (
                  <span className="text-gray-500 dark:text-gray-400">Counting recipients...</span>
                ) : dlPreview ? (
                  <span className="text-gray-700 dark:text-gray-300">
                    Matches <span className="font-semibold">{dlPreview.total}</span> recipient
                    {dlPreview.total !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">
                    Configure filters to see recipient count
                  </span>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={closeDynamicModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDynamicSave}
                disabled={!dlName.trim() || dynamicSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {dynamicSaving ? 'Saving...' : editingDynamicId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
