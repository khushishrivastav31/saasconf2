import type { HandbookCategory } from '../handbookSections';

export const eventSetupCategory: HandbookCategory = {
  id: 'category-1',
  name: 'Event Setup',
  description: '',
  moduleCode: 'conferences',
  sections: [
    {
      id: '1-1-details',
      title: 'Details',
      categoryId: 'category-1',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">The default view when opening a conference. Configure all core conference information here.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Set conference name, abbreviation, and rich-text description</li>
<li class="text-gray-700 dark:text-gray-300">Configure start/end dates, timezone, and event type (onsite/virtual/hybrid)</li>
<li class="text-gray-700 dark:text-gray-300">Enter venue details (name, address, city, country) and streaming platform URL</li>
<li class="text-gray-700 dark:text-gray-300">Set contact information (support email, contact email, phone)</li>
<li class="text-gray-700 dark:text-gray-300">Upload/replace/delete conference logo (JPEG, PNG, WebP, GIF; max 10 MB)</li>
<li class="text-gray-700 dark:text-gray-300">View and copy auto-generated portal URLs</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Edit any field, then click <strong>Save Changes</strong> to persist. A <strong>Discard</strong> button appears when you have unsaved changes. Logo uploads/deletions save immediately. If you try to switch tabs with unsaved changes, a confirmation dialog will ask whether to stay or leave.</p>
<strong>Dependencies:</strong> None — this is the starting point for any conference.
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Conference name</strong> appears on all pages, emails, invoices, and portal</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Abbreviation</strong> determines the portal URL: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">/{tenant-slug}/portal/{abbreviation}</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Timezone</strong> affects how session times display in the program and portal</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Country</strong> auto-suggests timezone and influences default VAT rules</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Event type</strong> affects VAT calculation (virtual vs. in-person attendance)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Contact fields</strong> populate placeholders in email and invoice templates: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[SUPPORT_EMAIL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONTACT_EMAIL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[PHONE]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Logo</strong> appears on conference cards, header, portal, and optionally in invoice PDFs via <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[LOGO]</code> placeholder</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Set timezone before creating Sessions (changing it later causes confusion)</li>
<li class="text-gray-700 dark:text-gray-300">Set contact emails before configuring System Email Templates (used as placeholder values)</li>
<li class="text-gray-700 dark:text-gray-300">Set country before configuring Currency & Tax settings</li>
</ul>`,
          }}
        />
      ),
    },
    {
      id: '1-2-team',
      title: 'Team',
      categoryId: 'category-1',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Lists people associated with the conference (chairs, committee leads, organizers). This is a <strong>display-only directory</strong> — it does not grant login access.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add team members with first name, last name, role, email, phone</li>
<li class="text-gray-700 dark:text-gray-300">Mark members as "Conference Manager" (blue badge)</li>
<li class="text-gray-700 dark:text-gray-300">Edit or remove team members</li>
<li class="text-gray-700 dark:text-gray-300">Team member info may display on the public portal</li>
</ul>
<strong>Important distinction:</strong> To grant someone login access, use the <strong>Team page in the main navigation</strong> and invite them as a user. The conference Team tab is for public display only.
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Team member count appears on conference cards. Team data may be visible on the public portal.`,
          }}
        />
      ),
    },
    {
      id: '1-3-social-media',
      title: 'Social Media',
      categoryId: 'category-1',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure social media profile links for the conference.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add platforms from a list (Twitter, Facebook, LinkedIn, Instagram, YouTube, GitHub, Mastodon) or add custom platforms</li>
<li class="text-gray-700 dark:text-gray-300">Enter profile URLs for each platform</li>
<li class="text-gray-700 dark:text-gray-300">Remove platforms (immediate, no confirmation)</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Links are display-only — SaaSConf does not auto-post to social media or require API keys. Enter full URLs including <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">https://</code>.</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Social links appear on the public-facing portal pages.`,
          }}
        />
      ),
    },
    {
      id: '1-4-settings',
      title: 'Settings',
      categoryId: 'category-1',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">The Settings tab contains 5 groups of configuration sub-tabs. All settings require an explicit <strong>Save Changes</strong> click. A <strong>Discard</strong> button appears when you have unsaved changes.</p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.1 People & Roles</h4>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>User Roles:</strong> Define custom roles for categorizing conference participants. Six system roles (Keynote, Tutorial, Social Event, Bonus Session, Active Session, Sponsor Talk) are predefined. <strong>Volunteer Tasks:</strong> Define task types for volunteer assignment. <strong>Committee Roles:</strong> Define roles for CFP reviewers. Pronoun options are managed at the tenant level (see <strong>Pronoun Options</strong> in the main navigation).</p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.2 Conference Setup</h4>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Location Types, Session Types, Sponsor Packages</strong> — define configuration types used by their respective features. <strong>Registration Portal</strong> — enable/disable public registration, set dates and theme. <strong>Policies</strong> — terms attendees must accept. <strong>Registration Questions</strong> — custom questions in the registration form.</p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.3 CFP & Reviews</h4>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Paper Form</strong> — drag-and-drop field editor with role-specific variants. Each field (built-in and custom) has three controls: <strong>Visible for speaker</strong> — shows the field on the speaker submission form; <strong>Required for speaker</strong> — the speaker must fill it in to submit; <strong>Visible for reviewer</strong> — when checked, the field is shown to the reviewer in the portal (default on). Uncheck "Visible for reviewer" to hide a field from reviewers entirely; the backend enforces this and the value is never sent to the reviewer's browser. <strong>Score Scales</strong> — define reviewer scoring scales. <strong>Review Criteria</strong> — configure evaluation criteria.</p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.4 Communication</h4>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Email Settings</strong> — enable/disable emails. <strong>System Email Templates</strong> — 12 template types with placeholders. <strong>Pending Verifications</strong> — resend verification emails. <strong>Messaging, Message Templates, Recipient Lists</strong> — configure in-app messaging. <strong>Screen Overlays</strong> — full-screen announcements for portal users.</p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.5 Finance</h4>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Currency & Tax</strong> — default currency and EU VAT rules. <strong>Numbering</strong> — invoice number format. <strong>Company Data</strong> — organization details for invoice headers. <strong>Bank Accounts</strong> — IBAN/BIC for bank transfer invoices. <strong>Invoice Templates</strong> — WYSIWYG editor with 40+ placeholders for header/body/footer. <strong>Badge Designer</strong> — per-role badge templates (DIN A5). <strong>ZUGFeRD</strong> — electronic invoicing. <strong>Stripe Setup</strong> — credit card payment integration. <strong>Payment Reminders</strong> — automated overdue invoice reminders.</p>`,
          }}
        />
      ),
    },
    {
      id: '1-5-deadlines',
      title: 'Deadlines',
      categoryId: 'category-1',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure and display conference deadlines. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">deadlines</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add deadlines with name, date, and optional description</li>
<li class="text-gray-700 dark:text-gray-300">Mark deadlines as visible on the portal</li>
<li class="text-gray-700 dark:text-gray-300">Reorder deadlines</li>
</ul>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Portal-visible deadlines appear on the public-facing conference page. Deadlines serve as reference dates for CFP submission windows and registration periods.`,
          }}
        />
      ),
    },
    {
      id: '1-6-locations',
      title: 'Locations',
      categoryId: 'category-1',
      content: () => (
        <div
          dangerouslySetInnerHTML={{
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference venues and rooms. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">locations</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create venues (top-level) and rooms nested beneath them</li>
<li class="text-gray-700 dark:text-gray-300">Expand or collapse a venue's rooms with the chevron toggle</li>
<li class="text-gray-700 dark:text-gray-300">Assign location types (defined in Settings 1.4.1)</li>
<li class="text-gray-700 dark:text-gray-300">Link locations to program tracks</li>
<li class="text-gray-700 dark:text-gray-300">Orphaned rooms (parent venue removed) appear in a separate warning section</li>
</ul>
<strong>Dependencies:</strong> Location Types (Settings 1.4.1) should be defined first.
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Locations appear as assignment options when scheduling sessions in Program Design (2.2.1)</li>
<li class="text-gray-700 dark:text-gray-300">Location capacity can limit session attendance</li>
<li class="text-gray-700 dark:text-gray-300">Published locations may appear on the portal</li>
</ul>`,
          }}
        />
      ),
    },
  ],
};
