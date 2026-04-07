/**
 * Public Training Portal
 *
 * Browse available trainings and register (no authentication required).
 * URL: /{tenantSlug}/trainings/register/
 */
import { useEffect } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router';
import TrainingSearch from './TrainingSearch';
import TrainingRegistrationForm from './TrainingRegistrationForm';
import TrainingConfirmation from './TrainingConfirmation';

function TrainingPortal() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!tenantSlug) navigate('/');
  }, [tenantSlug, navigate]);

  if (!tenantSlug) return null;

  return (
    <Routes>
      <Route index element={<TrainingSearch tenantSlug={tenantSlug} />} />
      <Route
        path=":placementId/form"
        element={<TrainingRegistrationForm tenantSlug={tenantSlug} />}
      />
      <Route path=":placementId/confirmation" element={<TrainingConfirmation />} />
    </Routes>
  );
}

export default function PublicTrainingPortalPage() {
  return <TrainingPortal />;
}
