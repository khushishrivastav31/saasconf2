import { useMemo, useState } from 'react';
import type { Conference } from '../../../types';
import { useAuth } from '../../../hooks/useAuth';
import ConferenceVolunteerRolesTab from './settings/VolunteerRolesTab';
import ConferenceLocationTypesTab from './settings/LocationTypesTab';
import ConferenceSponsorPackagesTab from './settings/SponsorPackagesTab';
import ConferenceSessionTypesTab from './settings/SessionTypesTab';
import ConferenceCommitteeRolesTab from './settings/CommitteeRolesTab';
import ConferenceScoreScalesTab from './settings/ScoreScalesTab';
import ConferenceReviewCriteriaTab from './settings/ReviewCriteriaTab';
import PaperFormBuilderTab from './settings/PaperFormBuilderTab';
import PronounOptionsTab from '../../PronounOptionsTab';
import EmailTemplatesTab from './settings/EmailTemplatesTab';
import EmailSettingsTab from './settings/EmailSettingsTab';
import MessagingSettingsTab from './settings/MessagingSettingsTab';
import MessageTemplatesTab from './settings/MessageTemplatesTab';
import RecipientListsTab from './settings/RecipientListsTab';
import ScreenOverlaysTab from './ScreenOverlaysTab';
import InvoiceNumberTab from './settings/InvoiceNumberTab';
import InvoiceCompanyDataTab from './settings/InvoiceCompanyDataTab';
import InvoiceBankAccountsTab from './settings/InvoiceBankAccountsTab';
import InvoiceTemplateTab from './settings/InvoiceTemplateTab';
import StripeSetupTab from './settings/StripeSetupTab';
import ZugferdSettingsTab from './settings/ZugferdSettingsTab';
import FinancialSettingsTab from './settings/FinancialSettingsTab';
import PortalCustomizationTab from './settings/PortalCustomizationTab';
import PoliciesTab from './settings/PoliciesTab';
import RegistrationQuestionsTab from './settings/RegistrationQuestionsTab';

type ConferenceSettingsActiveTab =
  | 'volunteer-roles'
  | 'location-types'
  | 'sponsor-packages'
  | 'session-types'
  | 'committee-roles'
  | 'score-scales'
  | 'review-criteria'
  | 'paper-form-builder'
  | 'pronoun-options'
  | 'email-templates'
  | 'email-settings'
  | 'messaging-settings'
  | 'message-templates'
  | 'recipient-lists'
  | 'screen-overlays'
  | 'portal-customization'
  | 'policies'
  | 'registration-questions'
  | 'financial-settings'
  | 'invoice-number'
  | 'invoice-company-data'
  | 'invoice-bank-accounts'
  | 'invoice-template'
  | 'zugferd-settings'
  | 'stripe-setup';

interface SettingsNavItem {
  key: ConferenceSettingsActiveTab;
  label: string;
  icon: React.ReactNode;
  group: string;
  superOnly?: boolean;
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  // People & Roles
  {
    key: 'volunteer-roles',
    label: 'Volunteer Tasks',
    group: 'People & Roles',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
  },
  {
    key: 'committee-roles',
    label: 'Committee Roles',
    group: 'People & Roles',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
  },
  {
    key: 'pronoun-options',
    label: 'Pronoun Options',
    group: 'People & Roles',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
  },
  // Conference Setup
  {
    key: 'location-types',
    label: 'Location Types',
    group: 'Conference Setup',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    key: 'session-types',
    label: 'Session Types',
    group: 'Conference Setup',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    key: 'sponsor-packages',
    label: 'Sponsor Packages',
    group: 'Conference Setup',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    key: 'portal-customization',
    label: 'Registration Portal',
    group: 'Conference Setup',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
    ),
  },
  {
    key: 'policies',
    label: 'Policies',
    group: 'Conference Setup',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  },
  {
    key: 'registration-questions',
    label: 'Registration Questions',
    group: 'Conference Setup',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  // CFP & Reviews
  {
    key: 'paper-form-builder',
    label: 'Paper Form',
    group: 'CFP & Reviews',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    key: 'score-scales',
    label: 'Score Scales',
    group: 'CFP & Reviews',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    ),
  },
  {
    key: 'review-criteria',
    label: 'Review Criteria',
    group: 'CFP & Reviews',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  // Communication
  {
    key: 'email-settings',
    label: 'Email Settings',
    group: 'Communication',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    key: 'email-templates',
    label: 'Email Templates',
    group: 'Communication',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    key: 'messaging-settings',
    label: 'Messaging',
    group: 'Communication',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    key: 'message-templates',
    label: 'Msg Templates',
    group: 'Communication',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
        />
      </svg>
    ),
  },
  {
    key: 'recipient-lists',
    label: 'Recipient Lists',
    group: 'Communication',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
        />
      </svg>
    ),
  },
  {
    key: 'screen-overlays',
    label: 'Screen Overlays',
    group: 'Communication',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  // Finance
  {
    key: 'financial-settings',
    label: 'Currency & Tax',
    group: 'Finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    key: 'invoice-number',
    label: 'Numbering',
    group: 'Finance',
    superOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
        />
      </svg>
    ),
  },
  {
    key: 'invoice-company-data',
    label: 'Company Data',
    group: 'Finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
  },
  {
    key: 'invoice-bank-accounts',
    label: 'Bank Accounts',
    group: 'Finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    ),
  },
  {
    key: 'invoice-template',
    label: 'Invoice Templates',
    group: 'Finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    key: 'zugferd-settings',
    label: 'ZUGFeRD',
    group: 'Finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    key: 'stripe-setup',
    label: 'Stripe Setup',
    group: 'Finance',
    superOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    ),
  },
];

const GROUP_ORDER = [
  'People & Roles',
  'Conference Setup',
  'CFP & Reviews',
  'Communication',
  'Finance',
];

function ConferenceSettingsTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const { user } = useAuth();
  const canAccessRestricted = user?.role === 'super_admin' || user?.role === 'tenant_admin';

  const groupedItems = useMemo(() => {
    const filtered = SETTINGS_NAV_ITEMS.filter((item) => !item.superOnly || canAccessRestricted);
    return filtered.reduce(
      (acc, item) => {
        if (!acc[item.group]) {
          acc[item.group] = [];
        }
        acc[item.group].push(item);
        return acc;
      },
      {} as Record<string, SettingsNavItem[]>
    );
  }, [canAccessRestricted]);

  const [activeTab, setActiveTab] = useState<ConferenceSettingsActiveTab>('volunteer-roles');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'volunteer-roles':
        return <ConferenceVolunteerRolesTab conference={conference} isAdmin={isAdmin} />;
      case 'location-types':
        return <ConferenceLocationTypesTab conference={conference} isAdmin={isAdmin} />;
      case 'sponsor-packages':
        return <ConferenceSponsorPackagesTab conference={conference} isAdmin={isAdmin} />;
      case 'session-types':
        return <ConferenceSessionTypesTab conference={conference} isAdmin={isAdmin} />;
      case 'committee-roles':
        return <ConferenceCommitteeRolesTab conference={conference} isAdmin={isAdmin} />;
      case 'score-scales':
        return <ConferenceScoreScalesTab conference={conference} isAdmin={isAdmin} />;
      case 'review-criteria':
        return <ConferenceReviewCriteriaTab conference={conference} isAdmin={isAdmin} />;
      case 'paper-form-builder':
        return <PaperFormBuilderTab conference={conference} isAdmin={isAdmin} />;
      case 'pronoun-options':
        return <PronounOptionsTab conference={conference} isAdmin={isAdmin} />;
      case 'email-templates':
        return <EmailTemplatesTab conference={conference} isAdmin={isAdmin} />;
      case 'email-settings':
        return <EmailSettingsTab conference={conference} isAdmin={isAdmin} />;
      case 'messaging-settings':
        return <MessagingSettingsTab conference={conference} isAdmin={isAdmin} />;
      case 'message-templates':
        return <MessageTemplatesTab conference={conference} isAdmin={isAdmin} />;
      case 'recipient-lists':
        return <RecipientListsTab conference={conference} isAdmin={isAdmin} />;
      case 'screen-overlays':
        return <ScreenOverlaysTab conference={conference} isAdmin={isAdmin} />;
      case 'portal-customization':
        return <PortalCustomizationTab conference={conference} isAdmin={isAdmin} />;
      case 'policies':
        return <PoliciesTab conference={conference} isAdmin={isAdmin} />;
      case 'registration-questions':
        return <RegistrationQuestionsTab conference={conference} isAdmin={isAdmin} />;
      case 'financial-settings':
        return <FinancialSettingsTab conference={conference} isAdmin={isAdmin} />;
      case 'invoice-number':
        return <InvoiceNumberTab conference={conference} isAdmin={isAdmin} />;
      case 'invoice-company-data':
        return <InvoiceCompanyDataTab conference={conference} isAdmin={isAdmin} />;
      case 'invoice-bank-accounts':
        return <InvoiceBankAccountsTab conference={conference} isAdmin={isAdmin} />;
      case 'invoice-template':
        return <InvoiceTemplateTab conference={conference} isAdmin={isAdmin} />;
      case 'zugferd-settings':
        return <ZugferdSettingsTab conference={conference} isAdmin={isAdmin} />;
      case 'stripe-setup':
        return <StripeSetupTab conference={conference} isAdmin={isAdmin} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex gap-6">
      {/* Vertical Sidebar Navigation */}
      <nav className={`flex-shrink-0 transition-all duration-200 ${isCollapsed ? 'w-14' : 'w-56'}`}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Collapse Toggle */}
          <div className="flex items-center justify-end px-2 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 rounded transition-colors"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  isCollapsed ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          </div>

          {GROUP_ORDER.map((group, groupIndex) => (
            <div key={group}>
              {groupIndex > 0 && <div className="border-t border-gray-200 dark:border-gray-700" />}
              {!isCollapsed && (
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {group}
                  </h3>
                </div>
              )}
              <ul className="py-1">
                {groupedItems[group]?.map((item) => (
                  <li key={item.key}>
                    <button
                      onClick={() => setActiveTab(item.key)}
                      title={isCollapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 py-2 text-sm transition-colors ${
                        isCollapsed ? 'justify-center px-2' : 'px-3'
                      } ${
                        activeTab === item.key
                          ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-l-2 border-transparent'
                      }`}
                    >
                      <span
                        className={
                          activeTab === item.key
                            ? 'text-primary-600'
                            : 'text-gray-400 dark:text-gray-500'
                        }
                      >
                        {item.icon}
                      </span>
                      {!isCollapsed && <span className="font-medium truncate">{item.label}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Content Area */}
      <div className="flex-1 min-w-0">{renderContent()}</div>
    </div>
  );
}

export default ConferenceSettingsTab;
