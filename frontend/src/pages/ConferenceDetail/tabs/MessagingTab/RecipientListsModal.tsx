import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../../config/api";
import type {
  RecipientListListResponse,
  RecipientListDetailResponse,
} from "../../../../types/messaging";

interface RecipientListsModalProps {
  conferenceId: string;
  open: boolean;
  onClose: () => void;
}

interface Applicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export default function RecipientListsModal({
  conferenceId,
  open,
  onClose,
}: RecipientListsModalProps) {
  const queryClient = useQueryClient();
  const basePath = `/conferences/${conferenceId}/messaging/recipient-lists`;

  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formApplicantIds, setFormApplicantIds] = useState<string[]>([]);
  const [applicantSearch, setApplicantSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Fetch all lists
  const { data: listsData, isLoading } = useQuery<RecipientListListResponse>({
    queryKey: ["recipient-lists", conferenceId],
    queryFn: () => api.get(basePath).then((r) => r.data),
    enabled: open,
  });

  // Fetch list detail for editing
  const { data: editDetail } = useQuery<RecipientListDetailResponse>({
    queryKey: ["recipient-list-detail", conferenceId, editingListId],
    queryFn: () => api.get(`${basePath}/${editingListId}`).then((r) => r.data),
    enabled: !!editingListId && view === "edit",
  });

  // Fetch all applicants
  const { data: allApplicants } = useQuery({
    queryKey: ["cfp-applicants-for-messaging", conferenceId],
    queryFn: async () => {
      const resp = await api.get(`/cfp/applicants?conference_id=${conferenceId}`);
      return resp.data.items as Applicant[];
    },
    enabled: open && (view === "create" || view === "edit"),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string; applicant_ids: string[] }) =>
      api.post(basePath, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipient-lists", conferenceId] });
      resetForm();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name: string; description: string; applicant_ids: string[] }) =>
      api.put(`${basePath}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipient-lists", conferenceId] });
      resetForm();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${basePath}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipient-lists", conferenceId] });
      setDeleteConfirm(null);
    },
  });

  const resetForm = () => {
    setView("list");
    setEditingListId(null);
    setFormName("");
    setFormDescription("");
    setFormApplicantIds([]);
    setApplicantSearch("");
  };

  // Load edit data when available
  useEffect(() => {
    if (editDetail && view === "edit") {
      setFormName(editDetail.name);
      setFormDescription(editDetail.description ?? "");
      setFormApplicantIds(editDetail.members.map((m) => m.id));
    }
  }, [editDetail, view]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  if (!open) return null;

  const lists = listsData?.items ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  // Filter applicants for search
  const selectedSet = new Set(formApplicantIds);
  const filteredApplicants = allApplicants?.filter((a) => {
    if (!applicantSearch.trim()) return !selectedSet.has(a.id);
    const q = applicantSearch.toLowerCase();
    return (
      !selectedSet.has(a.id) &&
      (a.first_name.toLowerCase().includes(q) ||
        a.last_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q))
    );
  });

  const selectedApplicants = allApplicants?.filter((a) =>
    selectedSet.has(a.id)
  ) ?? [];

  const handleSave = () => {
    const payload = {
      name: formName,
      description: formDescription,
      applicant_ids: formApplicantIds,
    };
    if (view === "edit" && editingListId) {
      updateMutation.mutate({ id: editingListId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEdit = (id: string) => {
    setEditingListId(id);
    setView("edit");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            {view !== "list" && (
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {view === "list"
                ? "Recipient Lists"
                : view === "create"
                ? "Create List"
                : "Edit List"}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === "list" ? (
            <div className="p-6">
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setView("create")}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Create List
                </button>
              </div>
              {isLoading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : lists.length === 0 ? (
                <p className="text-sm text-gray-500">No recipient lists yet.</p>
              ) : (
                <div className="space-y-2">
                  {lists.map((list) => (
                    <div
                      key={list.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{list.name}</p>
                        <p className="text-xs text-gray-500">
                          {list.member_count} member{list.member_count !== 1 ? "s" : ""}
                          {list.description && ` — ${list.description}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(list.id)}
                          className="text-sm text-blue-600 hover:text-blue-800"
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
                              className="text-sm text-gray-500"
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Create / Edit form */
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Accepted Speakers 2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>

              {/* Selected members */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            setFormApplicantIds((prev) =>
                              prev.filter((id) => id !== a.id)
                            )
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                {applicantSearch.trim() &&
                  filteredApplicants &&
                  filteredApplicants.length > 0 && (
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md mt-1">
                      {filteredApplicants.slice(0, 30).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setFormApplicantIds((prev) => [...prev, a.id]);
                            setApplicantSearch("");
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0"
                        >
                          {a.first_name} {a.last_name}{" "}
                          <span className="text-gray-400">{a.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Footer for create/edit */}
        {view !== "list" && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t flex-shrink-0">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formName.trim() || formApplicantIds.length === 0 || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : view === "edit"
                ? "Update"
                : "Create"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
