import { describe, it, expect } from 'vitest';
import { sectionGroups } from '../conferenceSections';

/**
 * Snapshot test for conference sidebar sections.
 *
 * If a tab disappears (removed from the array, import error, etc.)
 * this test will fail and flag the missing section immediately.
 * Update the expected lists below when intentionally adding/removing tabs.
 */

describe('conferenceSections', () => {
  it('contains all expected section groups', () => {
    const groupNames = sectionGroups.map((g) => g.name);
    expect(groupNames).toEqual([
      'Event Setup',
      'Content',
      'People',
      'Partnerships',
      'Registration & Finance',
      'Communications',
      'Insights',
    ]);
  });

  it('contains all expected top-level sections', () => {
    const allSections = sectionGroups.flatMap((g) => g.sections.map((s) => s.id));
    expect(allSections).toEqual([
      // Event Setup
      'details',
      'team',
      'social',
      'settings',
      'deadlines',
      'locations',
      // Content
      'cfp',
      'program',
      'sessions',
      // People
      'cfp-program-committee',
      'speakers',
      'cfp-applicants',
      'attendees',
      'badges',
      'volunteers',
      'alumni',
      // Partnerships
      'sponsors',
      'service_providers',
      // Registration & Finance
      'booking',
      'registration',
      'invoices',
      'payment-reminders',
      'cost-management',
      // Communications
      'messaging',
      'news',
      // Insights
      'analytics',
    ]);
  });

  it('contains all expected child sections', () => {
    const allChildren = sectionGroups.flatMap((g) =>
      g.sections.flatMap((s) => (s.children ?? []).map((c) => c.id))
    );
    expect(allChildren).toEqual([
      // CFP children
      'cfp-topics',
      'cfp-papers',
      'cfp-assignments',
      'cfp-evaluated-papers',
      'cfp-accepted-papers',
      'cfp-rejected-papers',
      // Program children
      'program-design',
      'program-build',
      // Speaker role children
      'role-keynote',
      'role-tutorial',
      'role-social-event',
      'role-bonus-session',
      'role-active-session',
      'role-sponsor-talk',
      // Volunteer children
      'volunteer-task-assignment',
      'volunteer-assignment',
      'volunteer-schedule',
      // Cost Management children
      'budget-planning',
      'speaker-expenses',
      // Analytics children
      'analytics-questions',
      'analytics-statistics',
      'analytics-revenue',
      'analytics-financial',
    ]);
  });

  it('every section has a name and icon function', () => {
    for (const group of sectionGroups) {
      for (const section of group.sections) {
        expect(section.name).toBeTruthy();
        expect(typeof section.icon).toBe('function');
        if (section.children) {
          for (const child of section.children) {
            expect(child.name).toBeTruthy();
            expect(typeof child.icon).toBe('function');
          }
        }
      }
    }
  });

  it('has no duplicate section IDs', () => {
    const allIds = sectionGroups.flatMap((g) =>
      g.sections.flatMap((s) => [s.id, ...(s.children ?? []).map((c) => c.id)])
    );
    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);
  });
});
