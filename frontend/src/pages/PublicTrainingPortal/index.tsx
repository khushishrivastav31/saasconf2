/**
 * Public Training Portal
 *
 * Browse available trainings and register (no authentication required).
 * URL: /{tenantSlug}/trainings/register/
 */
import { useEffect } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router';
import { usePortalLanguage } from './hooks/usePortalLanguage';
import { usePortalTexts } from './hooks/usePortalTexts';
import TrainingSearch from './TrainingSearch';
import TrainingRegistrationForm from './TrainingRegistrationForm';
import TrainingConfirmation from './TrainingConfirmation';

function TrainingPortal() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!tenantSlug) navigate('/');
  }, [tenantSlug, navigate]);

  const { lang, setLang } = usePortalLanguage();
  const { t, availableLanguages } = usePortalTexts(tenantSlug || '', lang);

  if (!tenantSlug) return null;

  return (
    <Routes>
      <Route
        index
        element={
          <TrainingSearch
            tenantSlug={tenantSlug}
            lang={lang}
            setLang={setLang}
            availableLanguages={availableLanguages}
            t={t}
          />
        }
      />
      <Route
        path=":placementId/form"
        element={
          <TrainingRegistrationForm
            tenantSlug={tenantSlug}
            lang={lang}
            setLang={setLang}
            availableLanguages={availableLanguages}
            t={t}
          />
        }
      />
      <Route
        path=":placementId/confirmation"
        element={<TrainingConfirmation lang={lang} t={t} />}
      />
    </Routes>
  );
}

export default function PublicTrainingPortalPage() {
  return <TrainingPortal />;
}
