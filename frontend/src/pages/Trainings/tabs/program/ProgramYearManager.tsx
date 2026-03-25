import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type { TrainingProgramYear } from '../../../../types/training';
import { parseApiError } from '../../../../utils/apiError';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import ConfirmDialog from '../../../../components/ConfirmDialog';

interface Props {
  programYears: TrainingProgramYear[];
  onNavigateToYear: (year: number) => void;
}

export default function ProgramYearManager({ programYears, onNavigateToYear }: Props) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newYear, setNewYear] = useState(() => new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingProgramYear | null>(null);

  const createMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await api.post<TrainingProgramYear>('/trainings/programs/years', { year });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['training-program-years'] });
      setShowCreate(false);
      setError(null);
      onNavigateToYear(data.year);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/trainings/programs/years/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-program-years'] });
      setDeleteTarget(null);
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const handleDelete = useCallback((py: TrainingProgramYear) => {
    setDeleteTarget(py);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Training Program</h3>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Year
        </button>
      </div>

      <ErrorBanner message={error} />

      {showCreate && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-3">
            Add Program Year
          </h4>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Year *
              </label>
              <input
                type="number"
                min={new Date().getFullYear()}
                max={2099}
                className="w-32 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setError(null);
                }}
                className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newYear || createMutation.isPending}
                onClick={() => createMutation.mutate(newYear)}
                className="px-3 py-2 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {programYears.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No program years yet. Add a year to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {programYears.map((py) => (
            <div
              key={py.id}
              className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => onNavigateToYear(py.year)}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {py.year}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    py.status === 'published'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {py.status === 'published' ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(py);
                  }}
                  disabled={py.status !== 'draft'}
                  className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                  title={
                    py.status !== 'draft' ? 'Unpublish before deleting' : 'Delete program year'
                  }
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Program Year"
        message={
          deleteTarget
            ? `Are you sure you want to delete the ${deleteTarget.year} program? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
