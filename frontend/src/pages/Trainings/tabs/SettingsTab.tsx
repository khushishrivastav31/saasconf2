import { lazy, Suspense } from 'react';
import type { TrainingSectionId } from '../trainingSections';

const TrainersSettingsTab = lazy(() => import('./settings/TrainersSettingsTab'));
const ThemeSettingsTab = lazy(() => import('./settings/ThemeSettingsTab'));
const LanguagesSettingsTab = lazy(() => import('./settings/LanguagesSettingsTab'));
const CertificationBodiesTab = lazy(() => import('./settings/CertificationBodiesTab'));
const SyllabiTab = lazy(() => import('./settings/SyllabiTab'));
const TrainingsSettingsTab = lazy(() => import('./settings/TrainingsSettingsTab'));
const PronounOptionsTab = lazy(() => import('./settings/PronounOptionsTab'));
const LocationTypesTab = lazy(() => import('./settings/LocationTypesTab'));
const RegistrationPortalTab = lazy(() => import('./settings/RegistrationPortalTab'));
const PoliciesTab = lazy(() => import('./settings/PoliciesTab'));
const RegistrationQuestionsTab = lazy(() => import('./settings/RegistrationQuestionsTab'));
const EmailSettingsTab = lazy(() => import('./settings/EmailSettingsTab'));
const SystemEmailTemplatesTab = lazy(() => import('./settings/SystemEmailTemplatesTab'));
const MessagingSettingsTab = lazy(() => import('./settings/MessagingSettingsTab'));
const MessageTemplatesTab = lazy(() => import('./settings/MessageTemplatesTab'));
const RecipientListsTab = lazy(() => import('./settings/RecipientListsTab'));
const ScreenOverlaysTab = lazy(() => import('./settings/ScreenOverlaysTab'));
const CurrencyTaxTab = lazy(() => import('./settings/CurrencyTaxTab'));
const NumberingTab = lazy(() => import('./settings/NumberingTab'));
const CompanyDataTab = lazy(() => import('./settings/CompanyDataTab'));
const BankAccountsTab = lazy(() => import('./settings/BankAccountsTab'));
const InvoiceTemplatesTab = lazy(() => import('./settings/InvoiceTemplatesTab'));
const ZugferdTab = lazy(() => import('./settings/ZugferdTab'));
const StripeSetupTab = lazy(() => import('./settings/StripeSetupTab'));
const PaymentRemindersSettingsTab = lazy(() => import('./settings/PaymentRemindersSettingsTab'));

const settingsMap: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  'settings-trainers': TrainersSettingsTab,
  'settings-theme': ThemeSettingsTab,
  'settings-languages': LanguagesSettingsTab,
  'settings-certification-bodies': CertificationBodiesTab,
  'settings-syllabi': SyllabiTab,
  'settings-trainings': TrainingsSettingsTab,
  'settings-pronoun-options': PronounOptionsTab,
  'settings-location-types': LocationTypesTab,
  'settings-registration-portal': RegistrationPortalTab,
  'settings-policies': PoliciesTab,
  'settings-registration-questions': RegistrationQuestionsTab,
  'settings-email': EmailSettingsTab,
  'settings-system-email-templates': SystemEmailTemplatesTab,
  'settings-messaging': MessagingSettingsTab,
  'settings-message-templates': MessageTemplatesTab,
  'settings-recipient-lists': RecipientListsTab,
  'settings-screen-overlays': ScreenOverlaysTab,
  'settings-currency-tax': CurrencyTaxTab,
  'settings-numbering': NumberingTab,
  'settings-company-data': CompanyDataTab,
  'settings-bank-accounts': BankAccountsTab,
  'settings-invoice-templates': InvoiceTemplatesTab,
  'settings-zugferd': ZugferdTab,
  'settings-stripe': StripeSetupTab,
  'settings-payment-reminders': PaymentRemindersSettingsTab,
};

interface SettingsTabProps {
  activeSection: TrainingSectionId;
}

export default function SettingsTab({ activeSection }: SettingsTabProps) {
  const Component = settingsMap[activeSection];

  if (!Component) {
    return <TrainersSettingsTab />;
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}
