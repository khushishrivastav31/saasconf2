import { useState, useEffect, useRef } from "react";
import api from "../../config/api";
import { useIsAdmin } from "../../hooks/useIsAdmin";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import RichTextEditor from "../../components/common/RichTextEditor";
import RichTextDisplay from "../../components/common/RichTextDisplay";
import type {
  CallForPapers,
  CFPStats,
  Conference,
  PaginatedResponse,
} from "../../types";
import { CFP_STATUS_COLORS } from "../../config/statusColors";

export default function CallForPapersPage() {
  const isAdmin = useIsAdmin();
  const [cfps, setCfps] = useState<CallForPapers[]>([]);
  const [stats, setStats] = useState<CFPStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCfp, setEditingCfp] = useState<CallForPapers | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CallForPapers | null>(null);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    open_date: "",
    close_date: "",
    max_submissions_per_speaker: "",
    required_speaker_fields: [] as string[],
    required_paper_fields: [] as string[],
    allowed_formats: [] as string[],
    tracks: [] as string[],
    is_anonymous_review: false,
    reviewers_per_paper: "3",
    conference_id: "",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCfps = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "20",
      });
      if (statusFilter) params.append("status", statusFilter);
      if (search) params.append("search", search);

      const response = await api.get<PaginatedResponse<CallForPapers>>(
        `/cfp?${params}`,
      );
      setCfps(response.data.items);
      setTotalPages(response.data.pages);
    } catch {
      setError("Failed to load Call for Papers");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get<CFPStats>("/cfp/stats");
      setStats(response.data);
    } catch {
      console.error("Failed to load stats");
    }
  };

  const fetchConferences = async () => {
    try {
      const response = await api.get<PaginatedResponse<Conference>>(
        "/conferences?page_size=100",
      );
      setConferences(response.data.items);
    } catch {
      // Non-critical: conference list won't populate
    }
  };

  useEffect(() => {
    fetchCfps();
    fetchStats();
    fetchConferences();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCfps();
  };

  const openCreateModal = () => {
    setEditingCfp(null);
    setFormData({
      title: "",
      description: "",
      open_date: "",
      close_date: "",
      max_submissions_per_speaker: "",
      required_speaker_fields: [],
      required_paper_fields: [],
      allowed_formats: [],
      tracks: [],
      is_anonymous_review: false,
      reviewers_per_paper: "3",
      conference_id: "",
    });
    setShowModal(true);
  };

  const openEditModal = (cfp: CallForPapers) => {
    setEditingCfp(cfp);
    setFormData({
      title: cfp.title,
      description: cfp.description || "",
      open_date: cfp.open_date ? cfp.open_date.slice(0, 16) : "",
      close_date: cfp.close_date ? cfp.close_date.slice(0, 16) : "",
      max_submissions_per_speaker:
        cfp.max_submissions_per_speaker?.toString() || "",
      required_speaker_fields: cfp.required_speaker_fields || [],
      required_paper_fields: cfp.required_paper_fields || [],
      allowed_formats: cfp.allowed_formats,
      tracks: cfp.tracks,
      is_anonymous_review: cfp.is_anonymous_review,
      reviewers_per_paper: cfp.reviewers_per_paper?.toString() || "3",
      conference_id: "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    try {
      const payload: Record<string, unknown> = {
        title: formData.title,
        description: formData.description || null,
        open_date: formData.open_date || null,
        close_date: formData.close_date || null,
        max_submissions_per_speaker: formData.max_submissions_per_speaker
          ? parseInt(formData.max_submissions_per_speaker)
          : null,
        required_speaker_fields: formData.required_speaker_fields,
        required_paper_fields: formData.required_paper_fields,
        allowed_formats: formData.allowed_formats,
        tracks: formData.tracks,
        is_anonymous_review: formData.is_anonymous_review,
        reviewers_per_paper: formData.reviewers_per_paper
          ? parseInt(formData.reviewers_per_paper)
          : 3,
      };

      if (editingCfp) {
        await api.put(`/cfp/${editingCfp.id}`, payload);
      } else {
        payload.conference_id = formData.conference_id;
        await api.post("/cfp", payload);
      }

      setSaveStatus("saved");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      setShowModal(false);
      fetchCfps();
      fetchStats();
    } catch {
      setSaveStatus("error");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      setError("Failed to save Call for Papers");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/cfp/${deleteTarget.id}`);
      fetchCfps();
      fetchStats();
    } catch {
      setError("Failed to delete Call for Papers");
    }
    setDeleteTarget(null);
  };

  const handleStatusChange = async (cfp: CallForPapers, newStatus: string) => {
    try {
      await api.put(`/cfp/${cfp.id}`, { status: newStatus });
      fetchCfps();
      fetchStats();
    } catch {
      setError("Failed to update status");
    }
  };

  if (loading && cfps.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call for Papers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage call for papers and review submissions
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            Create CFP
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Draft</p>
            <p className="text-2xl font-bold text-gray-600">{stats.draft}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Open</p>
            <p className="text-2xl font-bold text-green-600">{stats.open}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Closed</p>
            <p className="text-2xl font-bold text-red-600">{stats.closed}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">In Review</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.review}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-2xl font-bold text-blue-600">
              {stats.completed}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Submissions</p>
            <p className="text-2xl font-bold text-purple-600">
              {stats.total_submissions}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <input
            type="text"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          />
        </form>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="review">In Review</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* CFP List */}
      <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Dates
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Submissions
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {cfps.map((cfp) => (
              <tr key={cfp.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {cfp.title}
                  </div>
                  {cfp.description && (
                    <RichTextDisplay content={cfp.description} truncate className="text-sm text-gray-500 max-w-xs" />
                  )}
                </td>
                <td className="px-6 py-4">
                  <select
                    value={cfp.status}
                    onChange={(e) => handleStatusChange(cfp, e.target.value)}
                    className={`text-xs font-medium px-2 py-1 rounded-full ${CFP_STATUS_COLORS[cfp.status as keyof typeof CFP_STATUS_COLORS]}`}
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="review">In Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {cfp.open_date && (
                    <div>
                      Opens: {new Date(cfp.open_date).toLocaleDateString()}
                    </div>
                  )}
                  {cfp.close_date && (
                    <div>
                      Closes: {new Date(cfp.close_date).toLocaleDateString()}
                    </div>
                  )}
                  {!cfp.open_date && !cfp.close_date && (
                    <span>No dates set</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-gray-900">
                    {cfp.submission_count}
                  </span>
                </td>
                {isAdmin && (
                <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                  <button
                    onClick={() => openEditModal(cfp)}
                    className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                    title="Edit"
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
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(cfp)}
                    className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                    title="Delete"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </td>
                )}
              </tr>
            ))}
            {cfps.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  No Call for Papers found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingCfp ? "Edit Call for Papers" : "Create Call for Papers"}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!editingCfp && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Conference *
              </label>
              <select
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                value={formData.conference_id}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    conference_id: e.target.value,
                  })
                }
              >
                <option value="">Select a conference...</option>
                {conferences.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.abbreviation ? ` (${c.abbreviation})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <RichTextEditor
              value={formData.description}
              onChange={(html) =>
                setFormData({ ...formData, description: html })
              }
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Open Date
              </label>
              <input
                type="datetime-local"
                value={formData.open_date}
                onChange={(e) => {
                  const newOpen = e.target.value;
                  const adjustClose = formData.close_date && newOpen && formData.close_date < newOpen;
                  setFormData({
                    ...formData,
                    open_date: newOpen,
                    ...(adjustClose ? { close_date: newOpen } : {}),
                  });
                }}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Close Date
              </label>
              <input
                type="datetime-local"
                value={formData.close_date}
                min={formData.open_date}
                onChange={(e) =>
                  setFormData({ ...formData, close_date: e.target.value })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Max Submissions per Speaker
            </label>
            <input
              type="number"
              min="1"
              value={formData.max_submissions_per_speaker}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  max_submissions_per_speaker: e.target.value,
                })
              }
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              placeholder="Leave empty for unlimited"
            />
          </div>

          {/* Required Speaker Profile Fields */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Required Speaker Profile Fields</h3>
            <div className="flex flex-wrap gap-4">
              {[
                { key: "bio", label: "Short Bio" },
                { key: "picture", label: "Picture" },
                { key: "video", label: "Video" },
                { key: "phone", label: "Phone" },
                { key: "title", label: "Title / Position" },
                { key: "company", label: "Company / Organization" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.required_speaker_fields.includes(key)}
                    onChange={(e) => {
                      const fields = e.target.checked
                        ? [...formData.required_speaker_fields, key]
                        : formData.required_speaker_fields.filter((f) => f !== key);
                      setFormData({ ...formData, required_speaker_fields: fields });
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Required Paper Fields */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Required Paper Fields</h3>
            <div className="flex flex-wrap gap-4">
              {[
                { key: "abstract_short", label: "Short Abstract" },
                { key: "abstract_long", label: "Detailed Abstract" },
                { key: "level", label: "Level" },
                { key: "learning_objectives", label: "Learning Objectives" },
                { key: "importance", label: "Why is this important?" },
                { key: "session_type", label: "Session Type" },
                { key: "topics", label: "Topics" },
                { key: "video", label: "Video" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.required_paper_fields.includes(key)}
                    onChange={(e) => {
                      const fields = e.target.checked
                        ? [...formData.required_paper_fields, key]
                        : formData.required_paper_fields.filter((f) => f !== key);
                      setFormData({ ...formData, required_paper_fields: fields });
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Review Settings */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Review Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Reviewers per Paper
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.reviewers_per_paper}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reviewers_per_paper: e.target.value,
                    })
                  }
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_anonymous_review}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        is_anonymous_review: e.target.checked,
                      })
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Anonymous Review
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveStatus === "saving"}
              className={`px-4 py-2 text-white rounded-md transition-colors duration-200 ${
                saveStatus === "saved"
                  ? "bg-green-600 hover:bg-green-700"
                  : saveStatus === "error"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-primary-600 hover:bg-primary-700"
              } disabled:opacity-50`}
            >
              {saveStatus === "saving" ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : saveStatus === "saved" ? (
                <span className="flex items-center">
                  <svg className="-ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved!
                </span>
              ) : editingCfp ? (
                "Save Changes"
              ) : (
                "Create CFP"
              )}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Call for Papers"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
