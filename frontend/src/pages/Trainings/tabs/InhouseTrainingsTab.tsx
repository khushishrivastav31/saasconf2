/**
 * Inhouse Trainings Tab — table view with create/edit modal.
 * Sorted by start_date, filterable by status and search.
 */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import { useToast } from '../../../components/Toast';
import { parseApiError } from '../../../utils/apiError';

interface InhouseTraining {
  id: string;
  customer_id: string;
  training_id: string;
  trainer_id: string | null;
  offer_id: string | null;
  start_date: string;
  end_date: string;
  status: string;
  training_price: number | null;
  certification_price: number | null;
  comments: string | null;
  customer_name: string | null;
  training_name: string | null;
  trainer_name: string | null;
}

interface DropdownItem {
  id: string;
  name: string;
}

interface TrainerItem {
  id: string;
  first_name: string;
  last_name: string;
}

type InhouseForm = {
  customer_id: string;
  training_id: string;
  trainer_id: string;
  start_date: string;
  end_date: string;
  status: string;
  training_price: string;
  certification_price: string;
  comments: string;
};

const EMPTY_FORM: InhouseForm = {
  customer_id: '',
  training_id: '',
  trainer_id: '',
  start_date: '',
  end_date: '',
  status: 'draft',
  training_price: '',
  certification_price: '',
  comments: '',
};

const STATUS_OPTIONS = [
  {
    value: 'draft',
    label: 'Draft',
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  },
  {
    value: 'sent',
    label: 'Sent',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  },
  {
    value: 'rejected',
    label: 'Rejected',
    color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  },
  {
    value: 'accepted',
    label: 'Accepted',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  },
];

const QK = ['training-inhouse'];

export default function InhouseTrainingsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<InhouseForm>(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Fetch inhouse trainings
  const { data, isLoading } = useQuery<{ items: InhouseTraining[] }>({
    queryKey: [...QK, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = { page_size: '500' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/trainings/inhouse', { params });
      return res.data;
    },
  });

  // Fetch dropdowns
  const { data: trainingsData } = useQuery<{ items: DropdownItem[] }>({
    queryKey: ['trainings-for-select'],
    queryFn: async () => (await api.get('/trainings?page_size=500')).data,
  });
  const { data: customersData } = useQuery<{ items: DropdownItem[] }>({
    queryKey: ['training-customers'],
    queryFn: async () => (await api.get('/trainings/customers?page_size=500')).data,
  });
  const { data: trainersData } = useQuery<{ items: TrainerItem[] }>({
    queryKey: ['trainers-for-select'],
    queryFn: async () => (await api.get('/trainings/trainers?page_size=500')).data,
  });

  const items = data?.items ?? [];
  const trainings = trainingsData?.items ?? [];
  const customers = customersData?.items ?? [];
  const trainers = trainersData?.items ?? [];

  const updateField = (key: keyof InhouseForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsCreating(true);
  };

  const openEdit = useCallback((it: InhouseTraining) => {
    setForm({
      customer_id: it.customer_id,
      training_id: it.training_id,
      trainer_id: it.trainer_id ?? '',
      start_date: it.start_date,
      end_date: it.end_date,
      status: it.status,
      training_price: it.training_price != null ? String(it.training_price) : '',
      certification_price: it.certification_price != null ? String(it.certification_price) : '',
      comments: it.comments ?? '',
    });
    setEditingId(it.id);
    setIsCreating(true);
  }, []);

  const closeModal = () => {
    setIsCreating(false);
    setEditingId(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        customer_id: form.customer_id,
        training_id: form.training_id,
        trainer_id: form.trainer_id || null,
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
        training_price: form.training_price ? parseFloat(form.training_price) : null,
        certification_price: form.certification_price ? parseFloat(form.certification_price) : null,
        comments: form.comments || null,
      };
      if (editingId) {
        return (await api.put(`/trainings/inhouse/${editingId}`, payload)).data;
      }
      return (await api.post('/trainings/inhouse', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      showToast(editingId ? 'Inhouse training updated' : 'Inhouse training created', 'success');
      closeModal();
    },
    onError: (err) => showToast(parseApiError(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/inhouse/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      showToast('Inhouse training deleted', 'success');
      setConfirmDeleteId(null);
    },
    onError: (err) => {
      showToast(parseApiError(err), 'error');
      setConfirmDeleteId(null);
    },
  });

  const canSave =
    form.customer_id &&
    form.training_id &&
    form.start_date &&
    form.end_date &&
    form.end_date >= form.start_date;

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Inhouse Trainings
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage custom training engagements for customers.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          + Add Inhouse Training
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by training, customer, trainer..."
          className={inputClass + ' max-w-sm'}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass + ' w-40'}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-sm">No inhouse trainings found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Training
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Dates
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Trainer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((it) => {
                const statusOpt = STATUS_OPTIONS.find((s) => s.value === it.status);
                return (
                  <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {it.training_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {it.customer_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {it.start_date} — {it.end_date}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusOpt?.color ?? ''}`}
                      >
                        {statusOpt?.label ?? it.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {it.trainer_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {it.training_price != null ? `${it.training_price}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(it)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(it.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingId ? 'Edit Inhouse Training' : 'New Inhouse Training'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Training *
                  </label>
                  <select
                    value={form.training_id}
                    onChange={(e) => updateField('training_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select training...</option>
                    {trainings.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Customer *
                  </label>
                  <select
                    value={form.customer_id}
                    onChange={(e) => updateField('customer_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => updateField('start_date', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => updateField('end_date', e.target.value)}
                    min={form.start_date || undefined}
                    className={inputClass}
                  />
                  {form.end_date && form.start_date && form.end_date < form.start_date && (
                    <p className="text-xs text-red-500 mt-1">End date must be after start date</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => updateField('status', e.target.value)}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Trainer
                  </label>
                  <select
                    value={form.trainer_id}
                    onChange={(e) => updateField('trainer_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">No trainer assigned</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Training Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.training_price}
                    onChange={(e) => updateField('training_price', e.target.value)}
                    placeholder="Custom price (optional)"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Certification Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.certification_price}
                    onChange={(e) => updateField('certification_price', e.target.value)}
                    placeholder="Custom price (optional)"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Comments
                </label>
                <textarea
                  value={form.comments}
                  onChange={(e) => updateField('comments', e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Inhouse Training?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
