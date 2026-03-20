import type { HandbookCategory } from '../handbookSections';

export const appendixCategory: HandbookCategory = {
  id: 'category-appendix',
  name: 'Appendix',
  description: '',
  sections: [
    {
      id: 'appendix',
      title: 'Appendix',
      categoryId: 'category-appendix',
      content: () => <div dangerouslySetInnerHTML={{ __html: `` }} />,
    },
    {
      id: 'glossary',
      title: 'Glossary',
      categoryId: 'category-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Term</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Definition</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Option</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A purchasable registration item (e.g., "Day 1 Pass", "Tutorial")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Period</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A time window with specific pricing (e.g., "Early Bird")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Package</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A bundle of multiple booking options at a combined price</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>CFP</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Call for Papers — the submission and review process for academic/technical papers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Credit Note</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A negative invoice issued when cancelling a sent invoice</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Discount Code</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A code that applies a percentage or fixed reduction to registration pricing</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Dynamic Recipient List</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A filter-based list that resolves recipients at send time based on criteria (e.g., registrations by booking option, sponsors by package)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Module</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A feature set that can be enabled/disabled per tenant (e.g., cfp, invoices, volunteers)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Paper Form Variant</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A role-specific version of the paper submission form with custom field configuration</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Portal</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">The public-facing website where attendees register and applicants submit papers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>RLS</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Row-Level Security — database-level tenant data isolation</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Reverse Charge</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">EU VAT mechanism where the buyer (not seller) accounts for VAT on cross-border B2B services</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Screen Overlay</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A full-screen announcement shown to portal users on login</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>System Role</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A predefined User Role (Keynote, Tutorial, Social Event, Bonus Session, Active Session, Sponsor Talk) that cannot be deleted or renamed</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Tenant</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">An organization using SaaSConf (each tenant's data is fully isolated)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>VIES</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">EU VAT Information Exchange System — online service for validating EU VAT numbers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>User Role</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A conference-scoped role for categorizing participants (e.g., Keynote, Tutorial) with assignable members</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>ZUGFeRD</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">German/EU standard for hybrid invoices (PDF with embedded XML for automated processing)</td></tr></tbody></table></div>`,
          }}
        />
      ),
    },
    {
      id: 'getting-help',
      title: 'Getting Help',
      categoryId: 'category-appendix',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Technical Support</strong>: support@saasconf.com</li>
<li class="text-gray-700 dark:text-gray-300"><strong>VAT Questions</strong>: Consult your tax advisor — SaaSConf provides calculation tools but not tax advice</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Feature Requests</strong>: Submit via platform feedback form</li>
</ul>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Unsaved Changes</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">All forms across the platform use explicit save — changes are only persisted when you click <strong>Save Changes</strong>. When you have unsaved changes, a <strong>Discard</strong> button appears to revert to the last saved state. If you try to navigate away (switch tabs, close the panel, or leave the page) with unsaved changes, a confirmation dialog asks whether to stay or leave. On standalone pages like My Company, closing the browser tab with unsaved changes also triggers a native browser warning.</p>`,
          }}
        />
      ),
    },
  ],
};
