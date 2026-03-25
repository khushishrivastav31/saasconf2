import type { HandbookCategory } from '../handbookSections';

export const trainingsCategory: HandbookCategory = {
  id: 'category-10',
  name: 'Training Programs',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: '10-1-design-program',
      title: 'Design Program',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Plan annual training programs using a visual year calendar. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">trainings</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create program years (e.g. 2026, 2027)</li>
<li class="text-gray-700 dark:text-gray-300">Drag trainings from the catalog sidebar onto calendar dates</li>
<li class="text-gray-700 dark:text-gray-300">Assign locations to placements</li>
<li class="text-gray-700 dark:text-gray-300">View weekends (blue) and holidays/blocked days (purple) on the grid</li>
<li class="text-gray-700 dark:text-gray-300">Remove or reposition placements</li>
</ul>
<strong>Dependencies:</strong> Trainings must exist in the Training Catalog. Locations are optional. Holiday configs determine which dates are highlighted.`,
          }}
        />
      ),
    },
    {
      id: '10-2-assign-trainers',
      title: 'Assign Trainers',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Assign trainers to training placements using drag-and-drop.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Drag a trainer from the sidebar onto a training bar in the calendar to assign</li>
<li class="text-gray-700 dark:text-gray-300">Click a training bar to view/manage assigned trainers</li>
<li class="text-gray-700 dark:text-gray-300">Remove trainer assignments from the detail panel</li>
<li class="text-gray-700 dark:text-gray-300">Filter calendar by trainer to see their schedule</li>
<li class="text-gray-700 dark:text-gray-300">Automatic conflict detection: warns about unavailability periods and double-bookings</li>
<li class="text-gray-700 dark:text-gray-300">Override conflicts with confirmation dialog</li>
</ul>
<strong>Dependencies:</strong> Placements must exist (Design Program). Trainers must be registered with active status.`,
          }}
        />
      ),
    },
    {
      id: '10-2b-trainer-settings',
      title: 'Trainer Settings',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage trainer profiles and settings used across the training module.</p>
<strong>Trainer Profiles:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create and edit trainer profiles with name, email, phone, pronouns, and bio (vita)</li>
<li class="text-gray-700 dark:text-gray-300">Upload a trainer photo</li>
<li class="text-gray-700 dark:text-gray-300">Mark trainers as internal or external</li>
<li class="text-gray-700 dark:text-gray-300">Assign trainings and languages to trainers</li>
<li class="text-gray-700 dark:text-gray-300">Manage unavailability periods per trainer</li>
</ul>
<strong>Pronoun Options:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Pronoun options are managed at the tenant level via <strong>Pronoun Options</strong> in the main navigation</li>
<li class="text-gray-700 dark:text-gray-300">The same options are shared across conferences (registration, CFP) and trainings (trainer profiles)</li>
<li class="text-gray-700 dark:text-gray-300">Active options appear as a dropdown on the trainer form</li>
<li class="text-gray-700 dark:text-gray-300">The selected pronoun is stored as a plain text string on the trainer profile</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: '10-2c-policies',
      title: 'Training Policies',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure legal and compliance policies displayed on training registration portals.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable 5 policy types: Privacy Policy, Cookies Policy, Imprint, Terms &amp; Conditions, Code of Conduct</li>
<li class="text-gray-700 dark:text-gray-300">Set each policy as an <strong>External URL</strong> (opens in new tab) or <strong>Inline Content</strong> (rich text, opens in modal)</li>
<li class="text-gray-700 dark:text-gray-300">When Terms &amp; Conditions are enabled, a consent checkbox is required during registration</li>
</ul>
<strong>Scope:</strong> Training policies are configured at the tenant level and shared across all trainings. Navigate to <strong>Trainings &rarr; Settings &rarr; Policies</strong>.`,
          }}
        />
      ),
    },
    {
      id: '10-2d-registration-questions',
      title: 'Registration Questions',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Define custom questions shown to registrants on training registration portals.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable registration questions</li>
<li class="text-gray-700 dark:text-gray-300">Add questions of 4 types: <strong>Text Field</strong>, <strong>Checkbox</strong>, <strong>Radio Buttons</strong>, <strong>Dropdown</strong></li>
<li class="text-gray-700 dark:text-gray-300">Mark questions as mandatory or optional</li>
<li class="text-gray-700 dark:text-gray-300">Add help text (rich text) below each question</li>
<li class="text-gray-700 dark:text-gray-300">Reorder questions with up/down buttons</li>
<li class="text-gray-700 dark:text-gray-300">Toggle individual questions active/inactive</li>
<li class="text-gray-700 dark:text-gray-300">Preview the portal view with a live preview</li>
</ul>
<strong>Scope:</strong> Registration questions are configured at the tenant level and shared across all trainings. Navigate to <strong>Trainings &rarr; Settings &rarr; Registration Questions</strong>.`,
          }}
        />
      ),
    },
    {
      id: '10-2e-email-settings',
      title: 'Email Settings & Templates',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure email sending and customize templates for training communications.</p>
<strong>Email Settings:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable outgoing training emails</li>
<li class="text-gray-700 dark:text-gray-300">Customize email header and footer HTML (branding, logos, disclaimers)</li>
</ul>
<strong>Email Templates (7 types):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Registration: confirmation, cancellation, attendee welcome</li>
<li class="text-gray-700 dark:text-gray-300">Invoicing: invoice send, first payment reminder, second payment reminder, overdue admin alert</li>
<li class="text-gray-700 dark:text-gray-300">Each template supports placeholders like [Training Name], [First Name], [Invoice Number], etc.</li>
<li class="text-gray-700 dark:text-gray-300">Customized templates can be reset to defaults</li>
</ul>
<strong>Scope:</strong> Email settings and templates are configured at the tenant level and shared across all trainings. Navigate to <strong>Trainings &rarr; Settings &rarr; Email</strong> and <strong>Email Templates</strong>.`,
          }}
        />
      ),
    },
    {
      id: '10-2f-finance',
      title: 'Finance Settings',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure financial settings for training invoicing and payments.</p>
<strong>8 Finance Tabs:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Currency &amp; Tax</strong> — Set transaction/invoice currencies, number format, exchange rate, and VAT decision rules</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Numbering</strong> — Configure invoice and cancellation number templates with auto-incrementing counters</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Company Data</strong> — Set company name, address, VAT/tax IDs, contact info. Auto-populate from My Company</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Bank Accounts</strong> — Manage multiple bank accounts with IBAN/BIC, set default for invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Invoice Templates</strong> — Customize invoice body HTML for bank transfer, credit card, and credit note types. Set header/footer and page format</li>
<li class="text-gray-700 dark:text-gray-300"><strong>ZUGFeRD</strong> — Enable/disable EN16931 e-invoicing (auto-configured from company data)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Stripe Setup</strong> — Configure Stripe payment keys and bank transfer countries</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Payment Reminders</strong> — Enable reminders with configurable day intervals and admin notification</li>
</ul>
<strong>Scope:</strong> All finance settings are configured at the tenant level and shared across all trainings. Navigate to <strong>Trainings &rarr; Settings &rarr; Finance</strong> section.`,
          }}
        />
      ),
    },
    {
      id: '10-3-final-program',
      title: 'Final Program',
      categoryId: 'category-10',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Publish the finalized program and notify trainers with their personal schedules.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Publish:</strong> Creates a snapshot of the current program and emails all assigned trainers a PDF with their personal schedule (sorted by month, with warnings for weekends, holidays, and parallel trainings)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Update:</strong> After changes, click "Update Program" to preview a detailed diff of all changes (added/removed/modified placements). Only affected trainers receive updated emails.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Change Preview:</strong> Before confirming an update, a dialog shows exactly what changed — grouped by placement and by trainer, with color-coded additions (green), removals (red), and modifications (amber)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Version History:</strong> Each publish creates a versioned snapshot that can be reviewed later</li>
<li class="text-gray-700 dark:text-gray-300">Read-only calendar view of the published program</li>
</ul>
<strong>Email behavior:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Initial publish: all assigned trainers receive "Your Training Schedule {Year}" with PDF</li>
<li class="text-gray-700 dark:text-gray-300">Updates: only affected trainers receive "Updated Training Schedule {Year}" with change summary and updated PDF</li>
</ul>
<strong>Dependencies:</strong> Trainers must be assigned (Assign Trainers tab). Trainers need an email address to receive notifications.`,
          }}
        />
      ),
    },
  ],
};
