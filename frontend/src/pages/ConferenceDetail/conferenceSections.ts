import type React from 'react';
import {
  AlumniIcon,
  BadgesIcon,
  DeadlinesIcon,
  InfoIcon,
  UsersIcon,
  ShareIcon,
  BookingIcon,
  SettingsGearIcon,
  SessionsIcon,
  SpeakerIcon,
  AttendeesIcon,
  PeopleIcon,
  SponsorsIcon,
  MapIcon,
  PaperIcon,
  ServiceProvidersIcon,
  InvoicesIcon,
  ProgramIcon,
  ProgramDesignIcon,
  ProgramBuildIcon,
  AnalyticsIcon,
  AnalyticsQuestionsIcon,
  MessagingIcon,
  NewsIcon,
  RegistrationIcon,
  PaymentRemindersIcon,
  CfpTagIcon,
  CfpUsersGroupIcon,
  CfpInboxIcon,
  CfpDocumentTextIcon,
  CfpEvaluatedIcon,
  CfpThumbUpIcon,
  CfpThumbDownIcon,
  CfpAssignmentsIcon,
  TaskAssignmentIcon,
  VolunteerAssignmentIcon,
  VolunteerScheduleIcon,
  CostManagementIcon,
  BudgetPlanningIcon,
  SpeakerExpensesIcon,
  ConferenceStatisticsIcon,
  RevenueTrackingIcon,
  FinancialReportIcon,
} from './icons';

// ---------------------------------------------------------------------------
// Section navigation types
// ---------------------------------------------------------------------------

export type SectionId =
  | 'details'
  | 'team'
  | 'social'
  | 'booking'
  | 'alumni'
  | 'deadlines'
  | 'messaging'
  | 'news'
  | 'volunteers'
  | 'locations'
  | 'cfp'
  | 'cfp-topics'
  | 'cfp-program-committee'
  | 'cfp-applicants'
  | 'cfp-papers'
  | 'cfp-assignments'
  | 'cfp-evaluated-papers'
  | 'cfp-accepted-papers'
  | 'cfp-rejected-papers'
  | 'sessions'
  | 'speakers'
  | 'attendees'
  | 'sponsors'
  | 'analytics'
  | 'analytics-questions'
  | 'analytics-statistics'
  | 'analytics-revenue'
  | 'analytics-financial'
  | 'service_providers'
  | 'program'
  | 'program-design'
  | 'program-build'
  | 'invoices'
  | 'payment-reminders'
  | 'cost-management'
  | 'budget-planning'
  | 'speaker-expenses'
  | 'badges'
  | 'registration'
  | 'volunteer-task-assignment'
  | 'volunteer-assignment'
  | 'volunteer-schedule'
  | 'role-keynote'
  | 'role-tutorial'
  | 'role-social-event'
  | 'role-bonus-session'
  | 'role-active-session'
  | 'role-sponsor-talk'
  | 'settings';

export interface SectionChild {
  id: SectionId;
  name: string;
  icon: () => React.JSX.Element;
}

export interface SectionDef {
  id: SectionId;
  name: string;
  icon: () => React.JSX.Element;
  moduleCode?: string; // If set, only show when user has this module assigned
  children?: SectionChild[];
}

export interface SectionGroup {
  name: string;
  sections: SectionDef[];
}

// ---------------------------------------------------------------------------
// Grouped section definitions
// ---------------------------------------------------------------------------

export const sectionGroups: SectionGroup[] = [
  {
    name: 'Event Setup',
    sections: [
      { id: 'details', name: 'Details', icon: InfoIcon },
      { id: 'team', name: 'Team', icon: UsersIcon },
      { id: 'social', name: 'Social Media', icon: ShareIcon },
      { id: 'settings', name: 'Settings', icon: SettingsGearIcon },
      { id: 'deadlines', name: 'Deadlines', icon: DeadlinesIcon },
      { id: 'locations', name: 'Locations', icon: MapIcon, moduleCode: 'locations' },
    ],
  },
  {
    name: 'Content',
    sections: [
      {
        id: 'cfp',
        name: 'Call for Papers',
        icon: PaperIcon,
        moduleCode: 'cfp',
        children: [
          { id: 'cfp-topics', name: 'Topics', icon: CfpTagIcon },
          { id: 'cfp-papers', name: 'Papers', icon: CfpDocumentTextIcon },
          { id: 'cfp-assignments', name: 'Assignments', icon: CfpAssignmentsIcon },
          { id: 'cfp-evaluated-papers', name: 'Evaluated Papers', icon: CfpEvaluatedIcon },
          { id: 'cfp-accepted-papers', name: 'Accepted Papers', icon: CfpThumbUpIcon },
          { id: 'cfp-rejected-papers', name: 'Rejected Papers', icon: CfpThumbDownIcon },
        ],
      },
      {
        id: 'program',
        name: 'Program',
        icon: ProgramIcon,
        moduleCode: 'program',
        children: [
          { id: 'program-design', name: 'Design', icon: ProgramDesignIcon },
          { id: 'program-build', name: 'Build', icon: ProgramBuildIcon },
        ],
      },
      { id: 'sessions', name: 'Sessions', icon: SessionsIcon, moduleCode: 'sessions' },
    ],
  },
  {
    name: 'People',
    sections: [
      {
        id: 'cfp-program-committee',
        name: 'Program Committee',
        icon: CfpUsersGroupIcon,
        moduleCode: 'cfp',
      },
      {
        id: 'speakers',
        name: 'Speakers',
        icon: SpeakerIcon,
        moduleCode: 'speakers',
        children: [
          { id: 'role-keynote', name: 'Keynotes', icon: SpeakerIcon },
          { id: 'role-tutorial', name: 'Tutorials', icon: SessionsIcon },
          { id: 'role-social-event', name: 'Social Events', icon: PeopleIcon },
          { id: 'role-bonus-session', name: 'Bonus Sessions', icon: SessionsIcon },
          { id: 'role-active-session', name: 'Active Sessions', icon: SessionsIcon },
          { id: 'role-sponsor-talk', name: 'Sponsor Talks', icon: SpeakerIcon },
        ],
      },
      { id: 'cfp-applicants', name: 'Users', icon: CfpInboxIcon, moduleCode: 'cfp' },
      { id: 'attendees', name: 'Attendees', icon: AttendeesIcon, moduleCode: 'attendees' },
      { id: 'badges', name: 'Badges', icon: BadgesIcon },
      {
        id: 'volunteers',
        name: 'Volunteers',
        icon: PeopleIcon,
        moduleCode: 'volunteers',
        children: [
          { id: 'volunteer-task-assignment', name: 'Task Assignment', icon: TaskAssignmentIcon },
          {
            id: 'volunteer-assignment',
            name: 'Volunteer Assignment',
            icon: VolunteerAssignmentIcon,
          },
          { id: 'volunteer-schedule', name: 'Volunteer Schedule', icon: VolunteerScheduleIcon },
        ],
      },
      { id: 'alumni', name: 'Alumni', icon: AlumniIcon },
    ],
  },
  {
    name: 'Partnerships',
    sections: [
      { id: 'sponsors', name: 'Sponsors', icon: SponsorsIcon, moduleCode: 'sponsors' },
      {
        id: 'service_providers',
        name: 'Service Providers',
        icon: ServiceProvidersIcon,
        moduleCode: 'service_providers',
      },
    ],
  },
  {
    name: 'Registration & Finance',
    sections: [
      { id: 'booking', name: 'Booking Options', icon: BookingIcon },
      {
        id: 'registration',
        name: 'Registration',
        icon: RegistrationIcon,
        moduleCode: 'registration',
      },
      { id: 'invoices', name: 'Invoices', icon: InvoicesIcon, moduleCode: 'invoices' },
      {
        id: 'payment-reminders',
        name: 'Payment Reminders',
        icon: PaymentRemindersIcon,
        moduleCode: 'invoices',
      },
      {
        id: 'cost-management',
        name: 'Cost Management',
        icon: CostManagementIcon,
        moduleCode: 'invoices',
        children: [
          { id: 'budget-planning', name: 'Budget Planning', icon: BudgetPlanningIcon },
          { id: 'speaker-expenses', name: 'Speaker Expenses', icon: SpeakerExpensesIcon },
        ],
      },
    ],
  },
  {
    name: 'Communications',
    sections: [
      { id: 'messaging', name: 'Messages', icon: MessagingIcon },
      { id: 'news', name: 'News', icon: NewsIcon, moduleCode: 'news' },
    ],
  },
  {
    name: 'Insights',
    sections: [
      {
        id: 'analytics',
        name: 'Analytics',
        icon: AnalyticsIcon,
        moduleCode: 'analytics',
        children: [
          {
            id: 'analytics-questions',
            name: 'Registration Questions',
            icon: AnalyticsQuestionsIcon,
          },
          {
            id: 'analytics-statistics',
            name: 'Conference Statistics',
            icon: ConferenceStatisticsIcon,
          },
          { id: 'analytics-revenue', name: 'Revenue Tracking', icon: RevenueTrackingIcon },
          { id: 'analytics-financial', name: 'Financial Reports', icon: FinancialReportIcon },
        ],
      },
    ],
  },
];
