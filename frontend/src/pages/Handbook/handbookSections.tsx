import type { ReactNode } from 'react';

export interface HandbookSection {
  id: string;
  title: string;
  content: () => ReactNode;
  categoryId: string;
}

export interface HandbookCategory {
  id: string;
  name: string;
  description: string;
  moduleCode?: string;
  sections: HandbookSection[];
}

export const handbookCategories: HandbookCategory[] = [
  {
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
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>What gets copied:</strong> All configuration and settings — pronoun options, volunteer roles, committee roles, location types, currencies, budget categories, sponsor packages (with contract templates), booking periods/options/packages, discount codes, review system (scales, criteria, questions), email templates, screen overlays, paper form schema, session types, alumni, and the full conference settings (VAT rules, registration questions, invoice settings, speaker expenses, etc.).</p>
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
  },
  {
    id: 'category-1',
    name: 'Event Setup',
    description: '',
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
<p class="text-gray-700 dark:text-gray-300 my-2">All fields auto-save when you stop typing. A save indicator shows "Saving..." / "Saved" / "Save failed".</p>
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
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">The Settings tab contains 5 groups of configuration sub-tabs. All settings auto-save.</p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.1 People & Roles</h4>
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Volunteer Tasks</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define task types that volunteers can be assigned to (e.g., "Registration Desk", "Session Chair", "AV Support").</p>
<strong>Dependencies:</strong> Must be configured before using Volunteer Assignment (3.5).
<strong>Consequences:</strong> Tasks appear in the Task Assignment and Volunteer Assignment grids.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Committee Roles</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define roles for CFP review committee members (e.g., "Chair", "Vice Chair", "Reviewer").</p>
<strong>Dependencies:</strong> Must be configured before adding Program Committee members (3.1).
<strong>Consequences:</strong> Roles appear when assigning committee members.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Pronoun Options</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure pronoun options available during registration (e.g., "he/him", "she/her", "they/them").</p>
<strong>Dependencies:</strong> Must be configured before attendees register.
<strong>Consequences:</strong> Options appear in registration forms and attendee profiles.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.2 Conference Setup</h4>
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Location Types</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define venue/location categories (e.g., "Main Hall", "Breakout Room", "Virtual Room").</p>
<strong>Dependencies:</strong> Must be configured before creating Locations (1.6).
<strong>Consequences:</strong> Location types appear when creating or editing locations.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Session Types</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define session format templates (e.g., "Keynote", "Workshop", "Panel", "Tutorial", "Poster"). Each type has a name, default duration, color, and flags for <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">separately_bookable</code> and <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">is_tutorial</code>. See <strong>Sessions (2.3)</strong> for detailed documentation of how session types work.</p>
<strong>Dependencies:</strong> Must be configured before creating Sessions (2.3).
<strong>Consequences:</strong> Session types control display in Program Design, color-coding, and whether sessions appear as selectable options during registration.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Sponsor Packages</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define sponsorship tiers and benefits (e.g., "Gold", "Silver", "Bronze" with descriptions and pricing).</p>
<strong>Dependencies:</strong> Must be configured before adding Sponsors (4.1).
<strong>Consequences:</strong> Packages appear when creating sponsors and in sponsor contracts.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Registration Portal</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure the public registration portal for this conference:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable public registration</li>
<li class="text-gray-700 dark:text-gray-300">Set portal logo, theme colors (primary color, background)</li>
<li class="text-gray-700 dark:text-gray-300">Define registration open/close dates</li>
<li class="text-gray-700 dark:text-gray-300">Configure success message shown after registration</li>
<li class="text-gray-700 dark:text-gray-300">Enable/disable specific registration features</li>
</ul>
<strong>Dependencies:</strong> Booking Options must be configured with prices for registration to work.
<strong>Consequences:</strong> Controls whether and how the public portal accepts registrations. Registration dates determine when attendees can register.
<strong>Interdependencies:</strong> Booking Options (5.1) must have active periods with prices. System Email Templates must be configured for confirmation emails.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Policies</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define conference policies and terms that attendees must accept during registration (e.g., privacy policy, code of conduct, cancellation policy).</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Policies appear as checkboxes on the registration form. Attendees must accept all active policies to complete registration.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Registration Questions</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Create custom questions asked during registration (e.g., "Dietary requirements", "T-shirt size", "How did you hear about us?"). Supports text, dropdown, and multi-select question types.</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Questions appear in the registration form. Answers are visible in the Attendees tab (3.4) and can be analyzed in Analytics > Registration Questions (7.1.1).
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.3 CFP & Reviews</h4>
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Paper Form</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Build the custom paper submission form using drag-and-drop fields. Define which fields are required, optional, or hidden. Add custom fields for specific information needs.</p>
<strong>Dependencies:</strong> Must be configured before opening the CFP portal to applicants.
<strong>Consequences:</strong> Determines what information applicants must provide when submitting papers.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Score Scales</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define scoring scales used by reviewers (e.g., 1-5 stars, 1-10 numeric, Accept/Reject/Revise).</p>
<strong>Dependencies:</strong> Must be configured before enabling paper reviews.
<strong>Consequences:</strong> Scales appear in the review form. Review scores are aggregated in Evaluated Papers (2.1.4).
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Review Criteria</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure the criteria and questions reviewers must answer when evaluating papers (e.g., "Originality", "Technical Quality", "Relevance").</p>
<strong>Dependencies:</strong> Score Scales must be defined first.
<strong>Consequences:</strong> Criteria appear in the review form alongside the selected score scale.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.4 Communication</h4>
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Email Settings</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Enable or disable email sending for this conference. When disabled, no automated emails are sent (registration confirmations, reminders, etc.).</p>
<strong>Important:</strong> Password reset emails are always sent regardless of this setting.
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Affects all automated email features: registration confirmations, invoice sending, payment reminders, deadline reminders, news distribution, CFP notifications.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">System Email Templates</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Create and customize email templates with rich text and placeholders. Templates are used by various features to send automated emails.</p>
<strong>Template types and where they are used:</strong>
<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Template Type</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Used By</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Key Placeholders</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">registration_confirmation</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Registration (5.2)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Conference Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Booking Option]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_sent</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Invoices (5.3)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Invoice Number]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Total]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Currency]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_cancelled</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Invoice cancellation</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Invoice Number]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Cancellation Reason]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_replaced</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Invoice replacement</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Invoice Number]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Original Invoice Number]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_first</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Payment Reminders (5.4)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Invoice Number]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Invoice Amount]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Days Overdue]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_second</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Payment Reminders (5.4)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Same as first reminder</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_acceptance</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Accepted Papers (2.1.5)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Paper Title]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Conference Name]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_rejection</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Rejected Papers (2.1.6)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Paper Title]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Conference Name]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">reviewer_assignment</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Assignments (2.1.3)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Reviewer Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Paper Title]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">sponsor_contract_send</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Sponsors (4.1)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Package Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Custom Message]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Contract Content]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">deadline_reminder</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Deadlines (1.5)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Deadline Title]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Due Date]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Conference Name]</code></td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">news_distribution</code></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">News (6.2)</td><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Article Title]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Article Content]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Conference Name]</code></td></tr></tbody></table></div>
<strong>Dependencies:</strong> Contact fields in Details (1.1) populate <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[SUPPORT_EMAIL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONTACT_EMAIL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[PHONE]</code> placeholders.
<strong>Consequences:</strong> Templates determine the content and appearance of all automated emails sent by the system.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Messaging Settings</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure in-app messaging settings for the conference.</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Controls messaging behavior in the Messages tab (6.1).
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Message Templates</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Create reusable message templates for bulk or repeated communications.</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Templates appear when composing messages in the Messages tab (6.1).
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Recipient Lists</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Define predefined groups of recipients for bulk messaging (e.g., "All Speakers", "All Sponsors", "Program Committee").</p>
<strong>Dependencies:</strong> Relevant people must exist (speakers, sponsors, etc.) to populate lists.
<strong>Consequences:</strong> Lists appear as recipient options when sending messages (6.1) and when distributing news articles (6.2).
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Screen Overlays</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure full-screen overlay announcements shown to portal users on login. Supports text content (title + body), optional image upload, and configurable trigger rules.</p>
<strong>Trigger types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>First registration</strong> — shown once per user</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Scheduled</strong> — shown on/after a specific date</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Always</strong> — shown every login</li>
</ul>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Overlays appear to portal users based on trigger rules. Can be linked to specific content (e.g., news articles, messages).
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">1.4.5 Finance</h4>
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Currency & Tax</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure the default conference currency and VAT/tax rules:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Default currency (ISO 4217, e.g., EUR, USD)</li>
<li class="text-gray-700 dark:text-gray-300">VAT rate and rules</li>
<li class="text-gray-700 dark:text-gray-300">Fiscal representative settings (for conferences in countries requiring one)</li>
</ul>
<strong>Dependencies:</strong> Must be configured before setting prices in Booking Options (5.1).
<strong>Consequences:</strong> Currency applies to all booking periods (unless overridden per period). VAT rules affect invoice calculations. Event type (from Details) influences whether reverse charge applies.
<strong>VAT calculation depends on:</strong> Conference country, customer country, attendance type (in-person vs. virtual), customer type (B2B vs. B2C). The system applies EU VAT rules automatically based on a 24-rule decision table.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Numbering</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure invoice number format (e.g., <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">{YEAR}-{SEQ:5}</code> produces "2026-00001"). Super Admin only.</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Invoice numbers are sequential and immutable once assigned. Format changes only affect future invoices.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Company Data</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Set your organization's details for invoice headers: company name, address, VAT number, tax ID, footer text, and optional secondary currency with exchange rate.</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Company data populates invoice PDF placeholders: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[COMPANY_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[ADDRESS]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CITY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[POSTAL_CODE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[COUNTRY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[VAT]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[TAX_ID]</code>.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Bank Accounts</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure bank account details displayed on bank transfer invoices: bank name, IBAN, BIC/SWIFT.</p>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Bank details populate invoice PDF placeholders: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[BANK_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[IBAN]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[BIC]</code>. Shown on bank transfer invoices for payment instructions.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Invoice Templates</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Design and customize invoice PDF templates with a rich text editor. Three sections: header (repeated every page), body (main content), footer (repeated every page).</p>
<strong>Available placeholders (40+):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Company:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[COMPANY_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[ADDRESS]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CITY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[POSTAL_CODE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[COUNTRY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[VAT]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[TAX_ID]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[TAX_SYSTEM]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[LOGO]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Recipient:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[RECIPIENT_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[RECIPIENT_ADDRESS]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[RECIPIENT_CITY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[RECIPIENT_POSTAL_CODE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[RECIPIENT_COUNTRY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[RECIPIENT_VAT]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[RECIPIENT_EMAIL]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Invoice:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[INVOICE_NUMBER]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[ISSUE_DATE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[DUE_DATE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[ITEMS_TABLE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[NOTES]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Financial:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[SUBTOTAL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[TAX_RATE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[TAX_AMOUNT]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[TOTAL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CURRENCY]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Banking:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[BANK_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[IBAN]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[BIC]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Contact:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONTACT_EMAIL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[PHONE]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Dual Currency:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[SECOND_CURRENCY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[SECOND_TOTAL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[EXCHANGE_RATE]</code></li>
</ul>
<code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[ITEMS_TABLE]</code> auto-generates an HTML table from invoice line items.
<strong>Dependencies:</strong> Company Data and Bank Accounts should be configured first.
<strong>Consequences:</strong> Template determines the appearance of all generated invoice PDFs.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Badge Designer</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Design printable name badge templates (DIN A5 format) per role using a rich text editor. Each role (Attendee, Speaker, Sponsor, Volunteer, Committee, Organizer) can have its own template.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">WYSIWYG editor with HTML source toggle, same as Invoice Templates</li>
<li class="text-gray-700 dark:text-gray-300">Portrait or landscape orientation (A5 page size)</li>
<li class="text-gray-700 dark:text-gray-300">Per-role tabs with "Copy from..." to duplicate templates between types</li>
<li class="text-gray-700 dark:text-gray-300">Quick templates: "Simple Name Badge" and "Professional Badge with QR"</li>
</ul>
<strong>Available placeholders:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Attendee:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[FIRST_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[LAST_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[FULL_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[EMAIL]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[PHONE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[JOB_TITLE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[DEPARTMENT]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[PRONOUNS]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Company:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[COMPANY_NAME]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Conference:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONFERENCE_NAME]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONFERENCE_ABBREVIATION]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONFERENCE_VENUE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONFERENCE_CITY]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONFERENCE_DATES]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[CONFERENCE_LOGO]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>Registration:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[BOOKING_OPTION]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[BADGE_TYPE]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[REGISTRATION_DATE]</code></li>
<li class="text-gray-700 dark:text-gray-300"><strong>QR Code:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[QR_CODE]</code> — generates a vCard 3.0 QR code with selected fields</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Conditional Images:</strong> Custom <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[IMG_...]</code> placeholders that show/hide based on booking option or conference day</li>
</ul>
<strong>QR Code Configuration:</strong> Select which attendee fields to include in the vCard QR code (first name, last name, email, phone, job title, department, company, address fields).
<strong>Conditional Images:</strong> Upload images with conditions — they appear on the badge only when the condition is met (e.g., a "Day 1" sticker for attendees with a specific booking option).
<strong>Dependencies:</strong> None (but Booking Options should be configured for conditional image conditions).
<strong>Consequences:</strong> Templates are used when generating badges in People > Badges.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">ZUGFeRD</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure ZUGFeRD/Factur-X electronic invoicing (EU standard for machine-readable invoice PDFs):</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable ZUGFeRD</li>
<li class="text-gray-700 dark:text-gray-300">Select profile: EN16931 (recommended), MINIMUM, or EXTENDED</li>
<li class="text-gray-700 dark:text-gray-300">Set seller VAT ID, contact email, phone</li>
<li class="text-gray-700 dark:text-gray-300">Configure payment terms and codes</li>
</ul>
<strong>Dependencies:</strong> Company Data must include VAT ID. Invoice recipients need ISO country codes.
<strong>Consequences:</strong> When enabled, invoice PDFs include embedded XML data for automated processing. Required for German B2B invoicing (2025-2028 mandate). Falls back gracefully to standard PDF if validation fails.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Stripe Setup</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure Stripe payment integration for credit card invoices. Super Admin only.</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Secret key, publishable key, webhook secret</li>
<li class="text-gray-700 dark:text-gray-300">Enable/disable toggle</li>
</ul>
<strong>Setup requires:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Stripe account (stripe.com)</li>
<li class="text-gray-700 dark:text-gray-300">API keys from Stripe Dashboard > Developers</li>
<li class="text-gray-700 dark:text-gray-300">Webhook endpoint configured in Stripe: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">https://your-domain.com/api/v1/stripe/webhook</code></li>
<li class="text-gray-700 dark:text-gray-300">Webhook events: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_intent.succeeded</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_intent.payment_failed</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">charge.succeeded</code></li>
</ol>
<strong>Dependencies:</strong> None (but must be configured before sending credit card invoices).
<strong>Consequences:</strong> Enables credit card invoice creation with automatic payment links. Stripe webhooks auto-update invoice status to "paid" when payment is received.
<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">Payment Reminders</h5>
<p class="text-gray-700 dark:text-gray-300 my-2">Configure automated payment reminder settings:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Enable/disable automatic reminders</li>
<li class="text-gray-700 dark:text-gray-300">1st reminder: N days after due date (default: 2, range: 1-90)</li>
<li class="text-gray-700 dark:text-gray-300">2nd reminder: M days after due date (default: 17, range: 1-180)</li>
<li class="text-gray-700 dark:text-gray-300">Notify admin after 2nd reminder (toggle)</li>
</ul>
<strong>Dependencies:</strong> System Email Templates for <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_first</code> and <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_second</code> should be configured.
<strong>Consequences:</strong> System automatically sends reminder emails for overdue invoices. See Payment Reminders tab (5.4) for viewing sent reminders.`,
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
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Track critical dates and receive automated email reminders. Core feature — no module required.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create deadlines with title, description, and due date/time</li>
<li class="text-gray-700 dark:text-gray-300">View deadlines as color-coded cards: red (overdue), amber (due within 7 days), blue (active), gray (resolved)</li>
<li class="text-gray-700 dark:text-gray-300">Toggle deadlines between active and resolved without deleting</li>
<li class="text-gray-700 dark:text-gray-300">Edit or delete deadlines</li>
</ul>
<strong>Automated reminders:</strong> The system sends email reminders at 3 intervals:
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">7 days before due date</li>
<li class="text-gray-700 dark:text-gray-300">1 day before due date</li>
<li class="text-gray-700 dark:text-gray-300">On the due date</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Changing a due date selectively resets reminder flags so reminders are sent again for the new date.</p>
<strong>Dashboard warnings:</strong> When loading a conference with deadlines due within 7 days, toast notifications appear automatically.
<strong>Dependencies:</strong> Email Settings must be enabled for reminder emails to send.
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">deadline_reminder</code>
<strong>Consequences:</strong> Reminders sent to conference team. Resolved deadlines remain visible for reference.`,
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
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage venues and rooms for the conference. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">locations</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create locations in a hierarchy (e.g., "Congress Center" > "Hall A" > "Room 101")</li>
<li class="text-gray-700 dark:text-gray-300">Set capacity, location type, address, coordinates</li>
<li class="text-gray-700 dark:text-gray-300">Assign locations to sessions in the program</li>
<li class="text-gray-700 dark:text-gray-300">Upload documents and floor plans</li>
<li class="text-gray-700 dark:text-gray-300">Add contact persons per location</li>
<li class="text-gray-700 dark:text-gray-300">Control visibility (published/hidden)</li>
</ul>
<strong>Dependencies:</strong> Location Types must be configured in Settings (1.4.2) first.
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
  },
  {
    id: 'category-2',
    name: 'Content',
    description: '',
    sections: [
      {
        id: '2-1-call-for-papers',
        title: 'Call for Papers',
        categoryId: 'category-2',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage the entire CFP lifecycle from topic definition through paper decisions. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp</code> module.</strong></p>
<p class="text-gray-700 dark:text-gray-300 my-2">The Call for Papers is a structured multi-phase process that guides papers from submission through peer review to final decisions. It is designed around the academic conference model where an independent program committee evaluates submissions through blind or open review.</p>
<p class="text-gray-700 dark:text-gray-300 my-2">The CFP tab has 6 sub-tabs, each representing one stage of the review pipeline. Papers flow through these stages sequentially:</p>
<div class="my-6 overflow-x-auto"><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:8px 0"><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd">SETUP</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">SUBMISSION</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">ASSIGNMENT</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">REVIEW</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">DECISION</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">OUTCOME</div></div></div>
<strong>Paper status lifecycle — each paper transitions through these statuses:</strong>
<div class="my-6 space-y-3"><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd">Submitted</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#fef3c7;color:#92400e;border:1px solid #fcd34d">Under Review</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd">Evaluated</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">Accepted</div></div><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0;margin-left:0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd">Evaluated</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5">Rejected</div></div></div>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Submitted</strong>: Paper received from author via the portal. Author can still edit until the submission deadline.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Under Review</strong>: At least one reviewer has been assigned. Paper is locked for author edits.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Evaluated</strong>: All assigned reviewers have completed their reviews. Scores are aggregated.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Accepted</strong>: Admin has accepted the paper. Author receives acceptance email. Paper can become a Session.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Rejected</strong>: Admin has rejected the paper. Author receives rejection email.</li>
</ul>
<strong>Phase 1 — Setup (before opening the CFP):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Define Topics/tracks that authors can submit to (sub-tab: Topics)</li>
<li class="text-gray-700 dark:text-gray-300">Configure the Paper Form fields in Settings (1.4.3)</li>
<li class="text-gray-700 dark:text-gray-300">Set up Score Scales and Review Criteria in Settings (1.4.3)</li>
<li class="text-gray-700 dark:text-gray-300">Add Program Committee members (3.1) with topic expertise and COI declarations</li>
<li class="text-gray-700 dark:text-gray-300">Share the portal URL with potential authors</li>
</ul>
<strong>Phase 2 — Submission (portal-side):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Authors register on the portal and submit papers selecting a topic</li>
<li class="text-gray-700 dark:text-gray-300">Papers arrive in the Papers sub-tab with status "Submitted"</li>
<li class="text-gray-700 dark:text-gray-300">Authors can update their submissions until the deadline (configurable via Deadlines 1.5)</li>
</ul>
<strong>Phase 3 — Assignment:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Admin assigns papers to committee reviewers in the Assignments sub-tab</li>
<li class="text-gray-700 dark:text-gray-300">The system respects COI declarations — conflicted reviewers cannot be assigned</li>
<li class="text-gray-700 dark:text-gray-300">Each paper can have multiple reviewers for balanced evaluation</li>
<li class="text-gray-700 dark:text-gray-300">Reviewers receive email notification with their assigned papers</li>
</ul>
<strong>Phase 4 — Review (portal-side):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Committee members review assigned papers through their portal</li>
<li class="text-gray-700 dark:text-gray-300">They score papers using the configured Score Scales and Review Criteria</li>
<li class="text-gray-700 dark:text-gray-300">Papers move to "Evaluated" status once all assigned reviews are complete</li>
</ul>
<strong>Phase 5 — Decision:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Admin reviews aggregated scores and comments in the Evaluated Papers sub-tab</li>
<li class="text-gray-700 dark:text-gray-300">Papers can be compared side-by-side</li>
<li class="text-gray-700 dark:text-gray-300">Admin makes Accept or Reject decisions (individually or in bulk)</li>
</ul>
<strong>Phase 6 — Outcome:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Accepted papers appear in the Accepted Papers sub-tab; authors receive acceptance email</li>
<li class="text-gray-700 dark:text-gray-300">Rejected papers appear in the Rejected Papers sub-tab; authors receive rejection email</li>
<li class="text-gray-700 dark:text-gray-300">Accepted papers can be converted into Sessions (2.3) for the conference program</li>
</ul>
<strong>Dependencies (must be set up before opening the CFP):</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Paper Form, Score Scales, and Review Criteria in Settings (1.4.3)</li>
<li class="text-gray-700 dark:text-gray-300">Topics defined (sub-tab: Topics)</li>
<li class="text-gray-700 dark:text-gray-300">Program Committee members added (3.1) with topic expertise</li>
</ul>
<strong>Key constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">COI-flagged reviewers cannot be assigned to conflicted papers</li>
<li class="text-gray-700 dark:text-gray-300">Paper status transitions are sequential — you cannot skip phases</li>
<li class="text-gray-700 dark:text-gray-300">Once a decision (accept/reject) is made, the paper cannot return to evaluation</li>
</ul>
<strong>Email templates used:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">reviewer_assignment</code> — sent to reviewers when papers are assigned</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_acceptance</code> — sent to authors when their paper is accepted</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_rejection</code> — sent to authors when their paper is rejected</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Accepted papers → Sessions (2.3) → Program Design (2.2.1): the content pipeline from submission to published schedule</li>
<li class="text-gray-700 dark:text-gray-300">Topics → Committee expertise matching: topics help suggest appropriate reviewers</li>
<li class="text-gray-700 dark:text-gray-300">Deadlines (1.5): set submission deadlines and review deadlines to keep the process on track</li>
</ul>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.1 Topics</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Define submission topics/tracks for the CFP (e.g., "Machine Learning", "Security", "DevOps"). Topics categorize papers and help match reviewers with relevant expertise.</p>
<strong>Consequences:</strong> Topics appear on the CFP portal submission form. Papers are categorized by topic. Topics can be used to match reviewers with relevant expertise.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.2 Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">View and manage all submitted papers. Search, filter by status/topic, view paper details, download attachments. Papers support multiple authors (co-speakers).</p>
<strong>Paper statuses:</strong> Submitted → Under Review → Evaluated → Accepted/Rejected
<strong>Consequences:</strong> Paper status changes trigger notifications to applicants (if email templates configured).
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.3 Assignments</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Assign papers to Program Committee reviewers. The system supports manual assignment and can suggest assignments based on topic expertise.</p>
<strong>Constraints:</strong> Reviewers with conflict-of-interest (COI) flags cannot be assigned to those papers. Each paper should have multiple independent reviewers.
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">reviewer_assignment</code>
<strong>Consequences:</strong> Assigned reviewers receive email notifications and see papers in their portal review queue.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.4 Evaluated Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">View papers that have completed the review process with aggregated scores and reviewer comments. Compare papers side-by-side to make informed accept/reject decisions.</p>
<strong>Dependencies:</strong> Reviews must be completed by assigned committee members.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.5 Accepted Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Papers marked as accepted. Bulk or individual acceptance with email notification.</p>
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_acceptance</code>
<strong>Consequences:</strong> Accepted papers can be converted into program sessions. Applicants receive acceptance notification.
<strong>Interdependency:</strong> Accepted papers → Sessions (2.3) → Program Design (2.2.1)
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.1.6 Rejected Papers</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Papers marked as rejected. Bulk or individual rejection with email notification.</p>
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp_rejection</code>
<strong>Consequences:</strong> Applicants receive rejection notification.`,
            }}
          />
        ),
      },
      {
        id: '2-2-program',
        title: 'Program',
        categoryId: 'category-2',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Design and build the conference schedule. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">program</code> module.</strong></p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.2.1 Design</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Visual CSS Grid editor for building the conference schedule day by day. Each day displays a grid where:</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Rows</strong> = time slots (e.g., 09:00–10:00, 10:30–12:00)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Columns</strong> = tracks (e.g., "Main Hall", "Room A", "Workshop Room")</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Cells</strong> = sessions placed at a specific time and track</li>
</ul>
<strong>Building the grid:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Create Program Days</strong> — each maps to a conference date. Days appear as tabs.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Add Time Slots</strong> — define start/end times for each day. Slots can span multiple rows (e.g., a 3-hour tutorial).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Add Tracks</strong> — parallel streams within a day. Each track gets a column.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Place Sessions</strong> — drag existing sessions into cells, or create new ones inline. A session can span multiple time slots (multi-slot duration).</li>
</ol>
<strong>Special slot types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Break slots</strong> — non-session time (coffee, lunch). Span all tracks with a label.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>General events</strong> — plenary sessions that span all tracks (opening ceremony, keynote).</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Regular sessions</strong> — placed in a single track column.</li>
</ul>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Reorder tracks and time slots by dragging</li>
<li class="text-gray-700 dark:text-gray-300">Resize time slots by adjusting start/end times</li>
<li class="text-gray-700 dark:text-gray-300">Assign a location to each track</li>
<li class="text-gray-700 dark:text-gray-300">Color-code sessions by session type</li>
<li class="text-gray-700 dark:text-gray-300">View speaker assignments per session</li>
</ul>
<strong>Dependencies:</strong> Sessions (2.3), Locations (1.6), and Session Types (Settings 1.4.2) should be created first.
<strong>Consequences:</strong> The program grid becomes the published schedule. Time slot definitions determine when sessions appear on the portal and in registration session selection.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">2.2.2 Build</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Assign papers to sessions and publish the program to attendees.</p>
<strong>Paper assignment:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Open a session in the grid to see its paper list</li>
<li class="text-gray-700 dark:text-gray-300">Search and add accepted papers (from CFP Accepted Papers, 2.1.5)</li>
<li class="text-gray-700 dark:text-gray-300">Set paper order within a session (presentation sequence)</li>
<li class="text-gray-700 dark:text-gray-300">Each paper can only be assigned to one session</li>
</ul>
<strong>Publishing workflow:</strong>
<div class="my-6 space-y-3"><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Draft</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Preview</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Publish</div></div><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0;margin-left:0"><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Published</div><div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div><div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:#f3f4f6;color:#374151;border:1px solid #d1d5db">Update (re-publish)</div></div></div>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Preview</strong> — generates a read-only preview of the full schedule. Review for gaps, conflicts, or missing assignments.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Publish</strong> — makes the program visible on the attendee portal. Triggers acceptance/rejection emails to paper authors.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Update</strong> — after initial publish, changes can be re-published. Only <strong>new</strong> assignments trigger notifications (differential publishing — authors already notified are not emailed again).</li>
</ol>
<strong>Email templates used:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">Paper Acceptance</code> — sent to authors whose papers are assigned to a session on publish</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">Paper Rejection</code> — sent to authors whose papers were not assigned (if configured)</li>
</ul>
<strong>Dependencies:</strong> Program Design (2.2.1) must have the grid structure. Accepted Papers (2.1.5) must exist for assignment.
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Publishing makes the schedule visible on the portal</li>
<li class="text-gray-700 dark:text-gray-300">Authors receive acceptance/rejection emails on first publish</li>
<li class="text-gray-700 dark:text-gray-300">Subsequent re-publishes only notify newly assigned authors</li>
<li class="text-gray-700 dark:text-gray-300">Assigned papers appear in the session detail on the portal</li>
</ul>`,
            }}
          />
        ),
      },
      {
        id: '2-3-sessions',
        title: 'Sessions',
        categoryId: 'category-2',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage individual conference sessions. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">sessions</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create sessions with title, description, session type, duration</li>
<li class="text-gray-700 dark:text-gray-300">Assign speakers and locations</li>
<li class="text-gray-700 dark:text-gray-300">Mark sessions as "separately bookable" (for tutorials, workshops)</li>
<li class="text-gray-700 dark:text-gray-300">Set session capacity limits</li>
<li class="text-gray-700 dark:text-gray-300">Link sessions to program days</li>
</ul>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">Session Types</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Session types are format templates defined in <strong>Settings > Conference Setup > Session Types</strong> (1.4.2). Every session must have a type. Types control display and behavior across the platform.</p>
<strong>Built-in examples:</strong> Keynote, Workshop, Panel Discussion, Tutorial, Poster Session, Hackathon, Bonus Session, Networking, Social Event.
<strong>Key fields on a session type:</strong>
<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Field</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Purpose</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Name</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Display label (e.g., "Tutorial", "Keynote")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Default Duration</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Pre-fills duration when creating a session of this type (e.g., 90 min)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Separately Bookable</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">If enabled, sessions of this type appear as selectable options during registration</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Is Tutorial</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Marks the type as a tutorial format — used for filtering and display grouping</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Color</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Color-codes sessions of this type in the Program Design grid</td></tr></tbody></table></div>
<strong>How <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">separately_bookable</code> works:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">A booking option is linked to a program day</li>
<li class="text-gray-700 dark:text-gray-300">That day has sessions marked with a <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">separately_bookable</code> session type</li>
<li class="text-gray-700 dark:text-gray-300">During registration, the registrant sees dropdown menus grouped by session type to choose from</li>
<li class="text-gray-700 dark:text-gray-300">Parallel sessions in the same time slot: choose <strong>one</strong> via dropdown</li>
<li class="text-gray-700 dark:text-gray-300">Non-parallel sessions (different time slots): choose from <strong>each</strong> independently</li>
<li class="text-gray-700 dark:text-gray-300">Sessions without papers assigned show: <em>"You can choose your sessions later"</em></li>
<li class="text-gray-700 dark:text-gray-300">Full sessions (at capacity) are hidden from dropdowns</li>
</ol>
<strong>Dependencies:</strong> Session Types (Settings 1.4.2) must be defined first. Speakers (3.2) and Locations (1.6) should exist for assignment.
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sessions appear in Program Design (2.2.1) for scheduling</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Separately bookable sessions</strong> appear as selection options during registration when linked to a booking option's program day</li>
<li class="text-gray-700 dark:text-gray-300">Session capacity limits hide full sessions from registration dropdowns</li>
<li class="text-gray-700 dark:text-gray-300">Session type colors appear in the program grid for visual identification</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Booking Options (5.1) link options to program days; if that day has bookable sessions, registrants choose one per time slot</li>
<li class="text-gray-700 dark:text-gray-300">Attendees (3.4) shows which session each registrant selected</li>
<li class="text-gray-700 dark:text-gray-300">Program Design (2.2.1) uses session types for color-coding and grouping</li>
</ul>`,
            }}
          />
        ),
      },
    ],
  },
  {
    id: 'category-3',
    name: 'People',
    description: '',
    sections: [
      {
        id: '3-1-program-committee',
        title: 'Program Committee',
        categoryId: 'category-3',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage CFP review committee members. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add committee members with name, email, affiliation</li>
<li class="text-gray-700 dark:text-gray-300">Assign committee roles (defined in Settings 1.4.1)</li>
<li class="text-gray-700 dark:text-gray-300">Set topic expertise and conflict-of-interest declarations</li>
<li class="text-gray-700 dark:text-gray-300">View assignment load per reviewer</li>
</ul>
<strong>Dependencies:</strong> Committee Roles (Settings 1.4.1) and Topics (2.1.1) should be configured first.
<strong>Consequences:</strong> Committee members can be assigned papers for review in Assignments (2.1.3). They access the review portal with their credentials.`,
            }}
          />
        ),
      },
      {
        id: '3-2-speakers',
        title: 'Speakers',
        categoryId: 'category-3',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference speakers. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">speakers</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add speakers with profile information (name, bio, photo, affiliation, social links)</li>
<li class="text-gray-700 dark:text-gray-300">Assign speakers to sessions</li>
<li class="text-gray-700 dark:text-gray-300">Upload speaker photos</li>
<li class="text-gray-700 dark:text-gray-300">Manage speaker visibility on portal</li>
</ul>
<strong>Dependencies:</strong> None (but sessions should exist for assignment).
<strong>Consequences:</strong> Speakers appear in the program grid and on the public portal. Speaker data can be used in Discount Code bulk generation (Booking Options 5.1).`,
            }}
          />
        ),
      },
      {
        id: '3-3-users-cfp-portal-users',
        title: 'Users (CFP Portal Users)',
        categoryId: 'category-3',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View and manage users who have accounts on the CFP/attendee portal. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">cfp</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View applicant profiles and submission history</li>
<li class="text-gray-700 dark:text-gray-300">Check registration status across conferences</li>
<li class="text-gray-700 dark:text-gray-300">Manage portal access permissions</li>
</ul>
<strong>Dependencies:</strong> CFP must be configured and open for submissions.
<strong>Consequences:</strong> User accounts persist across conferences within the tenant. Portal users can submit papers, register for events, and view their history.`,
            }}
          />
        ),
      },
      {
        id: '3-4-attendees',
        title: 'Attendees',
        categoryId: 'category-3',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View and manage registered attendees. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">attendees</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View attendee list with registration details, booking options, session selections</li>
<li class="text-gray-700 dark:text-gray-300">Search and filter by name, email, status (Pending Invoice / Invoiced / Paid), booking option</li>
<li class="text-gray-700 dark:text-gray-300">Export attendee data to CSV</li>
<li class="text-gray-700 dark:text-gray-300">View registration statistics (total, by booking option, by status)</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Who appears here:</strong> Only active registrations — Pending Invoice, Invoiced, and Paid. <strong>Cancelled registrations are excluded.</strong> A person whose registration was cancelled is no longer an attendee. If they re-register with the same email, a new registration is created and they appear again.</p>
<strong>Dependencies:</strong> Registration (5.2) and Booking Options (5.1) must be configured. Attendees appear here after registering.
<strong>Consequences:</strong> Attendee data feeds into Alumni records (3.6) when registration is paid.
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Registration answers to custom questions (Settings 1.4.2 > Registration Questions) are visible here</li>
<li class="text-gray-700 dark:text-gray-300">Session selections made during registration appear in attendee details</li>
<li class="text-gray-700 dark:text-gray-300">Invoice status from Invoices (5.3) determines attendee payment status</li>
</ul>`,
            }}
          />
        ),
      },
      {
        id: '3-5-badges',
        title: 'Badges',
        categoryId: 'category-3',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Generate and download printable name badges (DIN A5 PDF) for conference attendees.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Browse all active registrations with search and pagination (cancelled registrations excluded)</li>
<li class="text-gray-700 dark:text-gray-300">Select badge type (Attendee, Speaker, Sponsor, etc.) to apply the corresponding template from Badge Designer</li>
<li class="text-gray-700 dark:text-gray-300">Preview a badge inline as PDF before downloading</li>
<li class="text-gray-700 dark:text-gray-300">Download a single badge as PDF</li>
<li class="text-gray-700 dark:text-gray-300">Select multiple registrations and bulk-download as a merged multi-page PDF (no limit)</li>
</ul>
<strong>Dependencies:</strong> Badge templates must be designed in Settings > Conference Setup > Badge Designer. Registrations must exist (from Registration 5.2).
<strong>Consequences:</strong> Badges are generated on-the-fly from the current template and registration data — no stored PDFs. Changing the template immediately affects all future badge generation.`,
            }}
          />
        ),
      },
      {
        id: '3-5-volunteers',
        title: 'Volunteers',
        categoryId: 'category-3',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference volunteers and their assignments. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">volunteers</code> module.</strong></p>
<p class="text-gray-700 dark:text-gray-300 my-2">Volunteers are managed as a <strong>system role</strong>, just like Keynote, Tutorial, and other roles. Applicants are assigned the "Volunteer" role using the standard role member interface.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Assign the Volunteer role to applicants using the standard role member picker</li>
<li class="text-gray-700 dark:text-gray-300">Manage volunteer-specific profile data (t-shirt size, emergency contact, skills, availability)</li>
<li class="text-gray-700 dark:text-gray-300">Set a per-volunteer color for visual identification in assignment grids</li>
</ul>
<strong>Dependencies:</strong> Volunteer Tasks must be defined in Settings (1.4.1). Applicants must exist in the system.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">3.5.1 Task Assignment</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Assign volunteer tasks to specific sessions using a visual program grid. Drag and drop tasks onto sessions, set required volunteer count per task.</p>
<strong>Dependencies:</strong> Sessions must be scheduled in Program Design (2.2.1). Volunteer Tasks must be defined in Settings.
<strong>Consequences:</strong> Creates task requirements that need to be filled by volunteers in Volunteer Assignment.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">3.5.2 Volunteer Assignment</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Assign specific volunteers to session tasks. Visual program grid shows tasks and available volunteers. Drag and drop volunteers onto task slots.</p>
<strong>Dependencies:</strong> Task Assignment (3.5.1) must have tasks assigned to sessions. Applicants must have the Volunteer role.
<strong>Consequences:</strong> Volunteers see their assignments. Assignments appear in the Volunteer Schedule.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">3.5.3 Volunteer Schedule</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">View the complete volunteer schedule in an expandable list format. Shows each volunteer's assignments across all days with times and locations. Supports PDF export for printing.</p>
<strong>Dependencies:</strong> Volunteer Assignment (3.5.2) must be complete.`,
            }}
          />
        ),
      },
      {
        id: '3-6-alumni',
        title: 'Alumni',
        categoryId: 'category-3',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Track past conference attendees across all conferences. Core feature — no module required.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View alumni with source badges: Manual (gray), Import (blue), Registration (green)</li>
<li class="text-gray-700 dark:text-gray-300">Add alumni manually (first name, last name, email, company, notes)</li>
<li class="text-gray-700 dark:text-gray-300">Import via CSV (up to 50,000 rows; supports German column headers like "Vorname", "Nachname")</li>
<li class="text-gray-700 dark:text-gray-300">Export full alumni list to CSV</li>
<li class="text-gray-700 dark:text-gray-300">Search and filter alumni</li>
<li class="text-gray-700 dark:text-gray-300">Edit alumni records (email changes propagate to linked registration and portal records)</li>
<li class="text-gray-700 dark:text-gray-300">Cross-conference lookup: check if an email exists in other conferences</li>
</ul>
<strong>Automatic alumni creation:</strong> When a registration is paid, an alumni record is automatically created from the billing profile. No admin action required.
<strong>Alumni discount in portal registration:</strong> If a discount code with code "ALUMNI" exists and is active, it auto-applies when returning attendees register through the authenticated portal. If no ALUMNI code exists, a warning modal shows their attendance history.
<strong>Constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Email must be unique per conference (case-insensitive)</li>
<li class="text-gray-700 dark:text-gray-300">Deleting alumni does NOT delete linked registrations</li>
<li class="text-gray-700 dark:text-gray-300">Only paid registrations create alumni records automatically</li>
</ul>
<strong>Dependencies:</strong> None.
<strong>Consequences:</strong> Alumni records enable cross-conference attendee tracking and automatic discount application during portal registration.`,
            }}
          />
        ),
      },
    ],
  },
  {
    id: 'category-4',
    name: 'Partnerships',
    description: '',
    sections: [
      {
        id: '4-1-sponsors',
        title: 'Sponsors',
        categoryId: 'category-4',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference sponsors and their contracts. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">sponsors</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add sponsors with company details, logo, contact information</li>
<li class="text-gray-700 dark:text-gray-300">Assign sponsor packages (defined in Settings 1.4.2)</li>
<li class="text-gray-700 dark:text-gray-300">Create and manage sponsor contracts (rich text editor, DOCX upload, version history)</li>
<li class="text-gray-700 dark:text-gray-300">Send contracts via email with PDF/DOCX attachment</li>
<li class="text-gray-700 dark:text-gray-300">Generate invoices directly from sponsor records</li>
<li class="text-gray-700 dark:text-gray-300">Upload sponsor logos</li>
<li class="text-gray-700 dark:text-gray-300">Control sponsor visibility on portal</li>
</ul>
<strong>Contract workflow:</strong> Draft → Sent → Signed
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">sponsor_contract_send</code> — with placeholders: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Recipient Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Package Name]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Custom Message]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Contract Content]</code>
<strong>Dependencies:</strong> Sponsor Packages must be defined in Settings (1.4.2).
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sponsor data available for Discount Code bulk generation (Booking Options 5.1)</li>
<li class="text-gray-700 dark:text-gray-300">Sponsor logos may appear on portal pages</li>
<li class="text-gray-700 dark:text-gray-300">Sponsor invoices appear in the Invoices tab (5.3)</li>
</ul>`,
            }}
          />
        ),
      },
      {
        id: '4-2-service-providers',
        title: 'Service Providers',
        categoryId: 'category-4',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage external service providers for the conference (caterers, AV companies, decorators, etc.). <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">service_providers</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add providers with company details, contacts, and service descriptions</li>
<li class="text-gray-700 dark:text-gray-300">Upload attachments (contracts, quotes)</li>
<li class="text-gray-700 dark:text-gray-300">Link providers to specific locations</li>
<li class="text-gray-700 dark:text-gray-300">Track provider status and notes</li>
</ul>
<strong>Dependencies:</strong> Locations (1.6) for venue-level provider linking (optional).
<strong>Consequences:</strong> Service provider data is organizational — used for internal tracking, not displayed on the portal.`,
            }}
          />
        ),
      },
    ],
  },
  {
    id: 'category-5',
    name: 'Registration & Finance',
    description: '',
    sections: [
      {
        id: '5-1-booking-options',
        title: 'Booking Options',
        categoryId: 'category-5',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Configure the pricing structure for conference registration through a matrix of periods and options.</p>
<strong>Key concepts:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Booking Periods</strong> (columns): Time windows with specific pricing (e.g., "Early Bird: Jan-Feb", "Regular: Mar-Apr")</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Booking Options</strong> (rows): What attendees purchase (e.g., "Tutorial Day", "Day 1", "Full Conference")</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Pricing Matrix</strong>: Each cell = price for that option during that period. Empty cell = not available.</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Packages</strong>: Bundle multiple options into one purchasable item (price = sum of component prices)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Discount Codes</strong>: Percentage or fixed-amount reductions, individually created or bulk-generated</li>
</ul>
<strong>Auto-sync with program days:</strong> When you first open the Booking tab, the system automatically creates booking options from your program days and links them. Option names sync bidirectionally with program day names.
<strong>Booking Periods:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Each period has a name, start/end dates, and optional currency override</li>
<li class="text-gray-700 dark:text-gray-300">Recommended sequence: Blind Bird → Early Bird → Regular → Late/On-Site</li>
<li class="text-gray-700 dark:text-gray-300">Period dates may overlap (intentional flexibility)</li>
</ul>
<strong>Booking Options:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Each option has a name, optional description, attendance type (in_person, virtual, hybrid_onsite, hybrid_online), and optional program day link</li>
<li class="text-gray-700 dark:text-gray-300">Attendance type affects VAT calculation on invoices</li>
</ul>
<strong>Packages:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Bundle multiple options; price auto-calculates as sum of component prices per period</li>
<li class="text-gray-700 dark:text-gray-300">Changing option prices instantly recalculates package prices</li>
<li class="text-gray-700 dark:text-gray-300">Cannot delete packages with active registrations</li>
</ul>
<strong>Discount Codes:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Types: percentage or fixed amount</li>
<li class="text-gray-700 dark:text-gray-300">Scoping: apply to all options/periods, or restrict to specific ones</li>
<li class="text-gray-700 dark:text-gray-300">Usage limits: max uses (0 = unlimited), valid date range</li>
<li class="text-gray-700 dark:text-gray-300">Combinability: non-combinable (default, only one per registration) or combinable (stack multiple)</li>
<li class="text-gray-700 dark:text-gray-300">Bulk generation: create codes for Sponsors, Speakers, Committee, or custom lists using template variables (<code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[ConferenceSlug]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[FirstName]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[LastName]</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">[Counter]</code>, etc.)</li>
</ul>
<strong>Dependencies:</strong> Currency & Tax (Settings 1.4.5) should be configured first.
<strong>Constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Cannot delete options with existing registrations</li>
<li class="text-gray-700 dark:text-gray-300">Period names must be unique per conference</li>
<li class="text-gray-700 dark:text-gray-300">Option names must be unique per conference</li>
</ul>
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Options and prices appear in the registration form (public portal and admin)</li>
<li class="text-gray-700 dark:text-gray-300">Selected options generate invoice line items</li>
<li class="text-gray-700 dark:text-gray-300">Day-linked options determine which bookable sessions appear during registration</li>
<li class="text-gray-700 dark:text-gray-300">Discount codes reduce registration prices and increment usage count on confirmation</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sessions (2.3): Separately bookable sessions appear during registration if linked to an option's program day</li>
<li class="text-gray-700 dark:text-gray-300">Registration (5.2): Uses options and active period to determine pricing</li>
<li class="text-gray-700 dark:text-gray-300">Invoices (5.3): Line items derived from selected booking options</li>
<li class="text-gray-700 dark:text-gray-300">Alumni (3.6): ALUMNI discount code auto-applies for returning attendees</li>
</ul>`,
            }}
          />
        ),
      },
      {
        id: '5-2-registration',
        title: 'Registration',
        categoryId: 'category-5',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference registrations. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">registration</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create registrations (single attendee or group with shared billing)</li>
<li class="text-gray-700 dark:text-gray-300">View registration list with filters (status, booking option, date range, search)</li>
<li class="text-gray-700 dark:text-gray-300">Edit registration details: billing information, attendees, booking options, session selections</li>
<li class="text-gray-700 dark:text-gray-300">Add or remove additional items (add-on booking options)</li>
<li class="text-gray-700 dark:text-gray-300">Replace or cancel registrations</li>
<li class="text-gray-700 dark:text-gray-300">Export registration data to CSV</li>
<li class="text-gray-700 dark:text-gray-300">View registration lifecycle and status changes</li>
</ul>
<strong>Registration modes:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Single Registration</strong>: One attendee with billing info</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Group Registration</strong>: Multiple attendees sharing one billing profile</li>
</ul>
<strong>Registration statuses:</strong> Pending Invoice → Invoiced → Paid → (optionally) Cancelled
<strong>Session selection:</strong> If a booking option is linked to a program day with bookable sessions, registrants choose sessions during registration. Parallel sessions in the same time slot require choosing one; non-parallel sessions allow independent choices.
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">registration_confirmation</code>
<strong>Dependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Booking Options (5.1) must have active periods with prices</li>
<li class="text-gray-700 dark:text-gray-300">Registration Portal (Settings 1.4.2) must be enabled for public registration</li>
<li class="text-gray-700 dark:text-gray-300">Policies (Settings 1.4.2) must be defined if attendee acceptance is required</li>
</ul>
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Confirmed registrations generate invoices automatically</li>
<li class="text-gray-700 dark:text-gray-300">Paid registrations create Attendee records (3.4) and Alumni records (3.6)</li>
<li class="text-gray-700 dark:text-gray-300">Registration answers populate Analytics > Registration Questions (7.1.1)</li>
<li class="text-gray-700 dark:text-gray-300">Cancelling a registration (via invoice cancellation) revokes conference access but preserves user accounts</li>
</ul>
<strong>Interdependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Invoices (5.3): Each registration links to an invoice</li>
<li class="text-gray-700 dark:text-gray-300">Attendees (3.4): Populated from paid registrations</li>
<li class="text-gray-700 dark:text-gray-300">Alumni (3.6): Auto-created from paid registrations</li>
<li class="text-gray-700 dark:text-gray-300">Booking Options (5.1): Determines pricing and available options</li>
</ul>`,
            }}
          />
        ),
      },
      {
        id: '5-3-invoices',
        title: 'Invoices',
        categoryId: 'category-5',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Create, send, and manage invoices. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoices</code> module.</strong></p>
<strong>Invoice types:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Bank Transfer</strong>: Traditional invoice with bank details; manual payment reconciliation</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Credit Card</strong>: Stripe-integrated with automatic payment link and webhook-based status updates</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Credit Note</strong>: Negative invoice for cancellations; auto-generated, immutable</li>
</ul>
<strong>Invoice statuses:</strong> Draft → Sent → Paid (or: Sent → Overdue → Paid/Cancelled)
<strong>Status rules:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Draft</strong>: Fully editable, deletable, no invoice number yet</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sent</strong>: Read-only, invoice number assigned, email sent with PDF</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Overdue</strong>: Auto-set when due date passes (sent invoices transition automatically)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Paid</strong>: Payment received (manual mark or Stripe webhook)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Cancelled</strong>: Voided with credit note created; immutable</li>
</ul>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create invoices with recipient details, line items, due date</li>
<li class="text-gray-700 dark:text-gray-300">Search recipients from sponsors, speakers, registrations</li>
<li class="text-gray-700 dark:text-gray-300">Send invoices (generates number, creates payment link for credit card, emails PDF)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Replace Invoice</strong>: Correct billing info on sent invoices (original cancelled with credit note, new invoice created with corrected data — all registrations stay linked)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Cancel Invoice</strong>: Void with credit note; optionally cancel linked registrations and refund Stripe payments</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Mark as Paid</strong>: For bank transfer invoices with payment date and comment</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Convert to Credit Card</strong>: Change bank transfer invoice to credit card (creates Stripe payment link)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Reopen</strong>: Move paid/cancelled invoice back to sent status</li>
<li class="text-gray-700 dark:text-gray-300">Resend invoices (same number, logged as resend)</li>
<li class="text-gray-700 dark:text-gray-300">View audit trail (Events tab: creation, sends, payments, refunds, status changes)</li>
</ul>
<strong>VAT handling:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">VAT automatically calculated based on: conference country, customer country, attendance type, B2B vs B2C</li>
<li class="text-gray-700 dark:text-gray-300"><strong>VAT number required</strong> (red warning): Virtual/hybrid conferences with EU B2B customers (reverse charge)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>VAT number recommended</strong> (yellow warning): In-person conferences with EU B2B customers</li>
<li class="text-gray-700 dark:text-gray-300">VAT number validated via 3-stage cascade: format check → regex → VIES EU registry</li>
</ul>
<strong>Email templates used:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_sent</code> — when sending an invoice</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_cancelled</code> — when cancelling with credit note</li>
<li class="text-gray-700 dark:text-gray-300"><code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoice_replaced</code> — when replacing an invoice</li>
</ul>
<strong>Stripe integration:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Credit card invoices include "Pay Online" button linking to Stripe checkout</li>
<li class="text-gray-700 dark:text-gray-300">Webhooks auto-update status to "paid" on successful payment</li>
<li class="text-gray-700 dark:text-gray-300">Manual sync available if webhooks fail</li>
</ul>
<strong>ZUGFeRD/Factur-X:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">When enabled (Settings 1.4.5), invoice PDFs include embedded XML for automated processing</li>
<li class="text-gray-700 dark:text-gray-300">Validation endpoint checks compliance before sending</li>
</ul>
<strong>Dependencies:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Company Data, Bank Accounts, Invoice Templates (Settings 1.4.5) should be configured</li>
<li class="text-gray-700 dark:text-gray-300">Stripe Setup (Settings 1.4.5) required for credit card invoices</li>
<li class="text-gray-700 dark:text-gray-300">Currency & Tax (Settings 1.4.5) for VAT rules</li>
</ul>
<strong>Constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Sent invoices cannot be edited (use Replace or Cancel + recreate)</li>
<li class="text-gray-700 dark:text-gray-300">Invoice numbers are sequential and immutable</li>
<li class="text-gray-700 dark:text-gray-300">Credit notes cannot be deleted</li>
<li class="text-gray-700 dark:text-gray-300">At least one billing field must differ for Replace Invoice to work</li>
</ul>
<strong>Consequences:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Invoice status drives Payment Reminders (5.4) — only sent/overdue invoices get reminders</li>
<li class="text-gray-700 dark:text-gray-300">Paid invoices mark registrations as paid, creating Attendee and Alumni records</li>
<li class="text-gray-700 dark:text-gray-300">Cancelled invoices with registrations can revoke conference access</li>
<li class="text-gray-700 dark:text-gray-300">All actions logged in audit trail (Events tab)</li>
</ul>`,
            }}
          />
        ),
      },
      {
        id: '5-4-payment-reminders',
        title: 'Payment Reminders',
        categoryId: 'category-5',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View and manage automated payment reminders for overdue invoices. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoices</code> module.</strong></p>
<strong>How it works:</strong>
<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Daily system check scans all conferences for overdue invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>1st Reminder</strong> (default: 2 days after due date): Friendly payment reminder email</li>
<li class="text-gray-700 dark:text-gray-300"><strong>2nd Reminder</strong> (default: 17 days after due date): Firmer reminder email</li>
<li class="text-gray-700 dark:text-gray-300">After 2nd reminder: Admin notification email (if enabled)</li>
</ol>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">View reminder history with stats bar (pending, sent, failed counts)</li>
<li class="text-gray-700 dark:text-gray-300">Filter by status (pending/sent/failed), reminder number (1st/2nd), search by invoice number or recipient</li>
<li class="text-gray-700 dark:text-gray-300">Resend failed or previously sent reminders manually</li>
<li class="text-gray-700 dark:text-gray-300">Click any reminder row to navigate to the linked invoice</li>
</ul>
<strong>Email templates used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_first</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">payment_reminder_second</code>
<strong>Constraints:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Maximum one 1st reminder and one 2nd reminder per invoice</li>
<li class="text-gray-700 dark:text-gray-300">Only active invoices (sent or overdue status) receive reminders</li>
<li class="text-gray-700 dark:text-gray-300">Credit notes, paid, and cancelled invoices are excluded</li>
<li class="text-gray-700 dark:text-gray-300">Invoices without recipient email are skipped</li>
<li class="text-gray-700 dark:text-gray-300">Invoices auto-transition from "sent" to "overdue" when past due date</li>
</ul>
<strong>Dependencies:</strong> Payment Reminder settings (Settings 1.4.5) must be enabled. Email templates should be configured.
<strong>Consequences:</strong> All reminder activity logged in the invoice audit trail (Events tab in Invoices 5.3).
<strong>Configuration:</strong> Settings > Finance > Payment Reminders (1.4.5) controls timing and admin notification.`,
            }}
          />
        ),
      },
      {
        id: '5-5-cost-management',
        title: 'Cost Management',
        categoryId: 'category-5',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Track and manage conference costs and budgets. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">invoices</code> module.</strong></p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">5.5.1 Budget Planning</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Each conference has exactly <strong>one budget</strong>, which is always active and feeds directly into the Financial Reports tab.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add line items with description, planned amount, actual amount, category, and vendor</li>
<li class="text-gray-700 dark:text-gray-300">Create and manage <strong>categories</strong> with colors for organized tracking</li>
<li class="text-gray-700 dark:text-gray-300">Track planned vs. actual spending per line item and category</li>
<li class="text-gray-700 dark:text-gray-300">View summary cards: <strong>Total Budget</strong>, <strong>Spent</strong>, <strong>Remaining</strong>, and <strong>% Used</strong></li>
</ul>
<strong>How costs flow into Financial Reports:</strong> The budget's planned and actual amounts are automatically included in the Financial Reports tab under "Budget Variance by Category". If you have entered actual amounts, those are used; otherwise planned amounts are used as the cost estimate. Approved speaker expenses are added on top.
<strong>Best practice:</strong> Enter planned amounts when budgeting, then update actual amounts as costs are incurred. This gives you a live variance view in Financial Reports.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">5.5.2 Speaker Expenses</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Manage speaker expense allowances and track spending per speaker.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Set expense tiers with allowance amounts (e.g., Keynote: €1,500, Regular: €800)</li>
<li class="text-gray-700 dark:text-gray-300">Assign tiers to speakers</li>
<li class="text-gray-700 dark:text-gray-300">View submitted expenses with status (pending, approved, paid, rejected)</li>
<li class="text-gray-700 dark:text-gray-300">Approve or reject individual expenses</li>
<li class="text-gray-700 dark:text-gray-300">Track spending per speaker — the header shows the <strong>approved total</strong> (approved + paid expenses only)</li>
<li class="text-gray-700 dark:text-gray-300">Progress bar shows approved amount vs. tier allowance</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Send message to speaker</strong> — click the envelope icon next to a speaker to open a compose modal pre-filled with the speaker as recipient and "Regarding your speaker expenses" as subject</li>
</ul>
<strong>Dependencies:</strong> Speakers (3.2) must exist. Expense tiers must be configured.
<strong>Consequences:</strong> Approved expenses contribute to the total shown in the speaker header. Messages sent via the envelope icon appear in the Messages tab (6.1).`,
            }}
          />
        ),
      },
    ],
  },
  {
    id: 'category-6',
    name: 'Communications',
    description: '',
    sections: [
      {
        id: '6-1-messages',
        title: 'Messages',
        categoryId: 'category-6',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">In-app messaging system for conference communications.</p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Compose and send messages to individuals or groups</li>
<li class="text-gray-700 dark:text-gray-300">Use message templates (from Settings 1.4.4)</li>
<li class="text-gray-700 dark:text-gray-300">Bulk send to recipient lists (from Settings 1.4.4)</li>
<li class="text-gray-700 dark:text-gray-300">Attach files to messages</li>
<li class="text-gray-700 dark:text-gray-300">Filter messages by status (read/unread), date, sender</li>
<li class="text-gray-700 dark:text-gray-300">Archive, flag, or export messages</li>
<li class="text-gray-700 dark:text-gray-300">Messages can optionally trigger email notifications</li>
</ul>
<strong>Dependencies:</strong> Recipient Lists (Settings 1.4.4) for bulk messaging. Message Templates (Settings 1.4.4) for reusable content.
<strong>Consequences:</strong> Recipients receive in-app notifications. If email notifications are enabled, recipients also get email alerts.`,
            }}
          />
        ),
      },
      {
        id: '6-2-news',
        title: 'News',
        categoryId: 'category-6',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Publish news articles and announcements. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">news</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Create articles with title, rich-text content, and optional attachments</li>
<li class="text-gray-700 dark:text-gray-300">Save as draft or publish immediately</li>
<li class="text-gray-700 dark:text-gray-300">Distribute published articles via email to recipient lists</li>
<li class="text-gray-700 dark:text-gray-300">View articles on the public portal</li>
<li class="text-gray-700 dark:text-gray-300">Edit or unpublish articles</li>
</ul>
<strong>Email template used:</strong> <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">news_distribution</code>
<strong>Dependencies:</strong> Recipient Lists (Settings 1.4.4) for email distribution.
<strong>Consequences:</strong> Published articles appear on the applicant/attendee portal. Email distribution sends the article content to selected recipient groups.`,
            }}
          />
        ),
      },
    ],
  },
  {
    id: 'category-7',
    name: 'Insights',
    description: '',
    sections: [
      {
        id: '7-1-analytics',
        title: 'Analytics',
        categoryId: 'category-7',
        content: () => (
          <div
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-700 dark:text-gray-300 my-2">View conference data analytics and reports. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">analytics</code> module.</strong></p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.1 Registration Questions</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">View aggregated responses to custom registration questions. Displays horizontal bar charts showing how attendees answered each question configured in Settings (1.4.2 > Registration Questions).</p>
<strong>What you see:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Each question is displayed as a card with a horizontal bar chart</li>
<li class="text-gray-700 dark:text-gray-300">Each bar shows the <strong>answer label</strong> on the left and the count on the right</li>
<li class="text-gray-700 dark:text-gray-300">Bar width is proportional to the response count relative to the most popular answer</li>
<li class="text-gray-700 dark:text-gray-300">Total response count is shown per question</li>
</ul>
<strong>Dependencies:</strong> Registration Questions must be configured in Settings. Registrations with answers must exist.
<strong>Consequences:</strong> Read-only analytics view — does not modify any data.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.2 Conference Statistics</h4>
<em>Coming soon.</em> This sub-tab will provide statistics and insights across conference data (registrations, revenue, attendance patterns).
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.3 Revenue Tracking</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Real-time revenue analytics using invoices as the authoritative source of truth. Credit notes and cancelled invoices are excluded from all totals.</p>
<strong>KPI Cards:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Total Revenue</strong> — Sum of all active (non-cancelled) registration and sponsor invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Registration Revenue</strong> — Total from registration invoices (direct from invoice totals)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sponsor Revenue</strong> — Total from sponsor invoices</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Outstanding</strong> — Receivables from sent-but-not-yet-paid invoices (excludes credit notes)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Attendees</strong> — Active registrations (cancelled registrations excluded)</li>
</ul>
<strong>Revenue Streams table:</strong> Breaks down revenue by source — Sponsors, Registrations (per booking option with attendee counts and period drill-down), and any unattributed amounts. Grand Total always matches the sum of actual invoices.
<strong>Exports:</strong> CSV and XLSX.
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">7.1.4 Financial Reports</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">P&amp;L summary combining revenue, budget costs, and speaker expenses.</p>
<strong>P&amp;L Summary KPIs:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Total Revenue</strong> — All invoice revenue (same as Revenue Tracking)</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Outstanding</strong> — Receivables</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Total Costs</strong> — Budget amounts (actual if entered, else planned) + approved/paid speaker expenses</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Net Result</strong> — Revenue minus costs (green = profit, red = loss)</li>
</ul>
<strong>Revenue Streams section:</strong> Same breakdown as Revenue Tracking — Sponsors, per-booking-option registration revenue, and unattributed amounts.
<strong>Budget Variance by Category:</strong> For each budget category shows Planned, Actual, Variance, and % — requires a budget with line items.
<strong>Cost Per Attendee:</strong> Total costs and revenue divided by active attendee count.
<strong>Export:</strong> PDF with full P&amp;L, variance table, and revenue breakdown.
<strong>Note:</strong> The budget is always included automatically — there is no need to activate it. Speaker expenses are included if the expenses module is enabled.`,
            }}
          />
        ),
      },
    ],
  },
  {
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
              __html: `<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg"><thead><tr class="bg-gray-50 dark:bg-gray-800"><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Term</th><th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Definition</th></tr></thead><tbody><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Option</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A purchasable registration item (e.g., "Day 1 Pass", "Tutorial")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Period</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A time window with specific pricing (e.g., "Early Bird")</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Booking Package</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A bundle of multiple booking options at a combined price</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>CFP</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Call for Papers — the submission and review process for academic/technical papers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Credit Note</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A negative invoice issued when cancelling a sent invoice</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Discount Code</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A code that applies a percentage or fixed reduction to registration pricing</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Module</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A feature set that can be enabled/disabled per tenant (e.g., cfp, invoices, volunteers)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Portal</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">The public-facing website where attendees register and applicants submit papers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>RLS</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">Row-Level Security — database-level tenant data isolation</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Reverse Charge</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">EU VAT mechanism where the buyer (not seller) accounts for VAT on cross-border B2B services</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Screen Overlay</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">A full-screen announcement shown to portal users on login</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>Tenant</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">An organization using SaaSConf (each tenant's data is fully isolated)</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>VIES</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">EU VAT Information Exchange System — online service for validating EU VAT numbers</td></tr><tr class="border-b border-gray-100 dark:border-gray-700"><td class="px-3 py-2 text-gray-700 dark:text-gray-300"><strong>ZUGFeRD</strong></td><td class="px-3 py-2 text-gray-700 dark:text-gray-300">German/EU standard for hybrid invoices (PDF with embedded XML for automated processing)</td></tr></tbody></table></div>`,
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
</ul>`,
            }}
          />
        ),
      },
    ],
  },
];

// Flatten for backward compatibility
export const handbookSections: HandbookSection[] = handbookCategories.flatMap(
  (cat) => cat.sections
);
