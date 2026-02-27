import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../config/api';
import type { Conference } from '../../../../types';
import type {
  RecipientListListResponse,
  RecipientListDetailResponse,
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
    queryKey: ['recipient-lists', conference.id],
    queryFn: () => api.get(basePath).then((r) => r.data),
  });

  // Fetch list detail for editing
  const { data: editDetail } = useQuery<RecipientListDetailResponse>({
    queryKey: ['recipient-list-detail', conference.id, editingListId],
    queryFn: () => api.get(`${basePath}/${editingListId}`).then((r) => r.data),
    enabled: !!editingListId,
  });

  // Fetch all applicants for member selection
  const { data: allApplicants } = useQuery({
    queryKey: ['cfp-applicants-for-messaging', conference.id],
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
        queryKey: ['recipient-lists', conference.id],
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
        queryKey: ['recipient-lists', conference.id],
      });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${basePath}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['recipient-lists', conference.id],
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
                              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
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

      {/* Create / Edit Modal */}
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
    </div>
  );
}
