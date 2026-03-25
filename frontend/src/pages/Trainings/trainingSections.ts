import type React from 'react';
import {
  TrainingsIcon,
  SettingsGearIcon,
  TrainersIcon,
  ThemeIcon,
  TrainingsSettingsIcon,
  LocationsIcon,
  LocationTypesIcon,
  LanguagesIcon,
  CertificationBodyIcon,
  SyllabiIcon,
  PortalIcon,
  PoliciesIcon,
  RegistrationQuestionsIcon,
  EmailIcon,
  SystemEmailIcon,
  MessagingSettingsIcon,
  MessageTemplatesIcon,
  RecipientListsIcon,
  ScreenOverlaysIcon,
  CurrencyTaxIcon,
  NumberingIcon,
  CompanyDataIcon,
  BankAccountsIcon,
  InvoiceTemplatesIcon,
  ZugferdIcon,
  StripeIcon,
  PaymentRemindersSettingsIcon,
  RegistrationIcon,
  InvoicesIcon,
  PaymentRemindersIcon,
  MessagingIcon,
  NewsIcon,
  AnalyticsIcon,
  RevenueIcon,
  StatisticsIcon,
  HolidaysIcon,
  InhouseTrainingsIcon,
  CustomersIcon,
  AttendeesIcon,
  OfferTemplatesIcon,
} from './icons';

// ---------------------------------------------------------------------------
// Section navigation types
// ---------------------------------------------------------------------------

/** Static section IDs known at compile time. */
export type StaticSectionId =
  // Top-level
  | 'program'
  | 'inhouse-trainings'
  | 'offer-management'
  | 'customers'
  | 'attendees'
  | 'settings'
  | 'registrations'
  | 'invoices'
  | 'payment-reminders'
  | 'messages'
  | 'news'
  // Settings children
  | 'settings-trainers'
  | 'settings-theme'
  | 'settings-languages'
  | 'settings-trainings'
  | 'settings-certification-bodies'
  | 'settings-syllabi'
  | 'settings-holidays'
  | 'settings-locations'
  | 'settings-location-types'
  | 'settings-registration-portal'
  | 'settings-policies'
  | 'settings-registration-questions'
  | 'settings-email'
  | 'settings-system-email-templates'
  | 'settings-messaging'
  | 'settings-message-templates'
  | 'settings-recipient-lists'
  | 'settings-screen-overlays'
  | 'settings-currency-tax'
  | 'settings-numbering'
  | 'settings-company-data'
  | 'settings-bank-accounts'
  | 'settings-invoice-templates'
  | 'settings-zugferd'
  | 'settings-stripe'
  | 'settings-payment-reminders'
  | 'settings-offer-templates'
  // Analytics children
  | 'analytics'
  | 'analytics-revenue'
  | 'analytics-statistics';

/**
 * Section IDs include static IDs plus dynamic program-year IDs
 * like `program-2026-design`, `program-2026-trainers`, `program-2026-final`.
 */
export type TrainingSectionId =
  | StaticSectionId
  | `program-${number}-${'design' | 'trainers' | 'final'}`;

export interface TrainingSectionChild {
  id: TrainingSectionId;
  name: string;
  icon: () => React.JSX.Element;
  group?: string;
}

export interface TrainingSectionDef {
  id: TrainingSectionId;
  name: string;
  icon: () => React.JSX.Element;
  children?: TrainingSectionChild[];
}

export interface TrainingSectionGroup {
  name: string;
  sections: TrainingSectionDef[];
}

// ---------------------------------------------------------------------------
// Grouped section definitions
// ---------------------------------------------------------------------------

export const sectionGroups: TrainingSectionGroup[] = [
  {
    name: 'Setup',
    sections: [
      { id: 'program', name: 'Training Program', icon: TrainingsIcon, children: [] },
      { id: 'inhouse-trainings', name: 'Inhouse Trainings', icon: InhouseTrainingsIcon },
      { id: 'offer-management', name: 'Offer Management', icon: OfferTemplatesIcon },
      { id: 'customers', name: 'Customers', icon: CustomersIcon },
      { id: 'attendees', name: 'Attendees', icon: AttendeesIcon },
      {
        id: 'settings',
        name: 'Settings',
        icon: SettingsGearIcon,
        children: [
          // Training Setup
          {
            id: 'settings-trainers',
            name: 'Trainers',
            icon: TrainersIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-theme',
            name: 'Themes',
            icon: ThemeIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-languages',
            name: 'Languages',
            icon: LanguagesIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-certification-bodies',
            name: 'Certification Bodies',
            icon: CertificationBodyIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-syllabi',
            name: 'Syllabus',
            icon: SyllabiIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-trainings',
            name: 'Training Catalog',
            icon: TrainingsSettingsIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-locations',
            name: 'Locations',
            icon: LocationsIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-location-types',
            name: 'Location Types',
            icon: LocationTypesIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-holidays',
            name: 'Holidays',
            icon: HolidaysIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-registration-portal',
            name: 'Registration Portal',
            icon: PortalIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-policies',
            name: 'Policies',
            icon: PoliciesIcon,
            group: 'Training Setup',
          },
          {
            id: 'settings-registration-questions',
            name: 'Registration Questions',
            icon: RegistrationQuestionsIcon,
            group: 'Training Setup',
          },
          // Communication
          {
            id: 'settings-email',
            name: 'Email Settings',
            icon: EmailIcon,
            group: 'Communication',
          },
          {
            id: 'settings-system-email-templates',
            name: 'System Email Templates',
            icon: SystemEmailIcon,
            group: 'Communication',
          },
          {
            id: 'settings-messaging',
            name: 'Messaging',
            icon: MessagingSettingsIcon,
            group: 'Communication',
          },
          {
            id: 'settings-message-templates',
            name: 'Message Templates',
            icon: MessageTemplatesIcon,
            group: 'Communication',
          },
          {
            id: 'settings-recipient-lists',
            name: 'Recipient Lists',
            icon: RecipientListsIcon,
            group: 'Communication',
          },
          {
            id: 'settings-screen-overlays',
            name: 'Screen Overlays',
            icon: ScreenOverlaysIcon,
            group: 'Communication',
          },
          // Finance
          {
            id: 'settings-currency-tax',
            name: 'Currency & Tax',
            icon: CurrencyTaxIcon,
            group: 'Finance',
          },
          {
            id: 'settings-numbering',
            name: 'Numbering',
            icon: NumberingIcon,
            group: 'Finance',
          },
          {
            id: 'settings-company-data',
            name: 'Company Data',
            icon: CompanyDataIcon,
            group: 'Finance',
          },
          {
            id: 'settings-bank-accounts',
            name: 'Bank Accounts',
            icon: BankAccountsIcon,
            group: 'Finance',
          },
          {
            id: 'settings-invoice-templates',
            name: 'Invoice Templates',
            icon: InvoiceTemplatesIcon,
            group: 'Finance',
          },
          {
            id: 'settings-zugferd',
            name: 'ZUGFeRD',
            icon: ZugferdIcon,
            group: 'Finance',
          },
          {
            id: 'settings-stripe',
            name: 'Stripe Setup',
            icon: StripeIcon,
            group: 'Finance',
          },
          {
            id: 'settings-payment-reminders',
            name: 'Payment Reminders',
            icon: PaymentRemindersSettingsIcon,
            group: 'Finance',
          },
          // Offers
          {
            id: 'settings-offer-templates',
            name: 'Offer Templates',
            icon: OfferTemplatesIcon,
            group: 'Offers',
          },
        ],
      },
    ],
  },
  {
    name: 'Operations',
    sections: [
      { id: 'registrations', name: 'Registrations', icon: RegistrationIcon },
      { id: 'invoices', name: 'Invoices', icon: InvoicesIcon },
      { id: 'payment-reminders', name: 'Payment Reminders', icon: PaymentRemindersIcon },
    ],
  },
  {
    name: 'Communications',
    sections: [
      { id: 'messages', name: 'Messages', icon: MessagingIcon },
      { id: 'news', name: 'News', icon: NewsIcon },
    ],
  },
  {
    name: 'Insights',
    sections: [
      {
        id: 'analytics',
        name: 'Analytics',
        icon: AnalyticsIcon,
        children: [
          { id: 'analytics-revenue', name: 'Revenue', icon: RevenueIcon },
          { id: 'analytics-statistics', name: 'Trainings Statistics', icon: StatisticsIcon },
        ],
      },
    ],
  },
];
