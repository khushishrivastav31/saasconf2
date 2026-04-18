import type { HandbookCategory } from '../handbookSections';

export const trainingSettingsCategory: HandbookCategory = {
  id: 'category-t-settings',
  name: 'Settings',
  description: '',
  moduleCode: 'trainings',
  sections: [
    {
      id: 't-training-catalog',
      title: 'Training Catalog',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Define the trainings your organization offers. Navigate to <strong>Settings &rarr; Training Catalog</strong>.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create trainings with name, slug/abbreviation, description, and duration (in days)</li>
<li class="text-gray-700 dark:text-gray-300">Assign a color to each training (used on calendar bars)</li>
<li class="text-gray-700 dark:text-gray-300">Set pricing (regular and early bird prices)</li>
<li class="text-gray-700 dark:text-gray-300">Assign languages and themes</li>
<li class="text-gray-700 dark:text-gray-300">Link to certification bodies and syllabi</li>
<li class="text-gray-700 dark:text-gray-300">Add a website URL and logo</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Files tab:</strong> Upload and manage file attachments per training (documents, syllabi, materials). Click a training, then switch to the "Files" sub-tab</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Trainings from the catalog appear in the Design Program sidebar for drag-and-drop scheduling.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-trainers',
      title: 'Trainers',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage trainer profiles and view their schedules. Navigate to <strong>Trainers</strong> in the sidebar.</p>
<strong>Trainer Profiles:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create profiles with name, email, phone, pronouns, and bio (vita)</li>
<li class="text-gray-700 dark:text-gray-300">Upload a trainer photo</li>
<li class="text-gray-700 dark:text-gray-300">Mark trainers as internal or external</li>
<li class="text-gray-700 dark:text-gray-300">Assign which trainings and languages a trainer can deliver</li>
<li class="text-gray-700 dark:text-gray-300">Delete trainers (tenant super users only)</li>
<li class="text-gray-700 dark:text-gray-300">Search by first or last name (partial match); to find a trainer by email, enter the full address — email is encrypted at rest and only exact matches resolve</li>
</ul>
<strong>Unavailability:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add date ranges when a trainer is unavailable (vacation, other commitments)</li>
<li class="text-gray-700 dark:text-gray-300">Unavailability periods trigger warnings in the Assign Trainers calendar</li>
</ul>
<strong>Trainer Schedule:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>List view:</strong> Grouped by month, shows training name, date, location, placement type, customer, and attendee count</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Calendar view:</strong> Monthly calendar grid (Mon-Sun) with colored training bars, holiday highlighting, and month navigation</li>
<li class="text-gray-700 dark:text-gray-300">Toggle between list and calendar views with the view switcher</li>
<li class="text-gray-700 dark:text-gray-300">Filter by year and search by training name</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-locations',
      title: 'Locations & Location Types',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage training venues and their categories. Navigate to <strong>Settings &rarr; Locations</strong> and <strong>Location Types</strong>.</p>
<strong>Locations:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create locations with name, code, address, city, country</li>
<li class="text-gray-700 dark:text-gray-300">Assign a location type</li>
<li class="text-gray-700 dark:text-gray-300">Locations appear as options when assigning placements in the Design Program</li>
</ul>
<strong>Location Types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Define categories like Office, Training Center, Hotel, Online</li>
<li class="text-gray-700 dark:text-gray-300">Used to classify and filter locations</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-holidays',
      title: 'Holidays & Blocked Days',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure public holidays and custom blocked days that appear on the training calendar. Navigate to <strong>Settings &rarr; Holidays</strong>.</p>
<strong>Public Holidays:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Select countries to automatically import public holidays</li>
<li class="text-gray-700 dark:text-gray-300">National and regional holidays are shown</li>
<li class="text-gray-700 dark:text-gray-300">Holidays appear as purple cells on the calendar grid</li>
</ul>
<strong>Custom Blocked Days:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add company-specific blocked days (company holidays, team events)</li>
<li class="text-gray-700 dark:text-gray-300">Set name and date for each blocked day</li>
<li class="text-gray-700 dark:text-gray-300">Blocked days also appear as purple on the calendar</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">If a training placement overlaps a holiday or blocked day, a warning indicator appears on the calendar bar.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-languages-certs',
      title: 'Languages, Certification Bodies & Syllabi',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure reference data used across the training module.</p>
<strong>Languages</strong> (Settings &rarr; Languages):
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Define training languages (English, German, Spanish, etc.)</li>
<li class="text-gray-700 dark:text-gray-300">Languages are assigned to trainings and trainers</li>
<li class="text-gray-700 dark:text-gray-300">Used as exam language options for attendees</li>
</ul>
<strong>Certification Bodies</strong> (Settings &rarr; Certification Bodies):
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Define certifying organizations (e.g. IREB, iSAQB, PMI)</li>
<li class="text-gray-700 dark:text-gray-300">Link trainings to their certification body</li>
</ul>
<strong>Syllabi</strong> (Settings &rarr; Syllabus):
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Define curriculum/syllabus versions</li>
<li class="text-gray-700 dark:text-gray-300">Link trainings to specific syllabus versions</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Exam Price:</strong> The price charged to participants for the certification exam</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Exam Cost:</strong> The cost paid to the certification body for conducting the exam</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-policies',
      title: 'Policies',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure legal and compliance policies for training registration portals. Navigate to <strong>Settings &rarr; Policies</strong>.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable 5 policy types: Privacy Policy, Cookies Policy, Imprint, Terms &amp; Conditions, Code of Conduct</li>
<li class="text-gray-700 dark:text-gray-300">Set each policy as <strong>External URL</strong> (opens in new tab) or <strong>Inline Content</strong> (rich text, opens in modal)</li>
<li class="text-gray-700 dark:text-gray-300">When Terms &amp; Conditions are enabled, a consent checkbox is required during registration</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-registration-questions',
      title: 'Registration Questions',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Define custom questions shown on training registration portals. Navigate to <strong>Settings &rarr; Registration Questions</strong>.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add questions of 4 types: Text Field, Checkbox, Radio Buttons, Dropdown</li>
<li class="text-gray-700 dark:text-gray-300">Mark questions as mandatory or optional</li>
<li class="text-gray-700 dark:text-gray-300">Add help text (rich text) below each question</li>
<li class="text-gray-700 dark:text-gray-300">Reorder questions with up/down buttons</li>
<li class="text-gray-700 dark:text-gray-300">Toggle individual questions active/inactive</li>
<li class="text-gray-700 dark:text-gray-300">Preview the portal view with a live preview</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-email-settings',
      title: 'Email Settings & Templates',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure email sending and customize templates for training communications. Navigate to <strong>Settings &rarr; Email</strong> and <strong>Email Templates</strong>.</p>
<strong>Email Settings:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable outgoing training emails</li>
<li class="text-gray-700 dark:text-gray-300">Customize email header and footer HTML (branding, logos, disclaimers)</li>
</ul>
<strong>Email Templates (7 types):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Registration confirmation, cancellation, attendee welcome</li>
<li class="text-gray-700 dark:text-gray-300">Invoice send, first payment reminder, second payment reminder, overdue admin alert</li>
<li class="text-gray-700 dark:text-gray-300">Each template supports placeholders like [Training Name], [First Name], [Invoice Number], etc.</li>
<li class="text-gray-700 dark:text-gray-300">Customized templates can be reset to defaults</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: 't-offer-templates',
      title: 'Offer Templates',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Create reusable document templates for customer offers. Navigate to <strong>Settings &rarr; Offer Templates</strong>.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create named templates with rich text content</li>
<li class="text-gray-700 dark:text-gray-300">Edit template content with the built-in rich text editor</li>
<li class="text-gray-700 dark:text-gray-300">Templates appear as options when creating offer documents</li>
<li class="text-gray-700 dark:text-gray-300">Delete templates that are no longer needed</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">When creating an offer document, you select one of these templates as the starting point. The template content is copied into the document and can be customized per offer.</p>`,
          }}
        />
      ),
    },
    {
      id: 't-finance-settings',
      title: 'Finance Settings',
      categoryId: 'category-t-settings',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure financial settings for training invoicing and payments. Navigate to <strong>Settings &rarr; Finance</strong>.</p>
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
</ul>`,
          }}
        />
      ),
    },
  ],
};
