import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import { trainingPortalApi } from './trainingPortalApi';

interface TrainingDetail {
  id: number;
  training_name: string;
  description: string | null;
  training_date: string | null;
  duration: string | null;
  location_name: string | null;
  location_city: string | null;
  location_country: string | null;
  trainers: Array<{ name: string; email?: string }>;
  status: string;
}

const TrainingDetailPage = React.memo(function TrainingDetailPage() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const navigate = useNavigate();

  const {
    data: training,
    isLoading,
    error,
  } = useQuery<TrainingDetail>({
    queryKey: ['portal-training-detail', registrationId],
    queryFn: async () => {
      const response = await trainingPortalApi.get(
        `/portal/unified/my-trainings/${registrationId}`
      );
      return response.data;
    },
    enabled: !!registrationId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-500 dark:text-gray-400">Loading training details...</div>
      </div>
    );
  }

  if (error || !training) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Failed to load training details.
        </div>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Go back
        </button>
      </div>
    );
  }

  const locationParts = [training.location_name, training.location_city, training.location_country]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
        aria-label="Back to dashboard"
      >
        <svg
          className="mr-1 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-700">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {training.training_name}
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium capitalize text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {training.status}
            </span>
          </div>
        </div>

        <div className="space-y-6 px-6 py-5">
          {training.description && (
            <div>
              <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                Description
              </h2>
              <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                {training.description}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {training.training_date && (
              <div>
                <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">Date</h2>
                <p className="text-gray-900 dark:text-gray-100">{training.training_date}</p>
              </div>
            )}

            {training.duration && (
              <div>
                <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Duration
                </h2>
                <p className="text-gray-900 dark:text-gray-100">{training.duration}</p>
              </div>
            )}

            {locationParts && (
              <div>
                <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Location
                </h2>
                <p className="text-gray-900 dark:text-gray-100">{locationParts}</p>
              </div>
            )}
          </div>

          {training.trainers && training.trainers.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                Trainers
              </h2>
              <ul className="space-y-1">
                {training.trainers.map((trainer, idx) => (
                  <li key={idx} className="text-gray-900 dark:text-gray-100">
                    {trainer.name}
                    {trainer.email && (
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        ({trainer.email})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Materials / Files */}
          <TrainingFiles registrationId={registrationId!} />
        </div>
      </div>
    </div>
  );
});

function TrainingFiles({ registrationId }: { registrationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-training-files', registrationId],
    queryFn: async () => {
      const res = await trainingPortalApi.get(
        `/portal/unified/my-trainings/${registrationId}/files`
      );
      return res.data as {
        items: Array<{
          id: string;
          filename: string;
          content_type: string;
          file_size: number;
          description: string | null;
        }>;
      };
    },
    staleTime: 60_000,
  });

  const files = data?.items ?? [];

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const res = await trainingPortalApi.get(`/attachments/${fileId}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent fail — user sees nothing
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Materials</h2>
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          No materials uploaded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {file.filename}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatSize(file.file_size)}
                  {file.description && ` — ${file.description}`}
                </p>
              </div>
              <button
                onClick={() => handleDownload(file.id, file.filename)}
                className="ml-3 shrink-0 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-700 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20"
              >
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TrainingDetailPage;
