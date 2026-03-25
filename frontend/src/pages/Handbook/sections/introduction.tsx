import type { HandbookCategory } from '../handbookSections';

export const introductionCategory: HandbookCategory = {
  id: 'category-intro',
  name: 'Introduction',
  description: '',
  sections: [
    {
      id: 'introduction',
      title: 'Introduction',
      categoryId: 'category-intro',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">SaaSConf is a multi-tenant platform for conference management. Each tenant (organization) manages multiple conferences with call for papers, registrations, invoicing, program scheduling, and more — all within a unified interface.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">User Roles</h3>
<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Role</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Scope</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Key Capabilities</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Super Admin</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Platform-wide</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Manage all tenants, configure modules, view audit logs</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Tenant Admin</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Own organization</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Create/delete conferences, invite users, configure all settings</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Conference Admin</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Assigned conferences</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Edit conference details, manage team, configure settings</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Team Member (Read-Only)</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Assigned conferences</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">View data, export reports</td></tr></tbody></table></div>
<p class="text-gray-700 dark:text-gray-300 my-2">Roles are assigned via the <strong>Team</strong> page in the main navigation (not the conference-level Team tab).</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Duplicate Conference</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">Tenant Admins can duplicate an existing conference to create next year's edition. Click the <strong>copy icon</strong> on any conference card in the Conferences list. The modal asks for a new name, abbreviation, and optional start date.</p>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>What gets copied:</strong> All configuration and settings — volunteer roles, committee roles, location types, currencies, budget categories, sponsor packages (with contract templates), booking periods/options/packages, discount codes, review system (scales, criteria, questions), email templates, screen overlays, paper form schema, session types, alumni, and the full conference settings (VAT rules, registration questions, invoice settings, speaker expenses, etc.). Pronoun options are tenant-scoped and shared across all conferences, so they are not duplicated.</p>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>What is NOT copied:</strong> Instance data — registrations, orders, attendees, invoices, papers, reviews, sponsors, program sessions, schedule slots, volunteers, budgets, bookings, and messages.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">The new conference is created as <strong>inactive</strong> and <strong>unpublished</strong> (draft). If a start date is provided, booking period dates are automatically recalculated using the same relative offsets from the original conference.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Conference Sidebar</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">When you open a conference, the left sidebar organizes all features into 7 groups:</p>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Event Setup</strong> — Details, Team, Social Media, Settings, Deadlines, Locations</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Content</strong> — Call for Papers (with sub-tabs), Program (with sub-tabs), Sessions</li>
<li class="text-gray-700 dark:text-gray-300"><strong>People</strong> — Program Committee, Speakers, Users, Attendees, Volunteers (with sub-tabs), Alumni</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Partnerships</strong> — Sponsors, Service Providers</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Registration & Finance</strong> — Booking Options, Registration, Invoices, Payment Reminders, Cost Management</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Communications</strong> — Messages, News</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Insights</strong> — Analytics (with sub-tabs)</li>
</ol>
<p class="text-gray-700 dark:text-gray-300 my-2">Some tabs are only visible when the corresponding module is enabled for your tenant. The sidebar can be collapsed to maximize workspace.</p>`,
          }}
        />
      ),
    },
  ],
};
