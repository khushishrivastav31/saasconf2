import { useState, useCallback, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import type { Training, TrainingCreate } from '../../../types/training';
import { parseApiError } from '../../../utils/apiError';
import { ErrorBanner } from '../../../components/common/ErrorBanner';
import ConfirmDialog from '../../../components/ConfirmDialog';

interface TrainingListResponse {
  items: Training[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    upcoming: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ongoing: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    past: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || colors.draft}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const TrainingRow = memo(function TrainingRow({
  training,
  onSelect,
  onDelete,
}: {
  training: Training;
  onSelect: (id: string) => void;
  onDelete: (training: Training) => void;
}) {
  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
      onClick={() => onSelect(training.id)}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 dark:text-gray-100">{training.name}</div>
        {training.abbreviation && (
          <div className="text-xs text-gray-500 dark:text-gray-400">{training.abbreviation}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {training.start_date ? new Date(training.start_date).toLocaleDateString() : '—'}
        {training.end_date && ` – ${new Date(training.end_date).toLocaleDateString()}`}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{training.city || '—'}</td>
      <td className="px-4 py-3">
        <StatusBadge status={training.status} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 text-center">
        {training.team_count}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(training);
          }}
          disabled={training.is_active}
          className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title={training.is_active ? 'Deactivate before deleting' : 'Delete training'}
        >
          Delete
        </button>
      </td>
    </tr>
  );
});

interface Props {
  onSelectTraining?: (id: string) => void;
}

export default function TrainingsListTab({ onSelectTraining }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createAbbreviation, setCreateAbbreviation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Training | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['trainings', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: '20' });
      if (search) params.set('search', search);
      const res = await api.get<TrainingListResponse>(`/trainings?${params}`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TrainingCreate) => {
      const res = await api.post<Training>('/trainings', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings'] });
      setShowCreate(false);
      setCreateName('');
      setCreateAbbreviation('');
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings'] });
      setDeleteTarget(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleSelect = useCallback(
    (id: string) => {
      onSelectTraining?.(id);
    },
    [onSelectTraining]
  );

  const handleDelete = useCallback((training: Training) => {
    setDeleteTarget(training);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Trainings</h3>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Training
        </button>
      </div>

      <ErrorBanner message={error} />

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search trainings..."
          className="w-full max-w-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-3">
            Create Training
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Abbreviation
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                value={createAbbreviation}
                onChange={(e) => setCreateAbbreviation(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setError(null);
              }}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!createName.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  name: createName.trim(),
                  abbreviation: createAbbreviation.trim() || undefined,
                })
              }
              className="px-3 py-1.5 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Dates
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    City
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Team
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data.items.map((training) => (
                  <TrainingRow
                    key={training.id}
                    training={training}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Page {data.page} of {data.pages} ({data.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {search
              ? 'No trainings match your search.'
              : 'No trainings yet. Create one to get started.'}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Training"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
