import type { HandbookCategory } from '../handbookSections';

export const peopleCategory: HandbookCategory = {
  id: 'category-3',
  name: 'People',
  description: '',
  moduleCode: 'conferences',
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
            __html: `<p class="text-gray-700 dark:text-gray-300 my-2">Manage conference speakers and role-based participants. <strong>Requires: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">speakers</code> module.</strong></p>
<strong>What you can do:</strong>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300">Add speakers with profile information (name, bio, photo, affiliation, social links)</li>
<li class="text-gray-700 dark:text-gray-300">Assign speakers to sessions</li>
<li class="text-gray-700 dark:text-gray-300">Upload speaker photos</li>
<li class="text-gray-700 dark:text-gray-300">Manage speaker visibility on portal</li>
</ul>
<strong>Role-Based Sub-Tabs:</strong>
<p class="text-gray-700 dark:text-gray-300 my-2">The Speakers section expands into sub-tabs for each system User Role (defined in Settings 1.4.1):</p>
<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">
<li class="text-gray-700 dark:text-gray-300"><strong>Keynotes</strong> — Keynote speaker management</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Tutorials</strong> — Tutorial facilitator management</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Social Events</strong> — Social event host management</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Bonus Sessions</strong> — Bonus session speaker management</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Active Sessions</strong> — Active session speaker management</li>
<li class="text-gray-700 dark:text-gray-300"><strong>Sponsor Talks</strong> — Sponsor talk presenter management</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2">Each sub-tab lists the applicants assigned to that role with their profile picture, name, email, and company. Admins can add members by searching through applicants and remove members individually.</p>
<strong>Dependencies:</strong> User Roles (Settings 1.4.1) define the available sub-tabs. Applicants must exist for assignment.
<strong>Consequences:</strong> Speakers appear in the program grid and on the public portal. Speaker data can be used in Discount Code bulk generation (Booking Options 5.1). Role members are targetable in Bulk Messaging (6.1).`,
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
<li class="text-gray-700 dark:text-gray-300">Edit user profiles including personal info, bio, social links, and <strong>address</strong> (address line 1, address line 2, city, postal code, country)</li>
<li class="text-gray-700 dark:text-gray-300">Check registration status across conferences</li>
<li class="text-gray-700 dark:text-gray-300">Manage portal access permissions</li>
</ul>
<p class="text-gray-700 dark:text-gray-300 my-2"><strong>Admin actions &amp; history:</strong> The unified admin panel at <strong>My Company &rarr; Users</strong> offers five portal-user actions with full audit trail \u2014 <em>Toggle access</em>, <em>Resend invite</em>, <em>Reset password</em>, <em>Impersonate</em>, and <em>Merge with...</em>. Each action writes both an <code>audit_logs</code> row and a per-user history entry visible on the user\u2019s <em>History</em> tab. Deactivation is blocked while the user is linked to an active conference paper (not draft/rejected) or an active conference registration \u2014 the 409 response tells the admin exactly which side blocks the change.</p>
<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">User Address</h4>
<p class="text-gray-700 dark:text-gray-300 my-2">Each portal user can have an address stored on their profile. The address is editable by both the admin (in the user form) and the user themselves (in the portal profile page). When a user registers for a conference via the authenticated registration form, their profile address is used to pre-fill the billing address fields. <strong>Note:</strong> Invoice addresses are frozen at creation time and are never affected by later profile changes.</p>
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
};
