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
            <strong>Currency</strong> &mdash; the currency used for pricing, invoices, and financial
            reporting. This is set once and affects all monetary fields.
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
        <h3>VAT Rate Periods</h3>
        <p>
          VAT rates can change over time. The platform supports defining multiple{' '}
          <strong>VAT rate periods</strong> with date ranges:
        </p>
        <ul>
          <li>
            Each period has a <strong>start date</strong>, an optional <strong>end date</strong>,
            and a <strong>VAT rate</strong> (percentage).
          </li>
          <li>The system validates that periods do not overlap.</li>
          <li>
            The currently active rate (based on today&rsquo;s date) is used for new invoices and
            registrations.
          </li>
          <li>
            If no period covers the current date, the system warns you that no VAT rate is active.
          </li>
        </ul>
        <p>
          This ensures accurate tax calculation even when rates change mid-conference or between
          years.
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
              <td>Invoice delivered to the recipient. Editing is restricted.</td>
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
              <td>Past due date without payment.</td>
            </tr>
            <tr>
              <td>
                <code>Cancelled</code>
              </td>
              <td>Invoice voided &mdash; no longer payable.</td>
            </tr>
          </tbody>
        </table>
        <h3>Invoice Details</h3>
        <ul>
          <li>
            <strong>Line Items</strong> &mdash; individual charges (registration fee, workshop
            add-on, etc.) with quantity, unit price, and tax rate.
          </li>
          <li>
            <strong>Tax Calculation</strong> &mdash; VAT is calculated based on the active VAT rate
            period from the fiscal representative settings.
          </li>
          <li>
            <strong>Recipient</strong> &mdash; billing name, address, VAT number, and email.
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
            <strong>Currency</strong> &mdash; inherited from the conference settings.
          </li>
        </ul>
        <h3>Export</h3>
        <p>
          Invoices can be exported as CSV (up to 50,000 rows). The export includes a UTF-8 BOM for
          compatibility with Excel.
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
