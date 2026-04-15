import type { HandbookCategory } from '../handbookSections';

export const trainingIntroCategory: HandbookCategory = {
  id: 'category-t-intro',
  name: 'Introduction',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-intro',
      title: 'Training Module Overview',
      categoryId: 'category-t-intro',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">The Training module lets you manage B2B training programs end-to-end: plan annual calendars, assign trainers, create customer offers, handle registrations, send invoices, and track revenue — all within a multi-tenant environment.</p>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Training Sidebar</h3>
<p class="text-gray-700 dark:text-gray-300 my-2">The left sidebar organizes all training features into groups:</p>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Setup</strong> — Training Program (per year: Design, Assign Trainers, Final), Offer Management, Customers, Trainers</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Settings</strong> — Training Setup (Catalog, Languages, Locations, Holidays, etc.), Communication (Email, Templates, Messaging), Finance (Currency, Numbering, Invoice Templates, Stripe, etc.), Offer Templates</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Operations</strong> — Registrations, Attendees, Parking Lot, Invoices, Pending Invoicing, Payment Reminders, Inhouse Trainings</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Communications</strong> — Messages, News</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Insights</strong> — Revenue, Training Statistics</li>
</ol>
<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">User Roles</h3>
<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Role</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Capabilities</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Super Admin</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Full access to all training features across all tenants</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Tenant Admin</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Manage trainings, trainers, customers, offers, and all settings</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Tenant Super User</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Can additionally delete customers, trainers, and program years</td></tr></tbody></table></div>
<p class="text-gray-700 dark:text-gray-300 my-2">Access to the training module requires the <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">trainings</code> module to be enabled for your tenant. Users without this module will not see the Trainings sidebar item.</p>`,
          }}
        />
      ),
    },
  ],
};
