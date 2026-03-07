import type { ReactNode } from 'react';

export interface HandbookSection {
  id: string;
  title: string;
  content: () => ReactNode;
}

export const handbookSections: HandbookSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: () => (
      <>
        <p>
          Welcome to <strong>SaaSConf</strong>, the conference management platform. This handbook
          guides you through every feature available to tenant administrators.
        </p>
        <h3>Dashboard</h3>
        <p>
          After logging in you land on the <strong>Dashboard</strong>. It provides a quick overview
          of your upcoming conferences, recent activity, and key metrics such as registrations,
          submitted papers, and unread messages.
        </p>
        <h3>Navigation</h3>
        <p>The sidebar on the left organises the platform into several areas:</p>
        <ul>
          <li>
            <strong>Dashboard</strong> &mdash; overview and quick stats.
          </li>
          <li>
            <strong>Modules</strong> &mdash; feature areas like Conferences, Volunteers, Locations,
            and Call for Papers. Only modules assigned to your company are visible.
          </li>
          <li>
            <strong>Management</strong> &mdash; My Company, Team, and Activity Log.
          </li>
          <li>
            <strong>Handbook</strong> &mdash; this page.
          </li>
        </ul>
        <p>
          The sidebar can be collapsed using the chevron button at the top. On mobile devices, open
          it with the hamburger menu in the header.
        </p>
        <h3>Module System</h3>
        <p>
          Access to platform features is controlled by <strong>modules</strong>. A super
          administrator assigns modules to your company. Only users with the corresponding module
          will see the navigation entry and be able to access its pages. If you need access to an
          additional module, ask your super administrator to enable it.
        </p>
        <h3>Roles</h3>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tenant Admin</td>
              <td>
                Full access to all company-level features, team management, and company settings.
              </td>
            </tr>
            <tr>
              <td>User</td>
              <td>Access to assigned modules only. Cannot manage team or company settings.</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'conferences',
    title: 'Conferences',
    content: () => (
      <>
        <p>
          Conferences are the central entity of the platform. Everything &mdash; registrations,
          programs, sponsors, invoices &mdash; is linked to a conference.
        </p>
        <h3>Creating a Conference</h3>
        <p>
          Navigate to <strong>Modules &rarr; Conferences</strong> and click{' '}
          <strong>New Conference</strong>. Provide at least a name and abbreviation. The
          abbreviation is used in URLs and must be unique within your company.
        </p>
        <h3>Details Tab</h3>
        <p>On the conference detail page, the Details tab lets you manage:</p>
        <ul>
          <li>
            <strong>Name &amp; Abbreviation</strong> &mdash; the public name and short code.
          </li>
          <li>
            <strong>Dates</strong> &mdash; start and end dates for the conference.
          </li>
          <li>
            <strong>Venue</strong> &mdash; name and address of the venue.
          </li>
          <li>
            <strong>Phone</strong> &mdash; the conference contact phone number (international
            format).
          </li>
          <li>
            <strong>Logo</strong> &mdash; upload a conference logo displayed on the portal and
            documents.
          </li>
          <li>
            <strong>Portal URL</strong> &mdash; the public applicant portal link, generated from
            your company slug and conference abbreviation.
          </li>
          <li>
            <strong>Social Media</strong> &mdash; links to the conference&rsquo;s social profiles
            (website, Twitter/X, LinkedIn, etc.).
          </li>
        </ul>
        <h3>Conference Team</h3>
        <p>
          The Team tab lets you add team members to a specific conference. Team members are drawn
          from your company&rsquo;s user list. Assigning someone to a conference team does not
          change their platform role &mdash; it only links them to that conference for
          organisational purposes.
        </p>
      </>
    ),
  },
  {
    id: 'fiscal-representative',
    title: 'Fiscal Representative',
    content: () => (
      <>
        <p>
          The <strong>Fiscal Representative</strong> section is part of each conference&rsquo;s
          settings. It holds the legally required billing entity information for EU tax compliance.
        </p>
        <h3>When is this needed?</h3>
        <p>
          If your conference collects payments or issues invoices in an EU country, you may need a
          fiscal representative &mdash; a local company that handles VAT registration and tax
          obligations on your behalf. The data entered here appears on invoices and official
          documents.
        </p>
        <h3>Company Information</h3>
        <ul>
          <li>
            <strong>Company Name</strong> &mdash; the legal name of the fiscal representative.
          </li>
          <li>
            <strong>Address</strong> &mdash; full postal address (street, city, postal code,
            country).
          </li>
          <li>
            <strong>Tax IDs</strong> &mdash; VAT number, commercial register number, and other
            relevant tax identifiers.
          </li>
          <li>
            <strong>Contact Persons</strong> &mdash; one or more individuals responsible for fiscal
            matters, with name, email, and phone.
          </li>
        </ul>
        <h3>Field Validation</h3>
        <p>The following fields are validated both when you type (on blur) and when you save:</p>
        <ul>
          <li>
            <strong>VAT Numbers</strong> &mdash; must follow the EU format: a 2-letter country code
            followed by 2&ndash;12 alphanumeric characters (e.g. <code>DE123456789</code>,{' '}
            <code>NL123456789B01</code>). Spaces, hyphens, and dots are stripped automatically.
          </li>
          <li>
            <strong>Email</strong> &mdash; must be a valid email address (e.g.{' '}
            <code>contact@example.com</code>).
          </li>
          <li>
            <strong>Website</strong> &mdash; must be a valid URL. You can enter just the domain
            (e.g. <code>example.com</code>) and <code>https://</code> will be prepended
            automatically.
          </li>
          <li>
            <strong>Phone</strong> &mdash; must use international format with a country code (e.g.{' '}
            <code>+49123456789</code>).
          </li>
        </ul>
        <p>
          Invalid fields are highlighted with a red border and an error message appears below the
          field. You must fix all validation errors before saving.
        </p>
      </>
    ),
  },
  {
    id: 'booking-registration',
    title: 'Booking & Registration',
    content: () => (
      <>
        <p>
          The registration module handles attendee sign-ups, pricing, and payment for conferences.
        </p>
        <h3>Booking Periods</h3>
        <p>
          A <strong>booking period</strong> defines when registrations are open. You can create
          multiple periods (e.g. &ldquo;Early Bird&rdquo;, &ldquo;Regular&rdquo;, &ldquo;Late
          Registration&rdquo;) with different date ranges and pricing.
        </p>
        <h3>Booking Options</h3>
        <p>
          Within each period, create <strong>booking options</strong>. Each option can be linked to
          one or more <strong>program days</strong>, defining which days the attendee gains access
          to.
        </p>
        <h3>Pricing Matrix</h3>
        <p>
          Prices are defined per booking option and can vary by attendee category (e.g. Student,
          Professional, Academic). The pricing matrix makes it easy to see and edit all
          combinations.
        </p>
        <h3>Discount Codes</h3>
        <p>Discount codes reduce the registration price. Two types are available:</p>
        <ul>
          <li>
            <strong>Percentage</strong> &mdash; reduces the price by a percentage (e.g. 20% off).
          </li>
          <li>
            <strong>Fixed amount</strong> &mdash; reduces the price by a fixed monetary value.
          </li>
        </ul>
        <p>
          Codes can be generated in bulk with <strong>template variables</strong> for unique
          per-attendee codes (e.g. <code>CONF2025-{'{{INDEX}}'}</code> generates{' '}
          <code>CONF2025-001</code>, <code>CONF2025-002</code>, etc.).
        </p>
        <h3>Session Selection</h3>
        <p>
          When a booking option is linked to a program day that contains sessions marked as{' '}
          <strong>separately bookable</strong>, registrants will see dropdown menus to choose
          sessions during registration. Sessions are grouped by <strong>session type</strong> (e.g.
          Tutorial, Hackathon). Key rules:
        </p>
        <ul>
          <li>Parallel sessions in the same time slot: choose one via dropdown.</li>
          <li>Non-parallel sessions in different slots: choose from each independently.</li>
          <li>
            Sessions without papers assigned show:{' '}
            <em>&ldquo;You can choose your sessions later. We will come back to you.&rdquo;</em>
          </li>
          <li>
            Session time labels account for multi-slot spans (e.g. a full-day tutorial shows
            09:00&ndash;17:00).
          </li>
        </ul>
        <h3>Registration Modes</h3>
        <table>
          <thead>
            <tr>
              <th>Mode</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Single Registration</td>
              <td>One attendee with their own billing information.</td>
            </tr>
            <tr>
              <td>Group Registration</td>
              <td>Multiple attendees sharing a single billing profile.</td>
            </tr>
          </tbody>
        </table>
        <h3>VAT Validation</h3>
        <p>
          When a company name and EU country are provided, the system validates the VAT number using
          a <strong>three-stage cascade</strong>:
        </p>
        <ol>
          <li>
            <strong>python-stdnum</strong> &mdash; offline format and checksum validation (fast).
          </li>
          <li>
            <strong>Regex fallback</strong> &mdash; basic country-specific format check if stdnum is
            unavailable.
          </li>
          <li>
            <strong>VIES API</strong> &mdash; online verification against the EU registry if regex
            passed but stdnum failed.
          </li>
        </ol>
        <p>Results are shown with colour-coded borders:</p>
        <ul>
          <li>
            <strong>Green</strong> &mdash; valid (confirmed by stdnum or VIES).
          </li>
          <li>
            <strong>Red</strong> &mdash; invalid (registration still proceeds, but VAT is flagged).
          </li>
          <li>
            <strong>Yellow</strong> &mdash; uncertain (format OK but VIES unavailable for online
            check).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'call-for-papers',
    title: 'Call for Papers (CFP)',
    content: () => (
      <>
        <p>
          The Call for Papers module manages the full lifecycle of paper submissions: from defining
          topics to reviewing and accepting papers.
        </p>
        <h3>Topics &amp; Tracks</h3>
        <p>
          Define <strong>topics</strong> (sometimes called tracks) that applicants can submit papers
          to. Topics help organise the review process and the final program.
        </p>
        <h3>Program Committee</h3>
        <p>
          The <strong>Program Committee</strong> page lets you manage reviewers. Committee members
          are drawn from the applicant pool &mdash; they must first register on the portal. You can:
        </p>
        <ul>
          <li>Add members by searching the applicant list.</li>
          <li>
            Assign <strong>roles</strong> (e.g. Chair, Reviewer, Advisor) per committee member.
          </li>
          <li>View and paginate the committee list (up to 500 per page).</li>
        </ul>
        <h3>Applicant Portal</h3>
        <p>
          Applicants access a dedicated portal (public URL) where they can register, verify their
          email, submit papers, and track submissions. The portal is branded with your conference
          logo and information.
        </p>
        <h3>Paper Submissions</h3>
        <p>
          Applicants submit papers through the portal. Each submission includes a title, abstract,
          selected topic, optional co-authors, and any custom fields you define in the{' '}
          <strong>Paper Form Builder</strong> (see Settings section).
        </p>
        <h3>Reviewer Assignments</h3>
        <p>
          On the <strong>Assignments</strong> page, assign papers to committee members for review.
          The system shows each paper&rsquo;s topic, current status, and how many reviews have been
          completed.
        </p>
        <h3>Evaluation Workflow</h3>
        <p>
          Reviewers score papers against configurable <strong>review criteria</strong> using a{' '}
          <strong>score scale</strong> (both defined in Settings). Once all assigned reviews are
          complete, the paper moves to the &ldquo;Evaluated&rdquo; state.
        </p>
        <h3>Acceptance &amp; Rejection</h3>
        <p>
          From the <strong>Evaluated Papers</strong> page, accept or reject papers. Accepted papers
          appear in the &ldquo;Accepted Papers&rdquo; list and can be linked to program sessions.
          Rejected papers appear in the &ldquo;Rejected Papers&rdquo; list.
        </p>
        <h3>Paper Statuses</h3>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Submitted</td>
              <td>Paper received, awaiting reviewer assignment.</td>
            </tr>
            <tr>
              <td>Under Review</td>
              <td>Assigned to reviewers, evaluations in progress.</td>
            </tr>
            <tr>
              <td>Evaluated</td>
              <td>All reviews complete, awaiting accept/reject decision.</td>
            </tr>
            <tr>
              <td>Accepted</td>
              <td>Paper accepted into the conference program.</td>
            </tr>
            <tr>
              <td>Rejected</td>
              <td>Paper not accepted.</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'program',
    title: 'Program',
    content: () => (
      <>
        <p>
          The Program module provides tools for designing the conference schedule and linking
          content to time slots.
        </p>
        <h3>Program Design</h3>
        <p>
          The <strong>Program Design</strong> tab displays a visual grid with days as columns, time
          slots as rows, and tracks as sub-columns. You can:
        </p>
        <ul>
          <li>
            <strong>Add days</strong> &mdash; each day represents a date in the conference schedule.
          </li>
          <li>
            <strong>Add time slots</strong> &mdash; define start and end times for each slot (e.g.
            09:00&ndash;10:30).
          </li>
          <li>
            <strong>Add tracks</strong> &mdash; parallel tracks within a day (e.g. Track A, Track
            B).
          </li>
          <li>
            <strong>Create sessions</strong> &mdash; click on a cell in the grid to create a session
            for that slot and track.
          </li>
        </ul>
        <h3>Program Build</h3>
        <p>
          The <strong>Program Build</strong> tab links accepted papers to sessions. Drag papers from
          the sidebar into session slots on the grid. The sidebar shows a filterable list of
          accepted papers with their topics, authors, and current assignment status.
        </p>
        <h3>Sessions</h3>
        <p>
          Each session has a title, optional description, session type, assigned track and time
          slot, and can hold one or more papers. Sessions marked as{' '}
          <strong>separately bookable</strong> appear in the registration flow for attendees to
          choose.
        </p>
        <h3>Session Types</h3>
        <p>
          Session types (e.g. Keynote, Workshop, Tutorial, Panel) are configurable in{' '}
          <strong>Settings &rarr; Conference Setup</strong>. They help categorise sessions and can
          affect how they appear in the registration flow and the public program.
        </p>
      </>
    ),
  },
  {
    id: 'sponsors',
    title: 'Sponsors',
    content: () => (
      <>
        <p>
          The Sponsors tab on each conference manages sponsor relationships, packages, contacts, and
          contracts.
        </p>
        <h3>Sponsor Management</h3>
        <p>
          Add sponsors to a conference with their company name, website, and description. Each
          sponsor can be assigned a <strong>package</strong> (tier).
        </p>
        <h3>Packages</h3>
        <p>
          Sponsor packages (e.g. Gold, Silver, Bronze) are defined in{' '}
          <strong>Settings &rarr; Conference Setup &rarr; Sponsor Packages</strong>. Each package
          has a name and display order. Assigning a package to a sponsor determines their tier and
          visibility.
        </p>
        <h3>Contact Persons</h3>
        <p>
          Each sponsor can have one or more contact persons with name, email, phone, and role (e.g.
          Marketing Manager, CEO).
        </p>
        <h3>Logo Upload</h3>
        <p>
          Upload a sponsor logo (PNG, JPG, SVG). The logo is displayed on the conference portal and
          can be included in printed materials and exports.
        </p>
        <h3>Contracts</h3>
        <p>The platform supports a full contract workflow for sponsors:</p>
        <ul>
          <li>
            <strong>Create</strong> &mdash; from a template or upload a DOCX file.
          </li>
          <li>
            <strong>Edit</strong> &mdash; modify contract details and terms.
          </li>
          <li>
            <strong>Version History</strong> &mdash; track changes across contract revisions.
          </li>
          <li>
            <strong>Send via Email</strong> &mdash; deliver the contract directly to the
            sponsor&rsquo;s contact person.
          </li>
        </ul>
        <p>
          Contract statuses progress through: <code>Draft</code> &rarr; <code>Sent</code> &rarr;{' '}
          <code>Signed</code>.
        </p>
        <h3>Export</h3>
        <p>Contracts and sponsor summaries can be exported as PDF or DOCX documents.</p>
      </>
    ),
  },
  {
    id: 'volunteers',
    title: 'Volunteers',
    content: () => (
      <>
        <p>
          The Volunteers module manages a tenant-wide pool of volunteers and their assignments to
          conference tasks.
        </p>
        <h3>Volunteer Pool</h3>
        <p>
          Navigate to <strong>Modules &rarr; Volunteers</strong> to manage your company&rsquo;s
          volunteer pool. Volunteers are shared across all conferences. Each volunteer has a name,
          email, phone, and optional colour code for visual identification on the schedule grid.
        </p>
        <h3>Linking to Conferences</h3>
        <p>
          On a conference&rsquo;s <strong>Volunteers</strong> tab, link volunteers from the pool to
          that specific conference. Only linked volunteers can be assigned to tasks or sessions for
          that conference.
        </p>
        <h3>Task Assignment</h3>
        <p>
          The <strong>Task Assignment</strong> tab displays the program grid with all sessions. Drag
          and drop volunteer tasks from a sidebar onto session cells to assign them. Tasks are
          colour-coded by task type (defined in{' '}
          <strong>Settings &rarr; People &amp; Roles &rarr; Volunteer Tasks</strong>).
        </p>
        <h3>Volunteer Assignment</h3>
        <p>
          The <strong>Volunteer Assignment</strong> tab shows the same program grid but focuses on
          assigning specific volunteers to tasks. Drag a volunteer from the sidebar onto a task cell
          to assign them. The volunteer&rsquo;s colour appears on the grid for easy identification.
        </p>
        <h3>Volunteer Schedule</h3>
        <p>
          The <strong>Volunteer Schedule</strong> tab provides a per-volunteer view of their
          assignments across all days. Use this to check for conflicts (overlapping assignments) and
          to review each person&rsquo;s workload.
        </p>
        <h3>PDF Export</h3>
        <p>
          Export individual volunteer schedules as PDF. A <strong>bulk export</strong> generates a
          ZIP file containing a PDF for each assigned volunteer &mdash; useful for printing and
          distributing schedules.
        </p>
      </>
    ),
  },
  {
    id: 'alumni',
    title: 'Alumni',
    content: () => (
      <>
        <p>
          The <strong>Alumni</strong> tab on each conference tracks past attendees. Knowing who has
          attended previous conferences helps you recognise returning participants and offer
          personalised experiences.
        </p>
        <h3>How Alumni Records Are Created</h3>
        <p>Alumni records can be created in three ways:</p>
        <ul>
          <li>
            <strong>Manual entry</strong> &mdash; click <strong>+ Add Alumni</strong> and fill in
            first name, last name, email, and optionally company and notes.
          </li>
          <li>
            <strong>CSV import</strong> &mdash; bulk import historical attendees from a CSV file
            (see format below).
          </li>
          <li>
            <strong>Automatic</strong> &mdash; when a registration status changes to{' '}
            <strong>Paid</strong>, the attendee is automatically added to the alumni list for that
            conference.
          </li>
        </ul>
        <h3>Editing Alumni</h3>
        <p>
          Click the edit icon on any alumni row to update their details. If you change the{' '}
          <strong>email</strong> or <strong>name</strong>, the linked registration and portal
          account records are updated automatically to stay in sync.
        </p>
        <h3>Alumni Detection</h3>
        <p>
          When someone registers on the portal, the system checks if their email matches any alumni
          record across all of your conferences. If they are a returning attendee, a{' '}
          <strong>&ldquo;Welcome back!&rdquo;</strong> message is displayed, listing the conferences
          they previously attended.
        </p>
        <h3>CSV Import Format</h3>
        <p>
          The CSV file must include a <strong>header row</strong>. Only the <strong>email</strong>{' '}
          column is required. If first or last name columns are missing, the system uses the email
          prefix as the first name and &ldquo;-&rdquo; as the last name.
        </p>
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Required</th>
              <th>Accepted Headers</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Email</td>
              <td>Yes</td>
              <td>
                <code>email</code>, <code>e-mail</code>, <code>email_address</code>
              </td>
            </tr>
            <tr>
              <td>First Name</td>
              <td>No</td>
              <td>
                <code>first_name</code>, <code>firstname</code>, <code>first name</code>,{' '}
                <code>vorname</code>
              </td>
            </tr>
            <tr>
              <td>Last Name</td>
              <td>No</td>
              <td>
                <code>last_name</code>, <code>lastname</code>, <code>last name</code>,{' '}
                <code>nachname</code>, <code>surname</code>
              </td>
            </tr>
            <tr>
              <td>Company</td>
              <td>No</td>
              <td>
                <code>company</code>, <code>organization</code>, <code>organisation</code>,{' '}
                <code>firma</code>
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Example CSV</h3>
        <pre>
          {`email,first_name,last_name,company
john@example.com,John,Doe,Acme Corp
jane@example.com,Jane,Smith,
info@company.com,,,Tech Solutions`}
        </pre>
        <h3>Import Behaviour</h3>
        <ul>
          <li>
            <strong>Duplicates</strong> &mdash; if an email already exists for this conference, the
            row is skipped (counted as &ldquo;skipped&rdquo;).
          </li>
          <li>
            <strong>Encoding</strong> &mdash; UTF-8 is recommended. UTF-8 with BOM and Latin-1 are
            also supported.
          </li>
          <li>
            <strong>Column headers</strong> &mdash; are case-insensitive and whitespace-tolerant.
            Hyphens, underscores, and spaces are normalised automatically.
          </li>
          <li>
            <strong>Errors</strong> &mdash; rows with missing or invalid emails are reported in the
            import results dialog (up to 50 errors shown).
          </li>
        </ul>
        <h3>CSV Export</h3>
        <p>
          Click <strong>Export CSV</strong> to download all alumni for the current conference as a
          CSV file. The export includes email, first name, last name, company, source, and date
          added. The file is UTF-8 encoded with a BOM for Excel compatibility.
        </p>
        <h3>Source Badges</h3>
        <table>
          <thead>
            <tr>
              <th>Badge</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Manual</td>
              <td>Added individually via the &ldquo;+ Add Alumni&rdquo; button.</td>
            </tr>
            <tr>
              <td>Import</td>
              <td>Added via CSV bulk import.</td>
            </tr>
            <tr>
              <td>Registration</td>
              <td>Automatically created when a registration was marked as Paid.</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'deadlines',
    title: 'Deadlines',
    content: () => (
      <>
        <p>
          The <strong>Deadlines</strong> tab on each conference helps you track important dates and
          tasks &mdash; sponsor contracts, venue bookings, submission cutoffs, and anything else
          with a due date.
        </p>
        <h3>Creating a Deadline</h3>
        <p>
          Click <strong>+ New Deadline</strong> to open the creation form. Each deadline requires:
        </p>
        <ul>
          <li>
            <strong>Title</strong> &mdash; a short name for the deadline (e.g. &ldquo;Sponsor
            contract signed&rdquo;, &ldquo;Venue deposit due&rdquo;).
          </li>
          <li>
            <strong>Due Date &amp; Time</strong> &mdash; when the deadline is due. The time is
            interpreted in the conference&rsquo;s timezone.
          </li>
          <li>
            <strong>Description</strong> (optional) &mdash; additional details or context.
          </li>
        </ul>
        <h3>Deadline Cards</h3>
        <p>Deadlines are displayed as colour-coded cards sorted by urgency:</p>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Colour</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Overdue</td>
              <td>Red</td>
              <td>Past the due date and not yet resolved.</td>
            </tr>
            <tr>
              <td>Due Soon</td>
              <td>Amber</td>
              <td>Due within the next 7 days.</td>
            </tr>
            <tr>
              <td>Active</td>
              <td>Blue</td>
              <td>Due date is more than 7 days away.</td>
            </tr>
            <tr>
              <td>Resolved</td>
              <td>Grey</td>
              <td>Marked as complete. Shown with strikethrough text.</td>
            </tr>
          </tbody>
        </table>
        <h3>Resolving &amp; Reactivating</h3>
        <p>
          Click the <strong>checkmark</strong> button on a deadline card to mark it as resolved.
          Resolved deadlines move to the bottom of the list with reduced opacity. To reactivate a
          resolved deadline, click <strong>Reactivate</strong>.
        </p>
        <h3>Editing &amp; Deleting</h3>
        <p>
          Click the <strong>edit</strong> icon to update a deadline&rsquo;s title, description, or
          due date. Click the <strong>delete</strong> icon to remove a deadline permanently (after
          confirmation).
        </p>
        <h3>Email Reminders</h3>
        <p>
          The platform automatically sends email reminders to the conference contact address at
          three intervals:
        </p>
        <ul>
          <li>
            <strong>7 days before</strong> &mdash; advance notice.
          </li>
          <li>
            <strong>1 day before</strong> &mdash; final reminder.
          </li>
          <li>
            <strong>On the due date</strong> &mdash; deadline is today.
          </li>
        </ul>
        <p>
          Each reminder is sent only once. If the due date is changed, reminders are reset for time
          windows that haven&rsquo;t passed yet.
        </p>
        <h3>Toast Warnings</h3>
        <p>
          When you open a conference, the system checks for approaching deadlines (due within 7
          days). If any are found, a toast notification appears in the top-right corner alerting you
          to the upcoming deadlines.
        </p>
      </>
    ),
  },
  {
    id: 'locations',
    title: 'Locations',
    content: () => (
      <>
        <p>
          Locations represent the physical or virtual spaces where conference activities take place.
          They are managed at the company level and shared across conferences.
        </p>
        <h3>Location Hierarchy</h3>
        <p>
          Locations support a <strong>parent&ndash;child hierarchy</strong>. For example, a building
          can contain floors, and floors can contain rooms. This helps organise large venues.
        </p>
        <h3>Location Types</h3>
        <p>
          Each location has a type defined in{' '}
          <strong>Settings &rarr; Conference Setup &rarr; Location Types</strong>. Common types
          include:
        </p>
        <ul>
          <li>
            <strong>Room</strong> &mdash; a physical meeting room or classroom.
          </li>
          <li>
            <strong>Auditorium</strong> &mdash; a large presentation hall.
          </li>
          <li>
            <strong>Virtual</strong> &mdash; an online space with a URL for video conferencing.
          </li>
        </ul>
        <h3>Details</h3>
        <ul>
          <li>
            <strong>Capacity</strong> &mdash; maximum number of attendees.
          </li>
          <li>
            <strong>Floor / Building</strong> &mdash; for wayfinding within a venue.
          </li>
          <li>
            <strong>Virtual URL</strong> &mdash; link for virtual or hybrid locations.
          </li>
          <li>
            <strong>Contact Persons</strong> &mdash; venue contacts for logistics.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'sessions',
    title: 'Sessions',
    content: () => (
      <>
        <p>
          The <strong>Sessions</strong> tab on a conference provides a list view of all sessions
          with search, filter, and export capabilities.
        </p>
        <h3>Session List</h3>
        <p>
          All sessions for the conference are displayed in a table with columns for title, day,
          time, track, session type, assigned papers, and status. Use the search bar to filter by
          title or speaker name.
        </p>
        <h3>Column Visibility</h3>
        <p>
          Customise which columns are visible using the column visibility toggle. Your preference is
          persisted in your browser.
        </p>
        <h3>CSV Export</h3>
        <p>
          Export the session list to a CSV file for use in spreadsheets or external tools. The
          export includes all visible columns and respects any active search or filter.
        </p>
        <h3>Session Types</h3>
        <p>
          Session types are configurable in{' '}
          <strong>Settings &rarr; Conference Setup &rarr; Session Types</strong>. They categorise
          sessions (e.g. Keynote, Workshop, Tutorial, Panel) and affect how they appear in the
          program grid and registration flow.
        </p>
      </>
    ),
  },
  {
    id: 'invoices',
    title: 'Invoices',
    content: () => (
      <>
        <p>
          The Invoices tab on each conference manages billing documents for registrations and
          sponsors.
        </p>
        <h3>Invoice Lifecycle</h3>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>Draft</code>
              </td>
              <td>Invoice created but not yet sent. Can be freely edited.</td>
            </tr>
            <tr>
              <td>
                <code>Sent</code>
              </td>
              <td>
                Invoice delivered to the recipient via email. Editing is restricted; can be resent.
              </td>
            </tr>
            <tr>
              <td>
                <code>Paid</code>
              </td>
              <td>Payment received and confirmed.</td>
            </tr>
            <tr>
              <td>
                <code>Overdue</code>
              </td>
              <td>Past due date without payment. Can be resent or cancelled.</td>
            </tr>
            <tr>
              <td>
                <code>Cancelled</code>
              </td>
              <td>
                Invoice voided via cancellation. A linked credit note is automatically created.
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Template Types</h3>
        <p>
          Each invoice is assigned a <strong>template type</strong> that determines which PDF
          template is used when generating the document:
        </p>
        <ul>
          <li>
            <strong>Invoice (Bank Transfer)</strong> &mdash; standard invoice for bank wire
            payments. This is the default for new invoices.
          </li>
          <li>
            <strong>Invoice (Credit Card)</strong> &mdash; invoice for credit card payments (e.g.
            via Stripe).
          </li>
          <li>
            <strong>Credit Note</strong> &mdash; cancellation or refund document.
          </li>
        </ul>
        <p>
          The template type is selected when creating or editing an invoice. Each type has its own
          body HTML template (configured in Settings &rarr; Finance &rarr; Invoice Templates) while
          sharing the same footer, page format, and company information.
        </p>
        <h3>Sending &amp; Resending</h3>
        <p>
          When an invoice is sent, the system generates a PDF from the configured template and
          emails it to the recipient. A <strong>recipient email</strong> is required before sending.
        </p>
        <ul>
          <li>
            <strong>Draft &rarr; Send</strong> &mdash; assigns an invoice number, sets the status to
            &ldquo;Sent&rdquo;, sets the issue date to today, and emails the PDF. After sending, the
            invoice can no longer be edited &mdash; only the status can be changed.
          </li>
          <li>
            <strong>Resend</strong> &mdash; for invoices that are already sent or overdue, the PDF
            can be re-emailed to the recipient. Use the <em>Resend</em> button in the detail panel
            or the envelope icon in the invoice list.
          </li>
        </ul>
        <h3>Stripe Payment Links (Credit Card Invoices)</h3>
        <p>
          Invoices with template type <strong>Invoice (Credit Card)</strong> can generate Stripe
          payment links for online payments.
        </p>
        <ul>
          <li>
            When sending a credit card invoice, a Stripe payment link is automatically created and
            included in the email as a &ldquo;Pay Online&rdquo; button.
          </li>
          <li>
            The payment link takes the recipient to a Stripe-hosted payment page where they can pay
            with credit card, Google Pay, or Apple Pay.
          </li>
          <li>
            When payment succeeds, Stripe sends a webhook notification to SaaSConf, which
            automatically updates the invoice status from <code>sent</code> to <code>paid</code>.
          </li>
          <li>
            You can also convert a <strong>Bank Transfer</strong> invoice to{' '}
            <strong>Credit Card</strong> using the &ldquo;Convert to Credit Card&rdquo; button. This
            creates a payment link and resends the email with the payment button.
          </li>
          <li>
            Payment links remain active until the invoice is paid or cancelled. If you cancel an
            invoice, the payment link is automatically deactivated.
          </li>
        </ul>
        <h3>Cancellation &amp; Credit Notes</h3>
        <p>
          Only <strong>draft</strong> invoices can be deleted. Sent and overdue invoices must be{' '}
          <strong>cancelled</strong> instead, which automatically creates a linked{' '}
          <strong>credit note</strong>.
        </p>
        <ul>
          <li>
            Click <strong>Cancel Invoice</strong> on a sent, overdue, or paid invoice. You must
            provide a cancellation reason (stored as internal comment on the cancelled invoice).
          </li>
          <li>
            The system creates a credit note with negated line-item amounts, assigns a cancellation
            number, and emails the credit note PDF to the recipient.
          </li>
          <li>
            If cancelling a <strong>paid</strong> credit card invoice, the system automatically
            issues a full Stripe refund before creating the credit note. The refund typically takes
            5-10 business days to appear in the customer&rsquo;s account.
          </li>
          <li>
            Credit notes appear as <strong>indented sub-rows</strong> directly under their parent
            cancelled invoice in the list, making the relationship visually clear.
          </li>
          <li>
            In the detail panel, clickable links allow navigating between a cancelled invoice and
            its credit note (and vice versa).
          </li>
          <li>
            Credit notes <strong>cannot be deleted</strong>. They can be resent like any other sent
            invoice.
          </li>
        </ul>
        <h3>Manual Refunds</h3>
        <p>
          For <strong>cancelled</strong> credit card invoices that were paid via Stripe, you can
          issue a refund using the <strong>Refund</strong> button in the detail panel.
        </p>
        <ul>
          <li>
            The refund button only appears for cancelled invoices with template type{' '}
            <strong>Credit Card</strong> that have a Stripe payment intent ID and have not already
            been refunded.
          </li>
          <li>
            Clicking <strong>Refund</strong> issues a full refund via Stripe and records the refund
            event in the invoice audit log.
          </li>
          <li>
            All payment and refund events are logged in the invoice&rsquo;s event history, which you
            can view in the <strong>Documents</strong> tab of the invoice detail panel.
          </li>
        </ul>
        <h3>Invoice Details</h3>
        <ul>
          <li>
            <strong>Line Items</strong> &mdash; individual charges (registration fee, workshop
            add-on, etc.) with quantity, unit price, and tax rate.
          </li>
          <li>
            <strong>Tax Calculation</strong> &mdash; VAT is automatically calculated when creating
            an invoice based on the VAT decision table rules. The system considers the
            recipient&rsquo;s country, whether they provided a VAT number (B2B vs B2C), and the
            attendance type (from the linked registration). The appropriate tax rate is pulled from
            your Country VAT/Tax Rates list, and reverse charge or OSS text is automatically added
            to the invoice notes when applicable.
          </li>
          <li>
            <strong>Recipient</strong> &mdash; billing name, address, VAT number, and email. The
            address fields (Address Line 1, City, Postal Code, Country) are{' '}
            <strong>required</strong> when creating an invoice. Optionally, you can specify a{' '}
            <strong>Procurement Code</strong> (PO number) which appears on the PDF and is included
            in ZUGFeRD XML when enabled.
          </li>
          <li>
            <strong>Issue &amp; Due Dates</strong> &mdash; when the invoice was issued and when
            payment is expected.
          </li>
          <li>
            <strong>Notes</strong> &mdash; free-text field for payment instructions or additional
            information.
          </li>
          <li>
            <strong>Currency</strong> &mdash; inherited from the conference settings. If a second
            currency and exchange rate are configured (in Settings &rarr; Finance &rarr; Currency
            &amp; Tax), invoice totals are shown in both currencies on the generated PDF.
          </li>
        </ul>
        <h3>Sponsor Invoices</h3>
        <p>
          The <strong>Invoices</strong> tab on each sponsor shows all invoices linked to that
          sponsor. From there you can preview the PDF inline, download it, or resend it &mdash;
          without navigating to the main Invoices section.
        </p>
        <h3>Export</h3>
        <p>
          Invoices can be exported as CSV (up to 50,000 rows). The export includes a UTF-8 BOM for
          compatibility with Excel.
        </p>
        <h3>ZUGFeRD/Factur-X E-Invoicing</h3>
        <p>
          ZUGFeRD (also known as Factur-X) embeds machine-readable XML data within invoice PDFs,
          enabling automated processing by customer accounting systems while remaining
          human-readable. This is{' '}
          <strong>mandatory in Germany for B2B invoices from 2025-2028</strong> and required for EU
          public sector contracts.
        </p>
        <h4>How It Works</h4>
        <p>
          When ZUGFeRD is enabled, invoice PDFs include embedded XML that complies with the{' '}
          <strong>EN 16931 EU standard</strong>. Customer accounting software (DATEV, Lexware,
          sevDesk, SAP, etc.) can automatically extract invoice data for direct posting without
          manual entry.
        </p>
        <h4>Enabling ZUGFeRD</h4>
        <p>
          Navigate to <strong>Settings &rarr; Finance &rarr; ZUGFeRD</strong> and toggle{' '}
          <strong>Enable ZUGFeRD/Factur-X</strong>. All settings are automatically determined from
          your existing invoice and company data:
        </p>
        <ul>
          <li>
            <strong>Profile:</strong> EN16931 (EU standard for compliance)
          </li>
          <li>
            <strong>Seller VAT ID:</strong> From company tax_id or fiscal representative
          </li>
          <li>
            <strong>Contact Info:</strong> From conference email/phone
          </li>
          <li>
            <strong>Payment Terms:</strong> Net 30 days
          </li>
          <li>
            <strong>Payment Means:</strong> Credit transfer (bank) or payment card
          </li>
          <li>
            <strong>Tax Category:</strong> Based on VAT decision table (standard rate, reverse
            charge, exempt, etc.)
          </li>
          <li>
            <strong>Invoice Type:</strong> 380 (commercial invoice) or 381 (credit note)
          </li>
        </ul>
        <h4>Data Requirements</h4>
        <p>For ZUGFeRD to generate valid XML, invoices must include:</p>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Required Fields</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Seller (Company)</strong>
              </td>
              <td>
                Company name, VAT ID (tax_id or fiscal rep), country (ISO code like DE), address,
                city, postal code
              </td>
            </tr>
            <tr>
              <td>
                <strong>Buyer (Customer)</strong>
              </td>
              <td>
                Recipient name, country (ISO code required), address and city (recommended), VAT ID
                (for B2B), procurement code/PO number (optional)
              </td>
            </tr>
            <tr>
              <td>
                <strong>Invoice</strong>
              </td>
              <td>
                Invoice number, issue date, due date (not required for credit notes), currency, line
                items with descriptions/quantities/prices, tax rate and amount
              </td>
            </tr>
          </tbody>
        </table>
        <h4>Validation</h4>
        <p>
          The system validates each invoice against EN 16931 requirements before embedding XML. If
          validation fails (e.g., missing buyer country), a standard PDF without ZUGFeRD is
          generated instead, with a warning logged.
        </p>
        <h4>Credit Notes</h4>
        <p>
          Credit notes automatically use invoice type code 381 and support negative amounts. Due
          date is not required for credit notes since they represent refunds rather than payment
          requests.
        </p>
      </>
    ),
  },
  {
    id: 'invoice-settings',
    title: 'Invoice Settings',
    content: () => (
      <>
        <p>
          Invoice settings control how invoices are generated, formatted, and branded. Configure
          these settings in <strong>Settings &rarr; Finance</strong>. The Finance section is
          organised into six tabs: Currency &amp; Tax, Invoice Number, Company Data, Bank Accounts,
          Invoice Templates, and Stripe Setup. Note that <strong>Invoice Number</strong> and{' '}
          <strong>Stripe Setup</strong> are only visible to super-administrators.
        </p>
        <h3>Currency &amp; Tax</h3>
        <p>Configure the conference currencies, exchange rates, and tax settings:</p>
        <ul>
          <li>
            <strong>Primary Currency</strong> &mdash; the main currency used for pricing and
            financial reporting. This is the currency shown on invoices, registration forms, and
            financial reports.
          </li>
          <li>
            <strong>Second Currency (Invoice)</strong> &mdash; an optional secondary currency used
            for dual-currency invoices. When selected, an <strong>Exchange Rate</strong> field
            appears to define the conversion rate (e.g. 1&nbsp;EUR&nbsp;=&nbsp;1.08&nbsp;USD). When
            configured, invoice totals are shown in both currencies on the generated PDF using
            placeholders like <code>[SECOND_TOTAL]</code> and <code>[SECOND_SUBTOTAL]</code>.
          </li>
          <li>
            <strong>Conference Tax Rate</strong> &mdash; displays the current tax/VAT rate for the
            conference country. This rate is automatically pulled from your Country VAT/Tax Rates
            list (see below) based on the conference country. If the conference country is not in
            your rates list, a warning is displayed prompting you to add it.
          </li>
          <li>
            <strong>Country VAT/Tax Rates</strong> &mdash; manage your organization&rsquo;s
            country-specific tax rates (VAT, GST, Sales Tax, etc.). Each entry contains a 2-letter
            ISO country code, country name, and standard rate (0-100%). You can add, edit, or delete
            rates as needed. These rates are used for automatic VAT calculation on invoices based on
            the VAT decision table rules.
          </li>
          <li>
            <strong>EU Countries List</strong> &mdash; configure which countries are considered part
            of the European Union for VAT purposes. This list is used by the VAT decision table to
            classify customers as domestic, EU, or non-EU. The list is pre-populated with current EU
            member states and can be customized.
          </li>
          <li>
            <strong>Fiscal Representative</strong> &mdash; VAT representative details for
            cross-border tax compliance. See the Fiscal Representative section.
          </li>
          <li>
            <strong>VAT Decision Table</strong> &mdash; a configurable matrix of 24 rules that
            determines VAT treatment for every combination of attendance type, customer type, and
            customer location. See below for details.
          </li>
        </ul>
        <h4>VAT Decision Table</h4>
        <p>
          EU VAT rules for conferences depend on three dimensions: <strong>how</strong> the attendee
          participates, <strong>who</strong> the customer is, and <strong>where</strong> the
          customer is located relative to the conference country. The decision table is
          pre-populated with standard EU rules and can be edited if rules change.
        </p>
        <p>
          <strong>Attendance types:</strong> In-Person, Virtual, Hybrid (Onsite), Hybrid (Online).
        </p>
        <p>
          <strong>Customer types:</strong> B2B (business) and B2C (individual consumer).
        </p>
        <p>
          <strong>Customer locations:</strong> Domestic (same country as conference), EU (other EU
          member state), Non-EU (outside the European Union).
        </p>
        <p>Each rule in the table defines:</p>
        <ul>
          <li>
            <strong>Charge VAT</strong> &mdash; whether the organiser includes VAT on the invoice.
          </li>
          <li>
            <strong>VAT Rate Source</strong> &mdash; where to look up the applicable rate:{' '}
            <em>Conference</em> (event country rate), <em>Customer</em> (customer&rsquo;s country
            rate), or <em>None</em>.
          </li>
          <li>
            <strong>Reverse Charge</strong> &mdash; whether the customer self-accounts for VAT
            (common for B2B cross-border services within the EU).
          </li>
          <li>
            <strong>OSS Applicable</strong> &mdash; whether the EU One-Stop Shop mechanism can be
            used for reporting (common for B2C digital services to other EU countries).
          </li>
          <li>
            <strong>Note</strong> &mdash; a human-readable explanation referencing the relevant EU
            VAT directive article.
          </li>
        </ul>
        <h4>Default EU Rules (Summary)</h4>
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>VAT Treatment</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>In-person (all customers)</td>
              <td>Always charge VAT at conference country rate (Art.&nbsp;53/54)</td>
            </tr>
            <tr>
              <td>Virtual B2B &mdash; domestic</td>
              <td>Charge local VAT</td>
            </tr>
            <tr>
              <td>Virtual B2B &mdash; EU</td>
              <td>No VAT charged; reverse charge applies (Art.&nbsp;44)</td>
            </tr>
            <tr>
              <td>Virtual B2B &mdash; non-EU</td>
              <td>Outside EU scope; no VAT</td>
            </tr>
            <tr>
              <td>Virtual B2C &mdash; domestic</td>
              <td>Charge local VAT</td>
            </tr>
            <tr>
              <td>Virtual B2C &mdash; EU</td>
              <td>Charge customer&rsquo;s country VAT rate via OSS (Art.&nbsp;54(1))</td>
            </tr>
            <tr>
              <td>Virtual B2C &mdash; non-EU</td>
              <td>Outside EU scope; no VAT</td>
            </tr>
            <tr>
              <td>Hybrid onsite</td>
              <td>Same rules as in-person</td>
            </tr>
            <tr>
              <td>Hybrid online</td>
              <td>Same rules as virtual</td>
            </tr>
          </tbody>
        </table>
        <h4>Number Format</h4>
        <p>
          Choose how monetary amounts are displayed on invoices. Select a preset from the dropdown
          to automatically configure decimal separators, thousands separators, and currency symbol
          position. Available presets:
        </p>
        <table>
          <thead>
            <tr>
              <th>Preset</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>US / UK</td>
              <td>1,234,567.89</td>
            </tr>
            <tr>
              <td>European</td>
              <td>1.234.567,89</td>
            </tr>
            <tr>
              <td>Swiss</td>
              <td>1&rsquo;234&rsquo;567.89</td>
            </tr>
            <tr>
              <td>French</td>
              <td>1&nbsp;234&nbsp;567,89</td>
            </tr>
            <tr>
              <td>Indian</td>
              <td>12,34,567.89</td>
            </tr>
            <tr>
              <td>No separator</td>
              <td>1234567.89</td>
            </tr>
          </tbody>
        </table>
        <p>
          The selected format applies to all monetary values in generated invoice PDFs (subtotals,
          tax amounts, line item prices, and totals). Tax rate percentages are not affected.
        </p>
        <h4>EU Member States</h4>
        <p>
          The VAT decision table classifies customers as <em>domestic</em>, <em>EU</em>, or{' '}
          <em>non-EU</em> based on their country. The EU Members list determines which countries
          count as &ldquo;EU&rdquo;. It is pre-populated with the current 27 EU member states but
          can be adjusted if countries join or leave the union.
        </p>
        <p>
          Use the checkbox grid to add or remove countries. A count badge shows how many are
          selected. Click <strong>Reset to default</strong> to restore the standard 27 members.
        </p>
        <h3>Invoice Number</h3>
        <p>
          Configure the invoice numbering pattern and reset behaviour.{' '}
          <em>This tab is only visible to super-administrators.</em>
        </p>
        <ul>
          <li>
            <strong>Number Template</strong> &mdash; define the format using placeholders like{' '}
            <code>[YYYY]</code> (year), <code>[Count]</code> (sequential number), and literal text
            (e.g. <code>INV-[YYYY]-[Count]</code> generates <code>INV-2026-001</code>).
          </li>
          <li>
            <strong>Counter Reset</strong> &mdash; choose when the counter resets:{' '}
            <strong>Never</strong> (continuous), <strong>Yearly</strong> (resets January 1st), or{' '}
            <strong>Per Conference</strong> (each conference has its own counter).
          </li>
          <li>
            <strong>Current Value</strong> &mdash; the next invoice number that will be assigned.
          </li>
        </ul>
        <h3>Company Data</h3>
        <p>Enter your company&rsquo;s billing information that appears on invoice headers:</p>
        <ul>
          <li>
            <strong>Company Name</strong> &mdash; your organisation&rsquo;s legal name.
          </li>
          <li>
            <strong>Address</strong> &mdash; full postal address (single field, formatted with line
            breaks on the PDF).
          </li>
          <li>
            <strong>City, Postal Code, Country</strong> &mdash; for structured address data.
          </li>
          <li>
            <strong>Tax ID / VAT Number</strong> &mdash; your company&rsquo;s tax identifier.
          </li>
          <li>
            <strong>Footer Text</strong> &mdash; optional legal disclaimer or payment instructions
            displayed at the bottom of invoices.
          </li>
        </ul>
        <p>
          Click <strong>Auto-populate from My Company</strong> to fill these fields with data from
          your company profile (see My Company section). This is a one-time copy &mdash; changes to
          My Company do not automatically update invoice settings.
        </p>
        <h3>Bank Accounts</h3>
        <p>Manage bank accounts that appear on invoices for payment:</p>
        <ul>
          <li>
            <strong>Bank Name</strong> &mdash; the financial institution name.
          </li>
          <li>
            <strong>IBAN</strong> &mdash; International Bank Account Number. Validated client-side
            and server-side using checksum verification.
          </li>
          <li>
            <strong>BIC / SWIFT</strong> &mdash; Bank Identifier Code (optional but recommended for
            international payments).
          </li>
          <li>
            <strong>Default Account</strong> &mdash; mark one account as the default. This account
            appears on generated invoices and PDF previews. If no account is marked default, the
            first account in the list is used.
          </li>
        </ul>
        <p>
          Add multiple bank accounts and toggle which one is the default using the{' '}
          <strong>Set Default</strong> button. Invalid IBANs are highlighted with a red border and
          error message.
        </p>
        <h3>Invoice Templates</h3>
        <p>
          Design the PDF layout for each template type using a rich-text editor. Three template tabs
          are available:
        </p>
        <ul>
          <li>
            <strong>Invoice (Bank Transfer)</strong> &mdash; template for bank wire payment
            invoices.
          </li>
          <li>
            <strong>Invoice (Credit Card)</strong> &mdash; template for credit card payment
            invoices.
          </li>
          <li>
            <strong>Credit Note</strong> &mdash; template for cancellation/refund documents.
          </li>
        </ul>
        <p>
          Each template has its own body HTML while sharing the footer, page format, and company
          data. Use the <strong>Copy from&hellip;</strong> button to duplicate one template&rsquo;s
          content into another. When a template is first set up, empty templates are automatically
          pre-populated with the Bank Transfer template content as a starting point.
        </p>
        <p>The templates support comprehensive placeholder variables for dynamic content:</p>
        <h4>Company Information</h4>
        <ul>
          <li>
            <code>[COMPANY_NAME]</code> &mdash; company name
          </li>
          <li>
            <code>[COMPANY_ADDRESS]</code> &mdash; formatted address (with line breaks)
          </li>
          <li>
            <code>[COMPANY_CITY]</code>, <code>[COMPANY_POSTAL_CODE]</code>,{' '}
            <code>[COMPANY_COUNTRY]</code>
          </li>
          <li>
            <code>[COMPANY_VAT]</code> &mdash; always shows the company&rsquo;s VAT number
          </li>
          <li>
            <code>[COMPANY_TAX_ID]</code> &mdash; respects the VAT source selector (see below)
          </li>
        </ul>
        <h4>Fiscal Representative Information</h4>
        <p>
          If your conference has a fiscal representative configured (see Fiscal Representative
          section), use these placeholders:
        </p>
        <ul>
          <li>
            <code>[FISCAL_REP_NAME]</code> &mdash; fiscal rep company name
          </li>
          <li>
            <code>[FISCAL_REP_ADDRESS]</code> &mdash; formatted address
          </li>
          <li>
            <code>[FISCAL_REP_CITY]</code>, <code>[FISCAL_REP_POSTAL_CODE]</code>,{' '}
            <code>[FISCAL_REP_COUNTRY]</code>
          </li>
          <li>
            <code>[FISCAL_REP_VAT]</code> &mdash; fiscal rep&rsquo;s VAT number
          </li>
          <li>
            <code>[FISCAL_REP_TAX_ID]</code> &mdash; fiscal rep&rsquo;s national tax ID
          </li>
        </ul>
        <h4>Banking Information</h4>
        <ul>
          <li>
            <code>[BANK_NAME]</code> &mdash; default bank account name
          </li>
          <li>
            <code>[IBAN]</code> &mdash; default bank account IBAN
          </li>
          <li>
            <code>[BIC]</code> &mdash; default bank account BIC
          </li>
        </ul>
        <h4>Invoice Details</h4>
        <ul>
          <li>
            <code>[INVOICE_NUMBER]</code>, <code>[ISSUE_DATE]</code>, <code>[DUE_DATE]</code>
          </li>
          <li>
            <code>[CURRENCY_1]</code> &mdash; primary currency (from conference settings)
          </li>
          <li>
            <code>[CURRENCY_2]</code> &mdash; secondary currency (reserved for multi-currency
            scenarios)
          </li>
        </ul>
        <h4>Items &amp; Totals</h4>
        <ul>
          <li>
            <code>[ITEMS_TABLE]</code> &mdash; auto-formatted table with columns: Position,
            Description, Quantity, Unit Cost, Discount, and Line Total
          </li>
          <li>
            <code>[SUBTOTAL]</code>, <code>[TAX_RATE]</code>, <code>[TAX_AMOUNT]</code>,{' '}
            <code>[TOTAL]</code>
          </li>
        </ul>
        <h4>Recipient/Buyer Information</h4>
        <ul>
          <li>
            <code>[RECIPIENT_NAME]</code> &mdash; buyer company or person name
          </li>
          <li>
            <code>[RECIPIENT_ADDRESS]</code> &mdash; formatted buyer address
          </li>
          <li>
            <code>[RECIPIENT_VAT]</code> &mdash; buyer VAT/tax ID number
          </li>
          <li>
            <code>[PROCUREMENT_CODE]</code> or <code>[PO_NUMBER]</code> &mdash; purchase order
            number (optional, included in ZUGFeRD XML when present)
          </li>
        </ul>
        <h4>VAT Source Selector</h4>
        <p>
          If a fiscal representative is configured, a dropdown appears at the top of the Invoice
          Template tab:
        </p>
        <ul>
          <li>
            <strong>Use Company VAT</strong> &mdash; the <code>[COMPANY_TAX_ID]</code> placeholder
            shows your company&rsquo;s VAT number.
          </li>
          <li>
            <strong>Use Fiscal Rep VAT</strong> &mdash; the <code>[COMPANY_TAX_ID]</code>{' '}
            placeholder shows the fiscal representative&rsquo;s VAT number instead.
          </li>
        </ul>
        <p>
          This allows templates to use <code>[COMPANY_TAX_ID]</code> for backward compatibility
          while giving you control over which VAT appears in that position.
        </p>
        <h4>PDF Preview</h4>
        <p>
          Click <strong>Preview PDF</strong> to generate a sample invoice using the currently active
          template tab. The preview opens in a modal with mock data (sample customer, line items,
          totals). Switch between template tabs to preview each type individually. Use this to test
          formatting and placeholder variables before saving.
        </p>
        <h3>ZUGFeRD/Factur-X E-Invoicing</h3>
        <p>
          ZUGFeRD (also known as Factur-X) is a hybrid electronic invoicing standard that embeds
          machine-readable XML data within PDF invoices. This enables automated invoice processing
          by customer accounting systems while maintaining a human-readable PDF format.
        </p>
        <h4>Why use ZUGFeRD?</h4>
        <ul>
          <li>
            <strong>EU Compliance</strong> &mdash; German B2B e-invoicing is mandatory from
            2025-2028; French regulations have a similar timeline.
          </li>
          <li>
            <strong>Automated Processing</strong> &mdash; customers can import invoices directly
            into their accounting software (DATEV, Lexware, sevDesk, SAP, etc.).
          </li>
          <li>
            <strong>Single File</strong> &mdash; PDF/A-3 format embeds XML, no need for separate
            files.
          </li>
          <li>
            <strong>EN 16931 Standard</strong> &mdash; full EU standard compliance, required for
            public sector contracts.
          </li>
        </ul>
        <h4>Configuration</h4>
        <p>
          Enable ZUGFeRD in <strong>Settings &rarr; Finance &rarr; ZUGFeRD Settings</strong>.
          Required fields:
        </p>
        <ul>
          <li>
            <strong>Enabled</strong> &mdash; toggle to activate ZUGFeRD for this conference.
          </li>
          <li>
            <strong>Profile</strong> &mdash; compliance level. Recommended: <strong>EN16931</strong>{' '}
            (full EU standard compliance, supported by all major accounting software).
          </li>
          <li>
            <strong>Seller VAT ID</strong> &mdash; required for e-invoicing (e.g.{' '}
            <code>DE123456789</code> for German companies, <code>FR12345678901</code> for French).
          </li>
        </ul>
        <p>Optional configuration:</p>
        <ul>
          <li>
            <strong>Seller Contact Email/Phone</strong> &mdash; invoice issuer contact details
            included in the XML.
          </li>
          <li>
            <strong>Payment Terms Code</strong> &mdash; net payment days (default: 30 = Net 30
            days).
          </li>
          <li>
            <strong>Payment Means Code</strong> &mdash; payment method (default: 30 = credit
            transfer). Common codes: 30 (bank transfer), 48 (credit card), 49 (direct debit).
          </li>
          <li>
            <strong>Tax Category Code</strong> &mdash; VAT category (default: S = standard rate).
            Other codes: Z (zero rated), E (exempt), AE (reverse charge).
          </li>
          <li>
            <strong>Invoice Type Code</strong> &mdash; document type (default: 380 = commercial
            invoice). Other codes: 381 (credit note), 384 (corrected invoice).
          </li>
        </ul>
        <h4>Profile Selection</h4>
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>MINIMUM</td>
              <td>Bare minimum fields. Limited adoption. Use only if explicitly required.</td>
            </tr>
            <tr>
              <td>EN16931 (recommended)</td>
              <td>
                Full EU standard compliance. Required for public sector contracts. Supported by all
                major accounting software.
              </td>
            </tr>
            <tr>
              <td>EXTENDED</td>
              <td>Maximum detail level. Overly complex for most use cases. Rarely needed.</td>
            </tr>
          </tbody>
        </table>
        <h4>Data Requirements</h4>
        <p>
          For ZUGFeRD to generate successfully, invoices must have complete data. Missing required
          fields will cause the system to fall back to standard PDFs (without embedded XML). A
          validation status indicator appears on the invoice detail panel when ZUGFeRD is enabled.
        </p>
        <p>
          <strong>Seller requirements</strong> (from Settings &rarr; Finance &rarr; Company Data):
        </p>
        <ul>
          <li>Company name</li>
          <li>VAT ID or Tax ID</li>
          <li>Full address (street, city, postal code)</li>
          <li>Country (must be 2-letter ISO code: DE, FR, US, etc.)</li>
        </ul>
        <p>
          <strong>Buyer requirements</strong> (from invoice recipient fields):
        </p>
        <ul>
          <li>Recipient name</li>
          <li>Recipient country (must be 2-letter ISO code, e.g. DE not &ldquo;Germany&rdquo;)</li>
          <li>Recipient address (recommended)</li>
          <li>Recipient city (recommended)</li>
          <li>Recipient VAT number (recommended for B2B invoices)</li>
          <li>
            Procurement code / PO number (optional, included as BuyerOrderReferencedDocument when
            present)
          </li>
        </ul>
        <p>
          <strong>Financial requirements:</strong>
        </p>
        <ul>
          <li>Invoice number</li>
          <li>Issue date and due date</li>
          <li>Currency code (EUR, USD, GBP, etc.)</li>
          <li>Subtotal, tax rate, tax amount, and total</li>
          <li>Minimum 1 line item with description, quantity, unit price, and total</li>
        </ul>
        <h4>Validation Status</h4>
        <p>
          When ZUGFeRD is enabled, the invoice detail panel shows a validation status indicator:
        </p>
        <ul>
          <li>
            <strong>Green badge</strong>: &ldquo;ZUGFeRD Compliant (EN16931)&rdquo; &mdash; all
            requirements met, PDF will include embedded XML.
          </li>
          <li>
            <strong>Yellow badge</strong>: &ldquo;Missing ZUGFeRD Requirements&rdquo; &mdash; lists
            specific missing fields. The invoice will generate as a standard PDF (without XML) until
            fields are filled.
          </li>
        </ul>
        <h4>How It Works</h4>
        <p>When you download or email a ZUGFeRD invoice:</p>
        <ol>
          <li>The system validates invoice data against ZUGFeRD requirements.</li>
          <li>
            If valid, it generates XML (UN/CEFACT CII format) from invoice data using the factur-x
            library.
          </li>
          <li>
            The XML is embedded inside the PDF as an attachment (PDF/A-3b format) using the filename{' '}
            <code>factur-x.xml</code>.
          </li>
          <li>
            The resulting PDF is both human-readable and machine-processable. Customers can open it
            in any PDF reader to view the invoice, or import it into accounting software to
            automatically extract the structured data.
          </li>
        </ol>
        <p>
          <strong>Graceful fallback:</strong> If validation fails or XML generation encounters
          errors, the system automatically generates a standard PDF (without embedded XML) and logs
          a warning. Invoice delivery is never blocked.
        </p>
        <h4>Email Filenames</h4>
        <p>
          When ZUGFeRD is enabled, email attachments use the prefix <code>zugferd_</code> to
          indicate that the PDF contains structured data (e.g. <code>zugferd_2026-00001.pdf</code>).
          This helps recipients identify e-invoices at a glance.
        </p>
        <h4>Testing & Validation</h4>
        <p>To verify that generated PDFs are valid ZUGFeRD documents:</p>
        <ul>
          <li>
            <strong>German official validator:</strong> Upload the PDF to{' '}
            <a
              href="https://www.zugferd-rechnung.de/validator/"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://www.zugferd-rechnung.de/validator/
            </a>
            . A green checkmark confirms &ldquo;Valid ZUGFeRD PDF/A-3&rdquo;.
          </li>
          <li>
            <strong>Accounting software:</strong> Import the PDF into DATEV, Lexware, sevDesk, or
            other accounting tools to test automated data extraction.
          </li>
          <li>
            <strong>factur-x CLI:</strong> Install the factur-x Python library and run{' '}
            <code>facturx-pdfextractxml invoice.pdf</code> to extract and inspect the embedded XML.
          </li>
        </ul>
        <h4>Common Issues</h4>
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Solution</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Validation error: &ldquo;Buyer country must be ISO 3166-1 alpha-2 code&rdquo;</td>
              <td>
                Update invoice recipient country to 2-letter code (e.g. DE instead of
                &ldquo;Germany&rdquo;). The frontend country dropdown stores ISO codes
                automatically.
              </td>
            </tr>
            <tr>
              <td>Validation error: &ldquo;Missing seller VAT ID&rdquo;</td>
              <td>
                Go to Settings &rarr; Finance &rarr; Company Data and fill in the Tax ID / VAT
                Number field, or set the Seller VAT ID in ZUGFeRD Settings.
              </td>
            </tr>
            <tr>
              <td>Standard PDF generated instead of ZUGFeRD</td>
              <td>
                Check the validation status indicator on the invoice detail panel for specific
                missing fields. Fill in all required data and regenerate the PDF.
              </td>
            </tr>
            <tr>
              <td>External validator reports &ldquo;Not a valid ZUGFeRD PDF&rdquo;</td>
              <td>
                Check backend logs for embedding errors. Ensure ZUGFeRD is enabled in settings and
                all required fields are filled. Test with a minimal invoice first.
              </td>
            </tr>
          </tbody>
        </table>
        <h4>Performance</h4>
        <p>
          ZUGFeRD adds approximately 100-200ms to PDF generation time per invoice (XML generation +
          embedding). The embedded XML is typically 10-50KB in size. All processing runs
          asynchronously to avoid blocking the API.
        </p>
        <h3>Stripe Setup</h3>
        <p>
          Configure Stripe payment integration for online credit card payments on invoices. Stripe
          API keys and webhook secrets are stored per conference and secured with role-based access
          control. <em>This tab is only visible to super-administrators.</em>
        </p>
        <h4>Access Control</h4>
        <p>
          Only <strong>tenant super users</strong> (the user who created your organisation) can view
          and edit Stripe settings. Regular admins see a masked version of the secret key (first 3 +
          last 3 characters) and cannot make changes. This protects sensitive API credentials.
        </p>
        <h4>Settings</h4>
        <ul>
          <li>
            <strong>Publishable Key</strong> &mdash; your Stripe public API key (starts with{' '}
            <code>pk_</code>). Safe to expose in the browser.
          </li>
          <li>
            <strong>Secret Key</strong> &mdash; your Stripe secret API key (starts with{' '}
            <code>sk_</code>). Never shared with the browser. Stored encrypted in the database.
          </li>
          <li>
            <strong>Webhook Secret</strong> &mdash; your Stripe webhook signing secret (starts with{' '}
            <code>whsec_</code>). Used to verify that webhook events sent to SaaSConf actually come
            from Stripe. This is <strong>required</strong> for automatic invoice status updates when
            payments succeed.
          </li>
          <li>
            <strong>Enable Stripe Payments</strong> &mdash; toggle to activate Stripe payment links
            on credit card invoices.
          </li>
        </ul>
        <p>
          The secret key and webhook secret fields have show/hide toggles (password inputs). For
          tenant super users, the full keys are shown. For regular admins, they are masked (e.g.{' '}
          <code>sk_****...****abc</code>).
        </p>
        <h4>Webhook Configuration</h4>
        <p>
          To receive automatic payment notifications from Stripe, you must configure a webhook
          endpoint in your Stripe Dashboard:
        </p>
        <ol>
          <li>
            Go to <strong>Stripe Dashboard &rarr; Developers &rarr; Webhooks</strong>.
          </li>
          <li>
            Click <strong>Add endpoint</strong> and enter your webhook URL:{' '}
            <code>https://yourdomain.com/api/v1/stripe-webhook</code>
          </li>
          <li>
            Select the following events to listen for:
            <ul>
              <li>
                <code>payment_intent.succeeded</code> &mdash; marks invoice as paid
              </li>
              <li>
                <code>charge.succeeded</code> &mdash; logs payment confirmation
              </li>
              <li>
                <code>payment_intent.payment_failed</code> &mdash; logs failed payment attempt
              </li>
            </ul>
          </li>
          <li>
            After creating the endpoint, copy the <strong>Signing secret</strong> (starts with{' '}
            <code>whsec_</code>) and paste it into the <strong>Webhook Secret</strong> field in
            SaaSConf.
          </li>
        </ol>
        <p>
          Once configured, Stripe will automatically notify SaaSConf when payments succeed or fail,
          updating invoice statuses in real-time. All webhook events are logged in the invoice event
          history.
        </p>
        <h4>Testing vs Production</h4>
        <ul>
          <li>
            <strong>Test keys</strong> (start with <code>pk_test_</code>, <code>sk_test_</code>, or{' '}
            <code>whsec_test_</code>) are for development and staging. Use these while setting up.
          </li>
          <li>
            <strong>Live keys</strong> (start with <code>pk_live_</code>, <code>sk_live_</code>, or{' '}
            <code>whsec_live_</code>) are for production. Only enter live keys when ready to accept
            real payments.
          </li>
          <li>
            <strong>Important:</strong> Create separate webhook endpoints for test and live modes in
            your Stripe Dashboard. Test mode webhooks receive events from test payments, while live
            mode webhooks receive events from real payments.
          </li>
        </ul>
        <h4>Payment Flow</h4>
        <p>Here&rsquo;s how Stripe payments work end-to-end:</p>
        <ol>
          <li>
            Create an invoice with template type <strong>Invoice (Credit Card)</strong>.
          </li>
          <li>
            Click <strong>Send</strong>. SaaSConf generates a Stripe payment link and emails the
            invoice PDF with a &ldquo;Pay Online&rdquo; button.
          </li>
          <li>The recipient clicks the button and is taken to a Stripe-hosted payment page.</li>
          <li>
            After successful payment, Stripe sends a <code>payment_intent.succeeded</code> webhook
            to SaaSConf.
          </li>
          <li>
            SaaSConf verifies the webhook signature, updates the invoice status to <code>paid</code>
            , and logs the payment event.
          </li>
          <li>
            The invoice detail panel shows the payment event in the <strong>Documents</strong> tab
            with the Stripe payment intent ID, charge ID, amount, and timestamp.
          </li>
        </ol>
        <p>
          For setup instructions and key generation, visit the <strong>Stripe Dashboard</strong>{' '}
          (developers section).
        </p>
      </>
    ),
  },
  {
    id: 'service-providers',
    title: 'Service Providers',
    content: () => (
      <>
        <p>
          The <strong>Service Providers</strong> tab on each conference tracks external companies
          that provide services to the event (e.g. catering, AV equipment, photography, printing).
        </p>
        <h3>Managing Providers</h3>
        <ul>
          <li>
            <strong>Company Name</strong> &mdash; the service provider&rsquo;s business name.
          </li>
          <li>
            <strong>Contact Info</strong> &mdash; email, phone, and address.
          </li>
          <li>
            <strong>Service Types</strong> &mdash; categorise what the provider offers.
          </li>
          <li>
            <strong>Notes</strong> &mdash; internal notes about the engagement, pricing, or special
            requirements.
          </li>
        </ul>
        <p>
          Service providers are conference-specific. If the same provider works on multiple
          conferences, add them separately to each.
        </p>
      </>
    ),
  },
  {
    id: 'news',
    title: 'News',
    content: () => (
      <>
        <p>
          The <strong>News</strong> module lets you publish articles visible to applicants on the
          conference portal.
        </p>
        <h3>Creating Articles</h3>
        <p>
          Click <strong>New Article</strong> to compose a news post. Each article has a title, rich
          text content (with formatting, links, and images), and a publish toggle.
        </p>
        <h3>Publishing</h3>
        <ul>
          <li>
            <strong>Published</strong> articles are visible to all portal users immediately.
          </li>
          <li>
            <strong>Unpublished</strong> (draft) articles are only visible to administrators.
          </li>
        </ul>
        <h3>Screen Overlays</h3>
        <p>
          News articles can be linked to <strong>screen overlays</strong> that display when
          applicants visit the portal. See the Screen Overlays section for details.
        </p>
        <h3>Notifications</h3>
        <p>
          When publishing an article, you can optionally send a notification to all applicants via
          email, informing them of the new content.
        </p>
      </>
    ),
  },
  {
    id: 'messaging',
    title: 'Messaging',
    content: () => (
      <>
        <p>
          The Messaging tab on each conference provides a thread-based communication system between
          administrators and applicants.
        </p>
        <h3>Composing Messages</h3>
        <p>
          Click <strong>New Message</strong> to compose. You can send to:
        </p>
        <ul>
          <li>
            <strong>Individual</strong> &mdash; select a single applicant.
          </li>
          <li>
            <strong>Bulk</strong> &mdash; select multiple recipients from a list or a{' '}
            <strong>recipient list</strong> (pre-defined group).
          </li>
        </ul>
        <h3>Thread View</h3>
        <p>
          Messages are organised in threads. Click a thread to view the full conversation, including
          replies from the applicant. You can reply directly from the thread view.
        </p>
        <h3>Search &amp; Filter</h3>
        <p>
          Filter threads by status (read, unread, archived), search by subject or sender, and sort
          by date.
        </p>
        <h3>Archive</h3>
        <p>
          Archive threads to keep your inbox clean. Archived threads can be found using the filter
          and unarchived at any time.
        </p>
        <h3>Attachments</h3>
        <p>Attach files to messages. Supported file types depend on the platform configuration.</p>
        <h3>Delivery Mode</h3>
        <ul>
          <li>
            <strong>In-app + Email</strong> &mdash; message appears in the portal inbox and a
            notification email is sent.
          </li>
          <li>
            <strong>Email only</strong> &mdash; the message is delivered solely via email and does
            not appear in the portal.
          </li>
        </ul>
        <h3>Templates</h3>
        <p>
          Use <strong>message templates</strong> (defined in Settings) to quickly compose messages
          with pre-filled subjects and bodies. Templates can include placeholder variables.
        </p>
        <h3>Recipient Lists</h3>
        <p>
          Create reusable <strong>recipient lists</strong> (e.g. &ldquo;All Accepted Authors&rdquo;,
          &ldquo;Workshop Attendees&rdquo;) in Settings. Select a list when composing to
          auto-populate recipients.
        </p>
      </>
    ),
  },
  {
    id: 'screen-overlays',
    title: 'Screen Overlays',
    content: () => (
      <>
        <p>
          Screen overlays are pop-up announcements displayed to applicants on the conference portal.
          They support rich content and animations for important announcements.
        </p>
        <h3>Trigger Types</h3>
        <table>
          <thead>
            <tr>
              <th>Trigger</th>
              <th>When it fires</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>first_registration</code>
              </td>
              <td>Once, after the applicant first registers on the portal.</td>
            </tr>
            <tr>
              <td>
                <code>scheduled</code>
              </td>
              <td>At a specific date/time. Shows once per applicant.</td>
            </tr>
            <tr>
              <td>
                <code>always</code>
              </td>
              <td>Every time the applicant opens the portal.</td>
            </tr>
          </tbody>
        </table>
        <h3>Animation Styles</h3>
        <p>
          Add visual flair with animation effects: <strong>confetti</strong>,{' '}
          <strong>fireworks</strong>, <strong>balloons</strong>, <strong>sparkles</strong>, and
          more. Animations play when the overlay appears and add a celebratory or attention-grabbing
          feel.
        </p>
        <h3>Content</h3>
        <ul>
          <li>
            <strong>Image</strong> &mdash; upload an image to display in the overlay.
          </li>
          <li>
            <strong>Rich Text</strong> &mdash; format the message with headings, bold, links, and
            lists.
          </li>
          <li>
            <strong>Display Order</strong> &mdash; when multiple overlays are active, they appear in
            the specified order.
          </li>
        </ul>
        <h3>Linking to Content</h3>
        <p>
          Overlays can be linked to content entities like news articles, so they appear in context
          when relevant content is published.
        </p>
      </>
    ),
  },
  {
    id: 'settings',
    title: 'Settings',
    content: () => (
      <>
        <p>
          The <strong>Settings</strong> area (accessible to super administrators) controls
          platform-wide configuration. Settings are organised into tabs:
        </p>
        <h3>People &amp; Roles</h3>
        <ul>
          <li>
            <strong>Volunteer Tasks</strong> &mdash; define task types that can be assigned to
            volunteers (e.g. Registration Desk, Room Monitor, AV Support).
          </li>
          <li>
            <strong>Committee Roles</strong> &mdash; roles for program committee members (e.g.
            Chair, Reviewer, Advisor).
          </li>
          <li>
            <strong>Pronouns</strong> &mdash; manage the list of available pronoun options for user
            profiles.
          </li>
        </ul>
        <h3>Conference Setup</h3>
        <ul>
          <li>
            <strong>Location Types</strong> &mdash; categories for locations (Room, Auditorium,
            Virtual, etc.).
          </li>
          <li>
            <strong>Session Types</strong> &mdash; categories for program sessions (Keynote,
            Workshop, Tutorial, etc.).
          </li>
          <li>
            <strong>Sponsor Packages</strong> &mdash; tiers for sponsors (Gold, Silver, Bronze,
            etc.).
          </li>
        </ul>
        <h3>CFP &amp; Reviews</h3>
        <ul>
          <li>
            <strong>Paper Form Builder</strong> &mdash; customise the fields that applicants fill
            out when submitting papers. Add text fields, dropdowns, checkboxes, file uploads, and
            more. Each field can be marked as required or optional.
          </li>
          <li>
            <strong>Score Scales</strong> &mdash; define the numerical scale reviewers use to rate
            papers (e.g. 1&ndash;5, 1&ndash;10).
          </li>
          <li>
            <strong>Review Criteria</strong> &mdash; define the dimensions reviewers evaluate (e.g.
            Originality, Relevance, Clarity, Technical Quality). Each criterion uses the selected
            score scale.
          </li>
        </ul>
        <h3>Communication</h3>
        <ul>
          <li>
            <strong>Email Settings</strong> &mdash; per-conference toggle for email sending, sender
            name configuration.
          </li>
          <li>
            <strong>Email Templates</strong> &mdash; see the Email Templates section.
          </li>
          <li>
            <strong>Messaging Settings</strong> &mdash; configure messaging behaviour.
          </li>
          <li>
            <strong>Message Templates</strong> &mdash; pre-defined message bodies with placeholder
            variables.
          </li>
          <li>
            <strong>Recipient Lists</strong> &mdash; reusable groups of recipients for bulk
            messaging.
          </li>
          <li>
            <strong>Screen Overlays</strong> &mdash; see the Screen Overlays section.
          </li>
        </ul>
        <h3>Finance</h3>
        <ul>
          <li>
            <strong>Currency &amp; Tax</strong> &mdash; configure the primary and second (invoice)
            currencies for the conference, set the exchange rate for dual-currency invoices, view
            the conference tax rate (auto-pulled from country rates), manage Country VAT/Tax Rates,
            configure the EU countries list, manage the fiscal representative, and edit the VAT
            decision table for EU tax compliance rules.
          </li>
          <li>
            <strong>Invoice Number</strong> &mdash; numbering template and counter reset rules.{' '}
            <em>Super-admin only.</em>
          </li>
          <li>
            <strong>Company Data</strong> &mdash; company information printed on invoices.
          </li>
          <li>
            <strong>Bank Accounts</strong> &mdash; bank details for invoice payment instructions.
          </li>
          <li>
            <strong>Invoice Templates</strong> &mdash; rich-text templates with placeholder
            variables for PDF invoice generation.
          </li>
          <li>
            <strong>Stripe Setup</strong> &mdash; payment gateway keys and configuration.{' '}
            <em>Super-admin only.</em>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'email-templates',
    title: 'Email Templates',
    content: () => (
      <>
        <p>
          Email templates let you customise the content of automated emails sent by the platform
          (e.g. registration confirmation, password reset, paper acceptance notifications).
        </p>
        <h3>Template Types</h3>
        <p>
          Each template corresponds to a specific event (e.g. &ldquo;Registration
          Confirmation&rdquo;, &ldquo;Paper Accepted&rdquo;, &ldquo;Paper Rejected&rdquo;). The
          system provides default templates that you can override per conference.
        </p>
        <h3>Placeholder Variables</h3>
        <p>
          Templates support placeholder variables that are replaced with actual values when the
          email is sent. Common variables include:
        </p>
        <ul>
          <li>
            <code>{'{{first_name}}'}</code> &mdash; recipient&rsquo;s first name.
          </li>
          <li>
            <code>{'{{conference_name}}'}</code> &mdash; name of the conference.
          </li>
          <li>
            <code>{'{{paper_title}}'}</code> &mdash; title of the submitted paper.
          </li>
          <li>
            <code>{'{{portal_url}}'}</code> &mdash; link to the applicant portal.
          </li>
        </ul>
        <h3>Rich Text Editing</h3>
        <p>
          Templates are edited with the rich text editor, supporting formatting, links, and images.
          Preview the rendered email before saving.
        </p>
        <h3>Per-Conference Customisation</h3>
        <p>
          Each conference can have its own version of a template. If no conference-specific template
          exists, the system falls back to the default.
        </p>
      </>
    ),
  },
  {
    id: 'my-company',
    title: 'My Company',
    content: () => (
      <>
        <p>
          The <strong>My Company</strong> page (visible to tenant admins) manages your
          organisation&rsquo;s profile on the platform.
        </p>
        <h3>Company Profile</h3>
        <ul>
          <li>
            <strong>Company Name</strong> &mdash; your organisation&rsquo;s legal name.
          </li>
          <li>
            <strong>Address</strong> &mdash; street, city, postal code, and country.
          </li>
          <li>
            <strong>Website</strong> &mdash; your organisation&rsquo;s homepage URL.
          </li>
          <li>
            <strong>VAT Number</strong> &mdash; your company&rsquo;s VAT registration number.
          </li>
          <li>
            <strong>Logo</strong> &mdash; upload your company logo, used as a fallback when no
            conference-specific logo is set.
          </li>
        </ul>
        <h3>Contact Persons</h3>
        <p>
          Add one or more company-level contact persons. These are used as default contacts and may
          appear on invoices and official communications.
        </p>
      </>
    ),
  },
  {
    id: 'team-management',
    title: 'Team Management',
    content: () => (
      <>
        <p>
          The <strong>Team</strong> page lets tenant admins manage user accounts within their
          organisation.
        </p>
        <h3>Adding Members</h3>
        <p>
          Click <strong>Add Member</strong> and enter the new user&rsquo;s email address. They will
          receive an invitation email. If they already have a platform account, they are linked
          immediately.
        </p>
        <h3>Roles</h3>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Admin</td>
              <td>
                Full access to company features, team management, company settings, activity logs.
              </td>
            </tr>
            <tr>
              <td>User</td>
              <td>Access only to assigned modules. Cannot manage team or company settings.</td>
            </tr>
          </tbody>
        </table>
        <h3>Editing Members</h3>
        <p>
          Click on a team member to edit their details: first name, last name, pronouns, and role.
        </p>
        <h3>Deactivation &amp; Deletion</h3>
        <ul>
          <li>
            <strong>Deactivate</strong> &mdash; revokes access without deleting the account. The
            user can be reactivated later.
          </li>
          <li>
            <strong>Delete</strong> &mdash; permanently removes the account. This action cannot be
            undone.
          </li>
        </ul>
        <h3>Module Access</h3>
        <p>
          Modules are assigned at the company level by the super administrator. All team members
          with the appropriate role can access the assigned modules. Individual module access per
          user is not supported &mdash; it&rsquo;s all or nothing per module.
        </p>
      </>
    ),
  },
  {
    id: 'activity-log',
    title: 'Activity Log',
    content: () => (
      <>
        <p>
          The <strong>Activity Log</strong> page (visible to tenant admins) tracks applicant
          lifecycle events across all your conferences.
        </p>
        <h3>Tracked Events</h3>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Registered</td>
              <td>Applicant created an account on the portal.</td>
            </tr>
            <tr>
              <td>Verified</td>
              <td>Applicant verified their email address.</td>
            </tr>
            <tr>
              <td>Confirmed</td>
              <td>Applicant confirmed their registration for a conference.</td>
            </tr>
            <tr>
              <td>Deleted</td>
              <td>Applicant account was removed.</td>
            </tr>
          </tbody>
        </table>
        <h3>Filtering &amp; Search</h3>
        <p>
          Filter by event type, date range, and conference. Search by applicant name or email to
          find specific entries.
        </p>
        <h3>CSV Export</h3>
        <p>
          Export the activity log to CSV. Large exports are streamed in batches of 1,000 rows for
          performance. The export includes a UTF-8 BOM for Excel compatibility.
        </p>
      </>
    ),
  },
  {
    id: 'password-reset',
    title: 'Password Reset',
    content: () => (
      <>
        <p>
          If you forget your admin account password, use the <strong>Forgot Password</strong> flow
          to reset it securely.
        </p>
        <h3>How It Works</h3>
        <ol>
          <li>
            On the login page, click <strong>&ldquo;Forgot password?&rdquo;</strong>.
          </li>
          <li>Enter the email address associated with your account.</li>
          <li>
            If the account exists and is active, the system sends a reset link to your email. For
            security, the same success message is shown regardless of whether the email exists.
          </li>
          <li>Click the link in the email. It opens a page where you set a new password.</li>
          <li>After resetting, you are redirected to the login page to sign in.</li>
        </ol>
        <h3>Password Requirements</h3>
        <p>Your new password must meet all of the following:</p>
        <ul>
          <li>
            At least <strong>8 characters</strong> long.
          </li>
          <li>
            At least one <strong>uppercase</strong> letter (A&ndash;Z).
          </li>
          <li>
            At least one <strong>lowercase</strong> letter (a&ndash;z).
          </li>
          <li>
            At least one <strong>digit</strong> (0&ndash;9).
          </li>
        </ul>
        <h3>Security Notes</h3>
        <ul>
          <li>
            Reset links expire after <strong>1 hour</strong>.
          </li>
          <li>
            Each link can only be used <strong>once</strong>.
          </li>
          <li>Requesting a new reset link invalidates any previous unused links.</li>
          <li>
            After a successful reset, all existing sessions (on other devices or browsers) are
            terminated &mdash; you must log in again everywhere.
          </li>
        </ul>
      </>
    ),
  },
];
