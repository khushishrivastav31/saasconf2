import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import portalApi from '../../config/portalApi';
import { usePortalBasePath } from '../../hooks/usePortalBasePath';
import RichTextDisplay from '../../components/common/RichTextDisplay';

// The backend exposes the training list at /portal/unified/my-trainings
// (returns ``{items: [...]}``) and a per-registration files endpoint at
// /portal/unified/my-trainings/{registration_id}/files. There is *no*
// single-detail endpoint — and adding one would be redundant since the
// list response already carries every field we render here. So this page
// reads the matching item out of the list query's cache (TanStack Query
// dedupes the request — the sidebar already populated it) and derives
// the detail view from there.
//
// Note: the list returns two item shapes — ``source: "registration"``
// (a self-service paid registration) and ``source: "offer"`` (assigned
// via a customer offer). The files endpoint is registration-only; offer
// items have no registration_id, so the Materials section is hidden for
// them.
interface MyTrainingItem {
  id: string;
  source: 'registration' | 'offer';
  status: string;
  training_name: string;
  training_description: string | null;
  training_duration: string | null;
  start_date: string | null;
  location_name: string | null;
  location_building: string | null;
  location_floor: string | null;
  location_address_line1: string | null;
  location_address_line2: string | null;
  location_postal_code: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  location_phone: string | null;
  location_website: string | null;
  location_description: string | null;
  trainers: string[];
  registration_id?: string;
  offer_attendee_id?: string;
}

interface MyTrainingsResponse {
  items: MyTrainingItem[];
}

interface TrainingFile {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
  description: string | null;
}

const TrainingDetailPage = React.memo(function TrainingDetailPage() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const navigate = useNavigate();
  const basePath = usePortalBasePath();

  const {
    data: trainingsResponse,
    isLoading,
    error,
  } = useQuery<MyTrainingsResponse>({
    queryKey: ['portal-my-trainings'],
    queryFn: async () => {
      const response = await portalApi.get<MyTrainingsResponse>('/portal/unified/my-trainings');
      return response.data;
    },
    staleTime: 60_000,
  });

  const training = trainingsResponse?.items.find((item) => item.id === registrationId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !training) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Training not found.
        </div>
        <button
          onClick={() => navigate(`${basePath}/trainings`)}
          className="mt-4 text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
        >
          Back to My Trainings
        </button>
      </div>
    );
  }

  // Compose a multi-line postal address: name on its own line, then
  // building/floor (joined with ", "), then address_line1 / line2, then
  // "postal_code city, state", then country. Anything blank falls out so
  // we don't render dangling commas or empty lines.
  const buildingLine = [training.location_building, training.location_floor]
    .filter(Boolean)
    .join(', ');
  const cityLine = [
    [training.location_postal_code, training.location_city].filter(Boolean).join(' '),
    training.location_state,
  ]
    .filter(Boolean)
    .join(', ');
  const addressLines = [
    training.location_name,
    buildingLine || null,
    training.location_address_line1,
    training.location_address_line2,
    cityLine || null,
    training.location_country,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(`${basePath}/trainings`)}
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
        aria-label="Back to My Trainings"
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
          {training.training_description && (
            <div>
              <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                Description
              </h2>
              {/* Description is HTML in the catalog (admin uses a rich-text
                  editor). RichTextDisplay sanitizes + renders, falling back
                  to plain-text rendering when the content has no markup. */}
              <RichTextDisplay
                content={training.training_description}
                className="text-gray-900 dark:text-gray-100"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {training.start_date && (
              <div>
                <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">Date</h2>
                <p className="text-gray-900 dark:text-gray-100">{training.start_date}</p>
              </div>
            )}

            {training.training_duration && (
              <div>
                <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Duration
                </h2>
                <p className="text-gray-900 dark:text-gray-100">{training.training_duration}</p>
              </div>
            )}

            {addressLines.length > 0 && (
              <div className="sm:col-span-2">
                <h2 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Location
                </h2>
                <address className="not-italic text-gray-900 dark:text-gray-100">
                  {addressLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </address>
                {(training.location_phone || training.location_website) && (
                  <div className="mt-2 space-y-1 text-sm">
                    {training.location_phone && (
                      <div className="text-gray-700 dark:text-gray-300">
                        <span className="text-gray-500 dark:text-gray-400">Phone: </span>
                        <a
                          href={`tel:${training.location_phone}`}
                          className="text-primary-600 hover:underline dark:text-primary-400"
                        >
                          {training.location_phone}
                        </a>
                      </div>
                    )}
                    {training.location_website && (
                      <div className="text-gray-700 dark:text-gray-300">
                        <span className="text-gray-500 dark:text-gray-400">Website: </span>
                        <a
                          href={training.location_website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline dark:text-primary-400"
                        >
                          {training.location_website}
                        </a>
                      </div>
                    )}
                  </div>
                )}
                {training.location_description && (
                  <div className="mt-3">
                    <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                      Notes
                    </h3>
                    <RichTextDisplay
                      content={training.location_description}
                      className="text-sm text-gray-700 dark:text-gray-300"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {training.trainers && training.trainers.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                Trainers
              </h2>
              <ul className="space-y-1">
                {training.trainers.map((name, idx) => (
                  <li key={idx} className="text-gray-900 dark:text-gray-100">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Files attached to the training catalog entry. The backend
              endpoint is registration-keyed; offer-source items have no
              registration_id, so the Materials section is hidden for them. */}
          {training.source === 'registration' && <TrainingFiles registrationId={training.id} />}
        </div>
      </div>
    </div>
  );
});

function TrainingFiles({ registrationId }: { registrationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-training-files', registrationId],
    queryFn: async () => {
      const res = await portalApi.get<{ items: TrainingFile[] }>(
        `/portal/unified/my-trainings/${registrationId}/files`
      );
      return res.data;
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
    // Endpoint is at /api/v1/portal/attachments/{id}/download — see
    // backend/app/api/v1/cfp_portal/attachments.py:102. The OLD code
    // hit /attachments/... (no /portal/ prefix) which 404'd silently.
    try {
      const res = await portalApi.get(`/portal/attachments/${fileId}/download`, {
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
