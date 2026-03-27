/**
 * Centralized React Query key factory.
 *
 * Use these functions to construct query keys consistently across the app.
 * This prevents typos, makes cache invalidation reliable, and provides
 * a single place to see all the data dependencies.
 *
 * Usage:
 *   queryKey: queryKeys.conferences.list(statusFilter)
 *   queryClient.invalidateQueries({ queryKey: queryKeys.conferences.all })
 */

export const queryKeys = {
  // ── Conferences ──────────────────────────────────────────────────
  conferences: {
    all: ['conferences'] as const,
    list: (statusFilter?: string) => ['conferences', statusFilter] as const,
    detail: (id: string | undefined) => ['conference', id] as const,
    stats: ['conference-stats'] as const,
    forSelect: ['conferences-for-select'] as const,
    forAccess: ['conferences-for-access'] as const,
  },

  // ── Volunteers ──────────────────────────────────────────────────
  volunteers: {
    all: ['volunteers'] as const,
    allList: ['all-volunteers'] as const,
    list: (statusFilter?: string) => ['volunteers', statusFilter] as const,
    stats: ['volunteer-stats'] as const,
    byConference: (conferenceId: string) => ['conference-volunteers', conferenceId] as const,
    profiles: (conferenceId: string) => ['volunteer-profiles', conferenceId] as const,
    roles: (conferenceId: string) => ['volunteer-roles', conferenceId] as const,
    sessionTasks: (conferenceId: string) => ['session-tasks', conferenceId] as const,
    assignments: (conferenceId: string) => ['volunteer-assignments', conferenceId] as const,
    schedule: (conferenceId: string) => ['volunteer-schedule', conferenceId] as const,
    scheduleUnassigned: (conferenceId: string) =>
      ['volunteer-schedule-unassigned', conferenceId] as const,
    conferenceList: (conferenceId: string) => ['conference-volunteers-list', conferenceId] as const,
  },

  // ── Locations ───────────────────────────────────────────────────
  locations: {
    all: ['locations'] as const,
    allList: ['all-locations'] as const,
    list: (typeFilter?: string) => ['locations', typeFilter] as const,
    stats: ['location-stats'] as const,
    byConference: (conferenceId: string) => ['conference-locations', conferenceId] as const,
    types: (conferenceId: string) => ['location-types', conferenceId] as const,
  },

  // ── Sponsors ────────────────────────────────────────────────────
  sponsors: {
    byConference: (conferenceId: string) => ['conference-sponsors', conferenceId] as const,
    packages: (conferenceId: string) => ['sponsor-packages', conferenceId] as const,
  },

  // ── Invoices ────────────────────────────────────────────────────
  invoices: {
    byConference: (conferenceId: string) => ['conference-invoices', conferenceId] as const,
    recipientSearch: (conferenceId: string, q: string) =>
      ['invoice-recipient-search', conferenceId, q] as const,
  },

  // ── Service Providers ───────────────────────────────────────────
  serviceProviders: {
    byConference: (conferenceId: string) => ['conference-service-providers', conferenceId] as const,
    byLocation: (locationId: string) => ['service-providers', locationId] as const,
  },

  // ── Booking ─────────────────────────────────────────────────────
  booking: {
    matrix: (conferenceId: string) => ['booking-matrix', conferenceId] as const,
    options: (conferenceId: string) => ['booking-options', conferenceId] as const,
    periods: (conferenceId: string) => ['booking-periods', conferenceId] as const,
    discountCodes: (conferenceId: string) => ['discount-codes', conferenceId] as const,
  },

  // ── Registration ────────────────────────────────────────────────
  registrations: {
    byConference: (conferenceId: string, ...rest: unknown[]) =>
      ['conference-registrations', conferenceId, ...rest] as const,
    bookableSessions: (conferenceId: string, optionId: string) =>
      ['bookable-sessions', conferenceId, optionId] as const,
  },

  // ── Deadlines ──────────────────────────────────────────────────
  deadlines: {
    byConference: (conferenceId: string) => ['conference-deadlines', conferenceId] as const,
  },

  // ── News ────────────────────────────────────────────────────────
  news: {
    byConference: (conferenceId: string) => ['conference-news', conferenceId] as const,
  },

  // ── Program ─────────────────────────────────────────────────────
  program: {
    days: (conferenceId: string) => ['program-days', conferenceId] as const,
    grid: (conferenceId: string, dayId?: string) => ['program-grid', conferenceId, dayId] as const,
    fullGrid: (conferenceId: string) => ['program-full-grid', conferenceId] as const,
    timeSlots: (conferenceId: string) => ['program-time-slots', conferenceId] as const,
    tracks: (conferenceId: string) => ['program-tracks', conferenceId] as const,
    sessions: (conferenceId: string) => ['program-sessions', conferenceId] as const,
    sessionTypes: (conferenceId: string) => ['program-session-types', conferenceId] as const,
    publishPreview: (conferenceId: string) => ['program-publish-preview', conferenceId] as const,
  },

  // ── Sessions ────────────────────────────────────────────────────
  sessions: {
    enriched: (conferenceId: string) => ['sessions-enriched', conferenceId] as const,
    types: (conferenceId: string) => ['session-types', conferenceId] as const,
  },

  // ── CFP ─────────────────────────────────────────────────────────
  cfp: {
    all: ['all-cfps'] as const,
    byConference: (conferenceId: string) => ['conference-cfps', conferenceId] as const,
    list: (conferenceId?: string) => ['cfp-list', conferenceId] as const,
    papers: (conferenceId?: string) => ['cfp-papers', conferenceId] as const,
    evaluatedPapers: (conferenceId?: string) => ['cfp-evaluated-papers', conferenceId] as const,
    selectedPapers: (filter: string, conferenceId?: string) =>
      ['cfp-selected-papers', filter, conferenceId] as const,
    applicants: (conferenceId?: string) => ['cfp-applicants', conferenceId ?? 'all'] as const,
    applicantsForMessaging: (conferenceId: string) =>
      ['cfp-applicants-for-messaging', conferenceId] as const,
    applicantPapers: (applicantId: string) => ['cfp-applicant-papers', applicantId] as const,
    topics: ['cfp-topics'] as const,
    committeeMembers: (conferenceId?: string) =>
      ['cfp-committee-members', conferenceId ?? 'all'] as const,
    applicantsForCommittee: ['cfp-applicants-for-committee'] as const,
    papersForDesign: (conferenceId: string, ...rest: unknown[]) =>
      ['papers', conferenceId, ...rest] as const,
  },

  // ── Assignments & Reviews ───────────────────────────────────────
  assignments: {
    conferences: ['conferences-for-assignments'] as const,
    conferenceCfp: (conferenceId: string) => ['conference-cfp', conferenceId] as const,
    papers: (conferenceId?: string) => ['assignment-papers', conferenceId] as const,
    byConference: (conferenceId: string) => ['conference-assignments', conferenceId] as const,
    committeeMembers: (conferenceId: string) =>
      ['assignment-committee-members', conferenceId] as const,
    paperAssignments: (paperId?: string) => ['paper-assignments', paperId] as const,
  },

  reviews: {
    byPaper: (paperId: string) => ['paper-reviews', paperId] as const,
  },

  // ── Messaging ───────────────────────────────────────────────────
  messaging: {
    threads: (conferenceId: string, ...filters: unknown[]) =>
      ['messaging-threads', conferenceId, ...filters] as const,
    thread: (conferenceId: string, threadId?: string | null) =>
      ['messaging-thread', conferenceId, threadId] as const,
    templates: (conferenceId: string) => ['message-templates', conferenceId] as const,
    recipientLists: (conferenceId: string) => ['recipient-lists', conferenceId] as const,
    recipientListDetail: (conferenceId: string, listId?: string | null) =>
      ['recipient-list-detail', conferenceId, listId] as const,
    committeeRoles: (conferenceId: string) => ['committee-roles', conferenceId] as const,
    systemLists: (conferenceId: string) => ['messaging-system-lists', conferenceId] as const,
    dynamicLists: (conferenceId: string) => ['messaging-dynamic-lists', conferenceId] as const,
    dynamicListDetail: (conferenceId: string, listId: string) =>
      ['messaging-dynamic-list-detail', conferenceId, listId] as const,
    recipientCount: (conferenceId: string) => ['messaging-recipient-count', conferenceId] as const,
  },

  // ── Attachments ─────────────────────────────────────────────────
  attachments: {
    list: (entityType: string, entityId: string) => ['attachments', entityType, entityId] as const,
  },

  // ── Settings ────────────────────────────────────────────────────
  settings: {
    platformCurrencies: ['platform-currencies'] as const,
    /** @deprecated Use queryKeys.pronounOptions instead */
    pronounOptions: (conferenceId: string) => ['pronoun-options', conferenceId] as const,
    paperFormSchema: (conferenceId: string) => ['paper-form-schema', conferenceId] as const,
    paperFormVariants: (conferenceId: string) => ['paper-form-variants', conferenceId] as const,
    paperFormHasSubmissions: (conferenceId: string) =>
      ['paper-form-schema-has-submissions', conferenceId] as const,
    reviewCriteria: (conferenceId: string) => ['review-criteria', conferenceId] as const,
    scoreScales: (conferenceId: string) => ['score-scales', conferenceId] as const,
    reviewFormSettings: (conferenceId: string) => ['review-form-settings', conferenceId] as const,
    emailTemplates: (conferenceId: string) => ['email-templates', conferenceId] as const,
  },

  // Use this for invoice settings
  invoiceSettings: (conferenceId: string) => ['invoice-settings', conferenceId] as const,
  badgeSettings: (conferenceId: string) => ['badge-settings', conferenceId] as const,
  stripeSettings: (conferenceId: string) => ['stripe-settings', conferenceId] as const,
  budgets: {
    byConference: (conferenceId: string) => ['conference-budgets', conferenceId] as const,
    detail: (conferenceId: string, budgetId: string) =>
      ['budget-detail', conferenceId, budgetId] as const,
    summary: (conferenceId: string, budgetId: string) =>
      ['budget-summary', conferenceId, budgetId] as const,
    categories: (conferenceId: string) => ['budget-categories', conferenceId] as const,
  },
  speakerExpenses: {
    byConference: (conferenceId: string) => ['speaker-expenses', conferenceId] as const,
    stats: (conferenceId: string) => ['speaker-expense-stats', conferenceId] as const,
    categories: (conferenceId: string) => ['expense-categories', conferenceId] as const,
    allowanceDefaults: (conferenceId: string) =>
      ['expense-allowance-defaults', conferenceId] as const,
    allowances: (conferenceId: string) => ['speaker-allowances', conferenceId] as const,
    tiers: (conferenceId: string) => ['expense-tiers', conferenceId] as const,
    settings: (conferenceId: string) => ['speaker-expense-settings', conferenceId] as const,
  },
  paymentReminders: {
    byConference: (conferenceId: string) => ['payment-reminders', conferenceId] as const,
    stats: (conferenceId: string) => ['payment-reminder-stats', conferenceId] as const,
    settings: (conferenceId: string) => ['payment-reminder-settings', conferenceId] as const,
  },

  // ── Analytics ────────────────────────────────────────────────────
  analytics: {
    revenue: (conferenceId: string) => ['analytics-revenue', conferenceId] as const,
    financialReport: (conferenceId: string) =>
      ['analytics-financial-report', conferenceId] as const,
    statsRegistrationsOverTime: (conferenceId: string) =>
      ['analytics-stats-registrations-over-time', conferenceId] as const,
    statsAttendeesLocation: (conferenceId: string) =>
      ['analytics-stats-attendees-location', conferenceId] as const,
    statsAttendeesCompany: (conferenceId: string) =>
      ['analytics-stats-attendees-company', conferenceId] as const,
    statsPapersOverTime: (conferenceId: string) =>
      ['analytics-stats-papers-over-time', conferenceId] as const,
    statsAttendeesPerDay: (conferenceId: string) =>
      ['analytics-stats-attendees-per-day', conferenceId] as const,
    statsTutorials: (conferenceId: string) => ['analytics-stats-tutorials', conferenceId] as const,
  },

  // ── Tenant-scoped pronoun options ────────────────────────────
  pronounOptions: ['pronoun-options'] as const,

  // ── Training Policies ─────────────────────────────────────────
  trainingPolicies: ['training-policies'] as const,

  // ── Training Registration Questions ──────────────────────────
  trainingRegistrationQuestions: ['training-registration-questions'] as const,

  // ── Training Email Settings + Templates ──────────────────────
  trainingEmailSettings: ['training-email-settings'] as const,
  trainingEmailTemplates: ['training-email-templates'] as const,

  // ── Training Finance ──────────────────────────────────────────────
  trainingFinance: ['training-finance'] as const,

  // ── Customer Offers ──────────────────────────────────────────
  customerOffers: (customerId: string) => ['customer-offers', customerId] as const,
  availablePlacements: (type?: string) =>
    type ? (['available-placements', type] as const) : (['available-placements'] as const),

  // ── Offer Attendees ────────────────────────────────────────
  offerAttendees: (offerId: string, placementId: string) =>
    ['offer-attendees', offerId, placementId] as const,

  // ── Offer Documents ────────────────────────────────────────
  offerDocuments: (offerId: string) => ['offer-documents', offerId] as const,
  offerDocument: (offerId: string, docId: string) => ['offer-document', offerId, docId] as const,
  offerDocumentVersions: (offerId: string, docId: string) =>
    ['offer-document-versions', offerId, docId] as const,

  // ── Trainers ───────────────────────────────────────────────────
  trainers: {},

  // ── Team & Users ────────────────────────────────────────────────
  team: {
    users: ['team-users'] as const,
    pronounOptions: ['user-pronoun-options'] as const,
    conferenceAccess: (userId: string) => ['user-conference-access', userId] as const,
  },

  // ── Admin ───────────────────────────────────────────────────────
  admin: {
    modules: ['modules'] as const,
    tenants: ['tenants'] as const,
    tenantModules: (tenantId: string) => ['tenant-modules', tenantId] as const,
    tenantUsers: (tenantId: string) => ['tenant-users', tenantId] as const,
    globalUnread: ['admin-global-unread'] as const,
    auditLogs: (...filters: unknown[]) => ['audit-logs', ...filters] as const,
    auditActions: ['audit-actions'] as const,
    auditResourceTypes: ['audit-resource-types'] as const,
    conferenceAccess: (conferenceId?: string, userId?: string) =>
      ['conference-access', conferenceId, userId] as const,
  },

  // ── Alumni ────────────────────────────────────────────────────────
  alumni: {
    byConference: (conferenceId: string) => ['conference-alumni', conferenceId] as const,
    check: (conferenceId: string, email: string) => ['alumni-check', conferenceId, email] as const,
  },

  // ── Portal ──────────────────────────────────────────────────────
  portal: {
    conferences: ['portal-conferences'] as const,
    tenant: (slug?: string) => ['portal-tenant', slug] as const,
    landing: (slug?: string, abbreviation?: string) =>
      ['portal-landing', slug, abbreviation] as const,
    papers: ['portal-papers'] as const,
    paper: (paperId: string) => ['portal-paper', paperId] as const,
    paperFeedback: (paperId: string) => ['portal-paper-feedback', paperId] as const,
    conferenceDetail: (conferenceId?: string) =>
      ['portal-conference-detail', conferenceId] as const,
    assignedPapers: ['portal-assigned-papers'] as const,
    pendingAssignments: ['portal-pending-assignments'] as const,
    committeeMemberships: ['portal-committee-memberships'] as const,
    topics: ['portal-topics'] as const,
    reviewConfig: (assignmentId: string) => ['portal-review-config', assignmentId] as const,
    messages: (showArchived?: boolean) => ['portal-messages', showArchived] as const,
    messageThread: (threadId?: string | null) => ['portal-message-thread', threadId] as const,
    unreadCount: ['portal-unread-count'] as const,
    news: ['portal-news'] as const,
    invitations: ['portal-invitations'] as const,
    cfpFormSchema: (cfpId?: string) => ['portal-cfp-form-schema', cfpId] as const,
  },

  // ── My Company ──────────────────────────────────────────────────
  myCompany: ['my-company'] as const,

  // ── Fiscal ─────────────────────────────────────────────────────
  fiscal: {
    taxInfo: (conferenceId: string, country?: string) =>
      ['tax-info', conferenceId, country] as const,
    representative: (conferenceId: string) => ['fiscal-representative', conferenceId] as const,
    vatRates: (conferenceId: string) => ['vat-rates', conferenceId] as const,
  },

  // ── Applicant Activity ──────────────────────────────────────────
  applicantActivity: {
    grouped: (...params: unknown[]) => ['applicant-activity-grouped', ...params] as const,
    types: ['applicant-activity-types'] as const,
  },
} as const;
