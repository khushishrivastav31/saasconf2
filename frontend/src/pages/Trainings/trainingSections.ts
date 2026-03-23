import type React from 'react';
import {
  UsersIcon,
  ShareIcon,
  TrainingsIcon,
  SettingsGearIcon,
  TrainersIcon,
  SyllabiIcon,
  TrainingsSettingsIcon,
  PronounIcon,
  LocationTypesIcon,
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
} from './icons';

// ---------------------------------------------------------------------------
// Section navigation types
// ---------------------------------------------------------------------------

export type TrainingSectionId =
  // Top-level
  | 'team'
  | 'social'
  | 'trainings-list'
  | 'settings'
  | 'registrations'
  | 'invoices'
  | 'payment-reminders'
  | 'messages'
  | 'news'
  // Settings children
  | 'settings-trainers'
  | 'settings-syllabi'
  | 'settings-trainings'
  | 'settings-pronoun-options'
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
  // Analytics children
  | 'analytics'
  | 'analytics-revenue'
  | 'analytics-statistics';

export interface TrainingSectionChild {
  id: TrainingSectionId;
  name: string;
  icon: () => React.JSX.Element;
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
      { id: 'team', name: 'Team', icon: UsersIcon },
      { id: 'social', name: 'Social Media', icon: ShareIcon },
      { id: 'trainings-list', name: 'Trainings', icon: TrainingsIcon },
      {
        id: 'settings',
        name: 'Settings',
        icon: SettingsGearIcon,
        children: [
          { id: 'settings-trainers', name: 'Trainers', icon: TrainersIcon },
          { id: 'settings-syllabi', name: 'Syllabi', icon: SyllabiIcon },
          { id: 'settings-trainings', name: 'Trainings', icon: TrainingsSettingsIcon },
          { id: 'settings-pronoun-options', name: 'Pronoun Options', icon: PronounIcon },
          { id: 'settings-location-types', name: 'Location Types', icon: LocationTypesIcon },
          {
            id: 'settings-registration-portal',
            name: 'Registration Portal',
            icon: PortalIcon,
          },
          { id: 'settings-policies', name: 'Policies', icon: PoliciesIcon },
          {
            id: 'settings-registration-questions',
            name: 'Registration Questions',
            icon: RegistrationQuestionsIcon,
          },
          { id: 'settings-email', name: 'Email Settings', icon: EmailIcon },
          {
            id: 'settings-system-email-templates',
            name: 'System Email Templates',
            icon: SystemEmailIcon,
          },
          { id: 'settings-messaging', name: 'Messaging', icon: MessagingSettingsIcon },
          {
            id: 'settings-message-templates',
            name: 'Message Templates',
            icon: MessageTemplatesIcon,
          },
          { id: 'settings-recipient-lists', name: 'Recipient Lists', icon: RecipientListsIcon },
          { id: 'settings-screen-overlays', name: 'Screen Overlays', icon: ScreenOverlaysIcon },
          { id: 'settings-currency-tax', name: 'Currency & Tax', icon: CurrencyTaxIcon },
          { id: 'settings-numbering', name: 'Numbering', icon: NumberingIcon },
          { id: 'settings-company-data', name: 'Company Data', icon: CompanyDataIcon },
          { id: 'settings-bank-accounts', name: 'Bank Accounts', icon: BankAccountsIcon },
          {
            id: 'settings-invoice-templates',
            name: 'Invoice Templates',
            icon: InvoiceTemplatesIcon,
          },
          { id: 'settings-zugferd', name: 'ZUGFeRD', icon: ZugferdIcon },
          { id: 'settings-stripe', name: 'Stripe Setup', icon: StripeIcon },
          {
            id: 'settings-payment-reminders',
            name: 'Payment Reminders',
            icon: PaymentRemindersSettingsIcon,
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
