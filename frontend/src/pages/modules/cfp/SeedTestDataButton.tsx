import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../config/api';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { parseApiError } from '../../../utils/apiError';
import { useIsTenantAdmin } from '../../../hooks/useIsAdmin';
import { isSeedEnvironment } from '../../../utils/seedEnv';

interface SeedResult {
  evaluated_papers: number;
  reviewers: number;
  must_have_papers: number;
  default_password: string;
}

interface SeedTestDataButtonProps {
  conferenceId: string;
}

/**
 * Dev/staging-only action that seeds sample papers, reviewers, and reviews into
 * a conference so the evaluated-papers workflows can be tested. Hidden for
 * non-admins and outside dev/staging; the backend endpoint enforces the same
 * gate (returns 404 in production).
 */
export default function SeedTestDataButton({ conferenceId }: SeedTestDataButtonProps) {
  const isTenantAdmin = useIsTenantAdmin();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<SeedResult>(
        `/cfp/conferences/${conferenceId}/seed-review-data`,
        {}
      );
      return response.data;
    },
    onSuccess: (data) => {
      setError(null);
      setConfirmOpen(false);
      setMessage(
        `Seeded ${data.evaluated_papers} evaluated papers and ${data.reviewers} reviewers ` +
          `(${data.must_have_papers} must-have). Login password: ${data.default_password}`
      );
      queryClient.invalidateQueries({ queryKey: ['cfp-evaluated-papers'] });
      queryClient.invalidateQueries({ queryKey: ['cfp-papers'] });
      queryClient.invalidateQueries({ queryKey: ['paper-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['paper-reviews'] });
    },
    onError: (err: unknown) => {
      setMessage(null);
      setConfirmOpen(false);
      setError(parseApiError(err, 'Failed to seed test data'));
    },
  });

  // Only tenant admins on dev/staging see this. The backend 404 is the real gate.
  if (!isTenantAdmin || !isSeedEnvironment()) return null;

  return (
    <div className="mt-3 sm:mt-0">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={mutation.isPending}
        className="inline-flex items-center px-3 py-2 border border-amber-300 dark:border-amber-700 text-sm font-medium rounded-md text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
      >
        {mutation.isPending ? 'Seeding…' : 'Seed test data'}
      </button>

      {message && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ConfirmDialog
        open={confirmOpen}
        title="Seed review test data?"
        message="This creates sample papers, reviewers, and submitted reviews in this conference so you can test the review workflows. It is safe to run repeatedly (idempotent) and only works on dev/staging."
        confirmLabel="Seed data"
        variant="primary"
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
