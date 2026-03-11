# SaaSConf Tenant UI Handbook

*Guide to Managing Conferences on the SaaSConf Platform*

Last Updated: March 11, 2026
Audience: Tenant Admins, Conference Admins, Team Members

---

## Introduction

SaaSConf is a multi-tenant platform for conference management. Each tenant (organization) manages multiple conferences with call for papers, registrations, invoicing, program scheduling, and more — all within a unified interface.

### User Roles

| Role | Scope | Key Capabilities |
|------|-------|-----------------|
| **Super Admin** | Platform-wide | Manage all tenants, configure modules, view audit logs |
| **Tenant Admin** | Own organization | Create/delete conferences, invite users, configure all settings |
| **Conference Admin** | Assigned conferences | Edit conference details, manage team, configure settings |
| **Team Member (Read-Only)** | Assigned conferences | View data, export reports |

Roles are assigned via the **Team** page in the main navigation (not the conference-level Team tab).

### Conference Sidebar

When you open a conference, the left sidebar organizes all features into 7 groups:

1. **Event Setup** — Details, Team, Social Media, Settings, Deadlines, Locations
2. **Content** — Call for Papers (with sub-tabs), Program (with sub-tabs), Sessions
3. **People** — Program Committee, Speakers, Users, Attendees, Volunteers (with sub-tabs), Alumni
4. **Partnerships** — Sponsors, Service Providers
5. **Registration & Finance** — Booking Options, Registration, Invoices, Payment Reminders, Cost Management
6. **Communications** — Messages, News
7. **Insights** — Analytics (with sub-tabs)

Some tabs are only visible when the corresponding module is enabled for your tenant. The sidebar can be collapsed to maximize workspace.

---

## 1. Event Setup

### 1.1 Details

The default view when opening a conference. Configure all core conference information here.

**What you can do:**
- Set conference name, abbreviation, and rich-text description
- Configure start/end dates, timezone, and event type (onsite/virtual/hybrid)
- Enter venue details (name, address, city, country) and streaming platform URL
- Set contact information (support email, contact email, phone)
- Upload/replace/delete conference logo (JPEG, PNG, WebP, GIF; max 10 MB)
- View and copy auto-generated portal URLs

All fields auto-save when you stop typing. A save indicator shows "Saving..." / "Saved" / "Save failed".

**Dependencies:** None — this is the starting point for any conference.

**Consequences:**
- **Conference name** appears on all pages, emails, invoices, and portal
- **Abbreviation** determines the portal URL: `/{tenant-slug}/portal/{abbreviation}`
- **Timezone** affects how session times display in the program and portal
- **Country** auto-suggests timezone and influences default VAT rules
- **Event type** affects VAT calculation (virtual vs. in-person attendance)
- **Contact fields** populate placeholders in email and invoice templates: `[SUPPORT_EMAIL]`, `[CONTACT_EMAIL]`, `[PHONE]`
- **Logo** appears on conference cards, header, portal, and optionally in invoice PDFs via `[LOGO]` placeholder

**Interdependencies:**
- Set timezone before creating Sessions (changing it later causes confusion)
- Set contact emails before configuring Email Templates (used as placeholder values)
- Set country before configuring Currency & Tax settings

---

### 1.2 Team

Lists people associated with the conference (chairs, committee leads, organizers). This is a **display-only directory** — it does not grant login access.

**What you can do:**
- Add team members with first name, last name, role, email, phone
- Mark members as "Conference Manager" (blue badge)
- Edit or remove team members
- Team member info may display on the public portal

**Important distinction:** To grant someone login access, use the **Team page in the main navigation** and invite them as a user. The conference Team tab is for public display only.

**Dependencies:** None.

**Consequences:** Team member count appears on conference cards. Team data may be visible on the public portal.

---

### 1.3 Social Media

Configure social media profile links for the conference.

**What you can do:**
- Add platforms from a list (Twitter, Facebook, LinkedIn, Instagram, YouTube, GitHub, Mastodon) or add custom platforms
- Enter profile URLs for each platform
- Remove platforms (immediate, no confirmation)

Links are display-only — SaaSConf does not auto-post to social media or require API keys. Enter full URLs including `https://`.

**Dependencies:** None.

**Consequences:** Social links appear on the public-facing portal pages.

---

### 1.4 Settings

The Settings tab contains 5 groups of configuration sub-tabs. All settings auto-save.

---

#### 1.4.1 People & Roles

##### Volunteer Tasks

Define task types that volunteers can be assigned to (e.g., "Registration Desk", "Session Chair", "AV Support").

**Dependencies:** Must be configured before using Volunteer Assignment (3.5).
**Consequences:** Tasks appear in the Task Assignment and Volunteer Assignment grids.

##### Committee Roles

Define roles for CFP review committee members (e.g., "Chair", "Vice Chair", "Reviewer").

**Dependencies:** Must be configured before adding Program Committee members (3.1).
**Consequences:** Roles appear when assigning committee members.

##### Pronoun Options

Configure pronoun options available during registration (e.g., "he/him", "she/her", "they/them").

**Dependencies:** Must be configured before attendees register.
**Consequences:** Options appear in registration forms and attendee profiles.

---

#### 1.4.2 Conference Setup

##### Location Types

Define venue/location categories (e.g., "Main Hall", "Breakout Room", "Virtual Room").

**Dependencies:** Must be configured before creating Locations (1.6).
**Consequences:** Location types appear when creating or editing locations.

##### Session Types

Define session format templates (e.g., "Keynote", "Workshop", "Panel", "Tutorial", "Poster"). Each type has a name, default duration, color, and flags for `separately_bookable` and `is_tutorial`. See **Sessions (2.3)** for detailed documentation of how session types work.

**Dependencies:** Must be configured before creating Sessions (2.3).
**Consequences:** Session types control display in Program Design, color-coding, and whether sessions appear as selectable options during registration.

##### Sponsor Packages

Define sponsorship tiers and benefits (e.g., "Gold", "Silver", "Bronze" with descriptions and pricing).

**Dependencies:** Must be configured before adding Sponsors (4.1).
**Consequences:** Packages appear when creating sponsors and in sponsor contracts.

##### Registration Portal

Configure the public registration portal for this conference:
- Enable/disable public registration
- Set portal logo, theme colors (primary color, background)
- Define registration open/close dates
- Configure success message shown after registration
- Enable/disable specific registration features

**Dependencies:** Booking Options must be configured with prices for registration to work.
**Consequences:** Controls whether and how the public portal accepts registrations. Registration dates determine when attendees can register.

**Interdependencies:** Booking Options (5.1) must have active periods with prices. Email Templates must be configured for confirmation emails.

##### Policies

Define conference policies and terms that attendees must accept during registration (e.g., privacy policy, code of conduct, cancellation policy).

**Dependencies:** None.
**Consequences:** Policies appear as checkboxes on the registration form. Attendees must accept all active policies to complete registration.

##### Registration Questions

Create custom questions asked during registration (e.g., "Dietary requirements", "T-shirt size", "How did you hear about us?"). Supports text, dropdown, and multi-select question types.

**Dependencies:** None.
**Consequences:** Questions appear in the registration form. Answers are visible in the Attendees tab (3.4) and can be analyzed in Analytics > Registration Questions (7.1.1).

---

#### 1.4.3 CFP & Reviews

##### Paper Form

Build the custom paper submission form using drag-and-drop fields. Define which fields are required, optional, or hidden. Add custom fields for specific information needs.

**Dependencies:** Must be configured before opening the CFP portal to applicants.
**Consequences:** Determines what information applicants must provide when submitting papers.

##### Score Scales

Define scoring scales used by reviewers (e.g., 1-5 stars, 1-10 numeric, Accept/Reject/Revise).

**Dependencies:** Must be configured before enabling paper reviews.
**Consequences:** Scales appear in the review form. Review scores are aggregated in Evaluated Papers (2.1.4).

##### Review Criteria

Configure the criteria and questions reviewers must answer when evaluating papers (e.g., "Originality", "Technical Quality", "Relevance").

**Dependencies:** Score Scales must be defined first.
**Consequences:** Criteria appear in the review form alongside the selected score scale.

---

#### 1.4.4 Communication

##### Email Settings

Enable or disable email sending for this conference. When disabled, no automated emails are sent (registration confirmations, reminders, etc.).

**Important:** Password reset emails are always sent regardless of this setting.

**Dependencies:** None.
**Consequences:** Affects all automated email features: registration confirmations, invoice sending, payment reminders, deadline reminders, news distribution, CFP notifications.

##### Email Templates

Create and customize email templates with rich text and placeholders. Templates are used by various features to send automated emails.

**Template types and where they are used:**

| Template Type | Used By | Key Placeholders |
|---------------|---------|-----------------|
| `registration_confirmation` | Registration (5.2) | `[Recipient Name]`, `[Conference Name]`, `[Booking Option]` |
| `invoice_sent` | Invoices (5.3) | `[Invoice Number]`, `[Recipient Name]`, `[Total]`, `[Currency]` |
| `invoice_cancelled` | Invoice cancellation | `[Invoice Number]`, `[Cancellation Reason]` |
| `invoice_replaced` | Invoice replacement | `[Invoice Number]`, `[Original Invoice Number]` |
| `payment_reminder_first` | Payment Reminders (5.4) | `[Recipient Name]`, `[Invoice Number]`, `[Invoice Amount]`, `[Days Overdue]` |
| `payment_reminder_second` | Payment Reminders (5.4) | Same as first reminder |
| `cfp_acceptance` | Accepted Papers (2.1.5) | `[Recipient Name]`, `[Paper Title]`, `[Conference Name]` |
| `cfp_rejection` | Rejected Papers (2.1.6) | `[Recipient Name]`, `[Paper Title]`, `[Conference Name]` |
| `reviewer_assignment` | Assignments (2.1.3) | `[Reviewer Name]`, `[Paper Title]` |
| `sponsor_contract_send` | Sponsors (4.1) | `[Recipient Name]`, `[Package Name]`, `[Custom Message]`, `[Contract Content]` |
| `deadline_reminder` | Deadlines (1.5) | `[Deadline Title]`, `[Due Date]`, `[Conference Name]` |
| `news_distribution` | News (6.2) | `[Article Title]`, `[Article Content]`, `[Conference Name]` |

**Dependencies:** Contact fields in Details (1.1) populate `[SUPPORT_EMAIL]`, `[CONTACT_EMAIL]`, `[PHONE]` placeholders.
**Consequences:** Templates determine the content and appearance of all automated emails sent by the system.

##### Messaging Settings

Configure in-app messaging settings for the conference.

**Dependencies:** None.
**Consequences:** Controls messaging behavior in the Messages tab (6.1).

##### Message Templates

Create reusable message templates for bulk or repeated communications.

**Dependencies:** None.
**Consequences:** Templates appear when composing messages in the Messages tab (6.1).

##### Recipient Lists

Define predefined groups of recipients for bulk messaging (e.g., "All Speakers", "All Sponsors", "Program Committee").

**Dependencies:** Relevant people must exist (speakers, sponsors, etc.) to populate lists.
**Consequences:** Lists appear as recipient options when sending messages (6.1) and when distributing news articles (6.2).

##### Screen Overlays

Configure full-screen overlay announcements shown to portal users on login. Supports text content (title + body), optional image upload, and configurable trigger rules.

**Trigger types:**
- **First registration** — shown once per user
- **Scheduled** — shown on/after a specific date
- **Always** — shown every login

**Dependencies:** None.
**Consequences:** Overlays appear to portal users based on trigger rules. Can be linked to specific content (e.g., news articles, messages).

---

#### 1.4.5 Finance

##### Currency & Tax

Configure the default conference currency and VAT/tax rules:
- Default currency (ISO 4217, e.g., EUR, USD)
- VAT rate and rules
- Fiscal representative settings (for conferences in countries requiring one)

**Dependencies:** Must be configured before setting prices in Booking Options (5.1).
**Consequences:** Currency applies to all booking periods (unless overridden per period). VAT rules affect invoice calculations. Event type (from Details) influences whether reverse charge applies.

**VAT calculation depends on:** Conference country, customer country, attendance type (in-person vs. virtual), customer type (B2B vs. B2C). The system applies EU VAT rules automatically based on a 24-rule decision table.

##### Numbering

Configure invoice number format (e.g., `{YEAR}-{SEQ:5}` produces "2026-00001"). Super Admin only.

**Dependencies:** None.
**Consequences:** Invoice numbers are sequential and immutable once assigned. Format changes only affect future invoices.

##### Company Data

Set your organization's details for invoice headers: company name, address, VAT number, tax ID, footer text, and optional secondary currency with exchange rate.

**Dependencies:** None.
**Consequences:** Company data populates invoice PDF placeholders: `[COMPANY_NAME]`, `[ADDRESS]`, `[CITY]`, `[POSTAL_CODE]`, `[COUNTRY]`, `[VAT]`, `[TAX_ID]`.

##### Bank Accounts

Configure bank account details displayed on bank transfer invoices: bank name, IBAN, BIC/SWIFT.

**Dependencies:** None.
**Consequences:** Bank details populate invoice PDF placeholders: `[BANK_NAME]`, `[IBAN]`, `[BIC]`. Shown on bank transfer invoices for payment instructions.

##### Invoice Templates

Design and customize invoice PDF templates with a rich text editor. Three sections: header (repeated every page), body (main content), footer (repeated every page).

**Available placeholders (40+):**
- **Company:** `[COMPANY_NAME]`, `[ADDRESS]`, `[CITY]`, `[POSTAL_CODE]`, `[COUNTRY]`, `[VAT]`, `[TAX_ID]`, `[TAX_SYSTEM]`, `[LOGO]`
- **Recipient:** `[RECIPIENT_NAME]`, `[RECIPIENT_ADDRESS]`, `[RECIPIENT_CITY]`, `[RECIPIENT_POSTAL_CODE]`, `[RECIPIENT_COUNTRY]`, `[RECIPIENT_VAT]`, `[RECIPIENT_EMAIL]`
- **Invoice:** `[INVOICE_NUMBER]`, `[ISSUE_DATE]`, `[DUE_DATE]`, `[ITEMS_TABLE]`, `[NOTES]`
- **Financial:** `[SUBTOTAL]`, `[TAX_RATE]`, `[TAX_AMOUNT]`, `[TOTAL]`, `[CURRENCY]`
- **Banking:** `[BANK_NAME]`, `[IBAN]`, `[BIC]`
- **Contact:** `[CONTACT_EMAIL]`, `[PHONE]`
- **Dual Currency:** `[SECOND_CURRENCY]`, `[SECOND_TOTAL]`, `[EXCHANGE_RATE]`

`[ITEMS_TABLE]` auto-generates an HTML table from invoice line items.

**Dependencies:** Company Data and Bank Accounts should be configured first.
**Consequences:** Template determines the appearance of all generated invoice PDFs.

##### ZUGFeRD

Configure ZUGFeRD/Factur-X electronic invoicing (EU standard for machine-readable invoice PDFs):
- Enable/disable ZUGFeRD
- Select profile: EN16931 (recommended), MINIMUM, or EXTENDED
- Set seller VAT ID, contact email, phone
- Configure payment terms and codes

**Dependencies:** Company Data must include VAT ID. Invoice recipients need ISO country codes.
**Consequences:** When enabled, invoice PDFs include embedded XML data for automated processing. Required for German B2B invoicing (2025-2028 mandate). Falls back gracefully to standard PDF if validation fails.

##### Stripe Setup

Configure Stripe payment integration for credit card invoices. Super Admin only.
- Secret key, publishable key, webhook secret
- Enable/disable toggle

**Setup requires:**
1. Stripe account (stripe.com)
2. API keys from Stripe Dashboard > Developers
3. Webhook endpoint configured in Stripe: `https://your-domain.com/api/v1/stripe/webhook`
4. Webhook events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`

**Dependencies:** None (but must be configured before sending credit card invoices).
**Consequences:** Enables credit card invoice creation with automatic payment links. Stripe webhooks auto-update invoice status to "paid" when payment is received.

##### Payment Reminders

Configure automated payment reminder settings:
- Enable/disable automatic reminders
- 1st reminder: N days after due date (default: 2, range: 1-90)
- 2nd reminder: M days after due date (default: 17, range: 1-180)
- Notify admin after 2nd reminder (toggle)

**Dependencies:** Email Templates for `payment_reminder_first` and `payment_reminder_second` should be configured.
**Consequences:** System automatically sends reminder emails for overdue invoices. See Payment Reminders tab (5.4) for viewing sent reminders.

---

### 1.5 Deadlines

Track critical dates and receive automated email reminders. Core feature — no module required.

**What you can do:**
- Create deadlines with title, description, and due date/time
- View deadlines as color-coded cards: red (overdue), amber (due within 7 days), blue (active), gray (resolved)
- Toggle deadlines between active and resolved without deleting
- Edit or delete deadlines

**Automated reminders:** The system sends email reminders at 3 intervals:
- 7 days before due date
- 1 day before due date
- On the due date

Changing a due date selectively resets reminder flags so reminders are sent again for the new date.

**Dashboard warnings:** When loading a conference with deadlines due within 7 days, toast notifications appear automatically.

**Dependencies:** Email Settings must be enabled for reminder emails to send.
**Email template used:** `deadline_reminder`

**Consequences:** Reminders sent to conference team. Resolved deadlines remain visible for reference.

---

### 1.6 Locations

Manage venues and rooms for the conference. **Requires: `locations` module.**

**What you can do:**
- Create locations in a hierarchy (e.g., "Congress Center" > "Hall A" > "Room 101")
- Set capacity, location type, address, coordinates
- Assign locations to sessions in the program
- Upload documents and floor plans
- Add contact persons per location
- Control visibility (published/hidden)

**Dependencies:** Location Types must be configured in Settings (1.4.2) first.

**Consequences:**
- Locations appear as assignment options when scheduling sessions in Program Design (2.2.1)
- Location capacity can limit session attendance
- Published locations may appear on the portal

---

## 2. Content

### 2.1 Call for Papers

Manage the entire CFP lifecycle from topic definition through paper decisions. **Requires: `cfp` module.**

The Call for Papers is a structured multi-phase process that guides papers from submission through peer review to final decisions. It is designed around the academic conference model where an independent program committee evaluates submissions through blind or open review.

The CFP tab has 6 sub-tabs, each representing one stage of the review pipeline. Papers flow through these stages sequentially:

<cfp-flow>
SETUP → SUBMISSION → ASSIGNMENT → REVIEW → DECISION → OUTCOME
</cfp-flow>

**Paper status lifecycle — each paper transitions through these statuses:**

<status-flow>
Submitted|blue → Under Review|amber → Evaluated|purple → Accepted|green
Evaluated|purple → Rejected|red
</status-flow>

- **Submitted**: Paper received from author via the portal. Author can still edit until the submission deadline.
- **Under Review**: At least one reviewer has been assigned. Paper is locked for author edits.
- **Evaluated**: All assigned reviewers have completed their reviews. Scores are aggregated.
- **Accepted**: Admin has accepted the paper. Author receives acceptance email. Paper can become a Session.
- **Rejected**: Admin has rejected the paper. Author receives rejection email.

**Phase 1 — Setup (before opening the CFP):**
- Define Topics/tracks that authors can submit to (sub-tab: Topics)
- Configure the Paper Form fields in Settings (1.4.3)
- Set up Score Scales and Review Criteria in Settings (1.4.3)
- Add Program Committee members (3.1) with topic expertise and COI declarations
- Share the portal URL with potential authors

**Phase 2 — Submission (portal-side):**
- Authors register on the portal and submit papers selecting a topic
- Papers arrive in the Papers sub-tab with status "Submitted"
- Authors can update their submissions until the deadline (configurable via Deadlines 1.5)

**Phase 3 — Assignment:**
- Admin assigns papers to committee reviewers in the Assignments sub-tab
- The system respects COI declarations — conflicted reviewers cannot be assigned
- Each paper can have multiple reviewers for balanced evaluation
- Reviewers receive email notification with their assigned papers

**Phase 4 — Review (portal-side):**
- Committee members review assigned papers through their portal
- They score papers using the configured Score Scales and Review Criteria
- Papers move to "Evaluated" status once all assigned reviews are complete

**Phase 5 — Decision:**
- Admin reviews aggregated scores and comments in the Evaluated Papers sub-tab
- Papers can be compared side-by-side
- Admin makes Accept or Reject decisions (individually or in bulk)

**Phase 6 — Outcome:**
- Accepted papers appear in the Accepted Papers sub-tab; authors receive acceptance email
- Rejected papers appear in the Rejected Papers sub-tab; authors receive rejection email
- Accepted papers can be converted into Sessions (2.3) for the conference program

**Dependencies (must be set up before opening the CFP):**
- Paper Form, Score Scales, and Review Criteria in Settings (1.4.3)
- Topics defined (sub-tab: Topics)
- Program Committee members added (3.1) with topic expertise

**Key constraints:**
- COI-flagged reviewers cannot be assigned to conflicted papers
- Paper status transitions are sequential — you cannot skip phases
- Once a decision (accept/reject) is made, the paper cannot return to evaluation

**Email templates used:**
- `reviewer_assignment` — sent to reviewers when papers are assigned
- `cfp_acceptance` — sent to authors when their paper is accepted
- `cfp_rejection` — sent to authors when their paper is rejected

**Interdependencies:**
- Accepted papers → Sessions (2.3) → Program Design (2.2.1): the content pipeline from submission to published schedule
- Topics → Committee expertise matching: topics help suggest appropriate reviewers
- Deadlines (1.5): set submission deadlines and review deadlines to keep the process on track

#### 2.1.1 Topics

Define submission topics/tracks for the CFP (e.g., "Machine Learning", "Security", "DevOps"). Topics categorize papers and help match reviewers with relevant expertise.

**Consequences:** Topics appear on the CFP portal submission form. Papers are categorized by topic. Topics can be used to match reviewers with relevant expertise.

#### 2.1.2 Papers

View and manage all submitted papers. Search, filter by status/topic, view paper details, download attachments. Papers support multiple authors (co-speakers).

**Paper statuses:** Submitted → Under Review → Evaluated → Accepted/Rejected

**Consequences:** Paper status changes trigger notifications to applicants (if email templates configured).

#### 2.1.3 Assignments

Assign papers to Program Committee reviewers. The system supports manual assignment and can suggest assignments based on topic expertise.

**Constraints:** Reviewers with conflict-of-interest (COI) flags cannot be assigned to those papers. Each paper should have multiple independent reviewers.

**Email template used:** `reviewer_assignment`

**Consequences:** Assigned reviewers receive email notifications and see papers in their portal review queue.

#### 2.1.4 Evaluated Papers

View papers that have completed the review process with aggregated scores and reviewer comments. Compare papers side-by-side to make informed accept/reject decisions.

**Dependencies:** Reviews must be completed by assigned committee members.

#### 2.1.5 Accepted Papers

Papers marked as accepted. Bulk or individual acceptance with email notification.

**Email template used:** `cfp_acceptance`

**Consequences:** Accepted papers can be converted into program sessions. Applicants receive acceptance notification.

**Interdependency:** Accepted papers → Sessions (2.3) → Program Design (2.2.1)

#### 2.1.6 Rejected Papers

Papers marked as rejected. Bulk or individual rejection with email notification.

**Email template used:** `cfp_rejection`

**Consequences:** Applicants receive rejection notification.

---

### 2.2 Program

Design and build the conference schedule. **Requires: `program` module.**

#### 2.2.1 Design

Visual CSS Grid editor for building the conference schedule day by day. Each day displays a grid where:

- **Rows** = time slots (e.g., 09:00–10:00, 10:30–12:00)
- **Columns** = tracks (e.g., "Main Hall", "Room A", "Workshop Room")
- **Cells** = sessions placed at a specific time and track

**Building the grid:**

1. **Create Program Days** — each maps to a conference date. Days appear as tabs.
2. **Add Time Slots** — define start/end times for each day. Slots can span multiple rows (e.g., a 3-hour tutorial).
3. **Add Tracks** — parallel streams within a day. Each track gets a column.
4. **Place Sessions** — drag existing sessions into cells, or create new ones inline. A session can span multiple time slots (multi-slot duration).

**Special slot types:**
- **Break slots** — non-session time (coffee, lunch). Span all tracks with a label.
- **General events** — plenary sessions that span all tracks (opening ceremony, keynote).
- **Regular sessions** — placed in a single track column.

**What you can do:**
- Reorder tracks and time slots by dragging
- Resize time slots by adjusting start/end times
- Assign a location to each track
- Color-code sessions by session type
- View speaker assignments per session

**Dependencies:** Sessions (2.3), Locations (1.6), and Session Types (Settings 1.4.2) should be created first.

**Consequences:** The program grid becomes the published schedule. Time slot definitions determine when sessions appear on the portal and in registration session selection.

#### 2.2.2 Build

Assign papers to sessions and publish the program to attendees.

**Paper assignment:**
- Open a session in the grid to see its paper list
- Search and add accepted papers (from CFP Accepted Papers, 2.1.5)
- Set paper order within a session (presentation sequence)
- Each paper can only be assigned to one session

**Publishing workflow:**

<status-flow>
Draft → Preview → Publish
Published → Update (re-publish)
</status-flow>

1. **Preview** — generates a read-only preview of the full schedule. Review for gaps, conflicts, or missing assignments.
2. **Publish** — makes the program visible on the attendee portal. Triggers acceptance/rejection emails to paper authors.
3. **Update** — after initial publish, changes can be re-published. Only **new** assignments trigger notifications (differential publishing — authors already notified are not emailed again).

**Email templates used:**
- `Paper Acceptance` — sent to authors whose papers are assigned to a session on publish
- `Paper Rejection` — sent to authors whose papers were not assigned (if configured)

**Dependencies:** Program Design (2.2.1) must have the grid structure. Accepted Papers (2.1.5) must exist for assignment.

**Consequences:**
- Publishing makes the schedule visible on the portal
- Authors receive acceptance/rejection emails on first publish
- Subsequent re-publishes only notify newly assigned authors
- Assigned papers appear in the session detail on the portal

---

### 2.3 Sessions

Manage individual conference sessions. **Requires: `sessions` module.**

**What you can do:**
- Create sessions with title, description, session type, duration
- Assign speakers and locations
- Mark sessions as "separately bookable" (for tutorials, workshops)
- Set session capacity limits
- Link sessions to program days

#### Session Types

Session types are format templates defined in **Settings > Conference Setup > Session Types** (1.4.2). Every session must have a type. Types control display and behavior across the platform.

**Built-in examples:** Keynote, Workshop, Panel Discussion, Tutorial, Poster Session, Hackathon, Bonus Session, Networking, Social Event.

**Key fields on a session type:**

| Field | Purpose |
|---|---|
| **Name** | Display label (e.g., "Tutorial", "Keynote") |
| **Default Duration** | Pre-fills duration when creating a session of this type (e.g., 90 min) |
| **Separately Bookable** | If enabled, sessions of this type appear as selectable options during registration |
| **Is Tutorial** | Marks the type as a tutorial format — used for filtering and display grouping |
| **Color** | Color-codes sessions of this type in the Program Design grid |

**How `separately_bookable` works:**
1. A booking option is linked to a program day
2. That day has sessions marked with a `separately_bookable` session type
3. During registration, the registrant sees dropdown menus grouped by session type to choose from
4. Parallel sessions in the same time slot: choose **one** via dropdown
5. Non-parallel sessions (different time slots): choose from **each** independently
6. Sessions without papers assigned show: *"You can choose your sessions later"*
7. Full sessions (at capacity) are hidden from dropdowns

**Dependencies:** Session Types (Settings 1.4.2) must be defined first. Speakers (3.2) and Locations (1.6) should exist for assignment.

**Consequences:**
- Sessions appear in Program Design (2.2.1) for scheduling
- **Separately bookable sessions** appear as selection options during registration when linked to a booking option's program day
- Session capacity limits hide full sessions from registration dropdowns
- Session type colors appear in the program grid for visual identification

**Interdependencies:**
- Booking Options (5.1) link options to program days; if that day has bookable sessions, registrants choose one per time slot
- Attendees (3.4) shows which session each registrant selected
- Program Design (2.2.1) uses session types for color-coding and grouping

---

## 3. People

### 3.1 Program Committee

Manage CFP review committee members. **Requires: `cfp` module.**

**What you can do:**
- Add committee members with name, email, affiliation
- Assign committee roles (defined in Settings 1.4.1)
- Set topic expertise and conflict-of-interest declarations
- View assignment load per reviewer

**Dependencies:** Committee Roles (Settings 1.4.1) and Topics (2.1.1) should be configured first.

**Consequences:** Committee members can be assigned papers for review in Assignments (2.1.3). They access the review portal with their credentials.

---

### 3.2 Speakers

Manage conference speakers. **Requires: `speakers` module.**

**What you can do:**
- Add speakers with profile information (name, bio, photo, affiliation, social links)
- Assign speakers to sessions
- Upload speaker photos
- Manage speaker visibility on portal

**Dependencies:** None (but sessions should exist for assignment).

**Consequences:** Speakers appear in the program grid and on the public portal. Speaker data can be used in Discount Code bulk generation (Booking Options 5.1).

---

### 3.3 Users (CFP Portal Users)

View and manage users who have accounts on the CFP/attendee portal. **Requires: `cfp` module.**

**What you can do:**
- View applicant profiles and submission history
- Check registration status across conferences
- Manage portal access permissions

**Dependencies:** CFP must be configured and open for submissions.

**Consequences:** User accounts persist across conferences within the tenant. Portal users can submit papers, register for events, and view their history.

---

### 3.4 Attendees

View and manage registered attendees. **Requires: `attendees` module.**

**What you can do:**
- View attendee list with registration details, booking options, session selections
- Search and filter by name, email, status, booking option
- Export attendee data to CSV
- View registration statistics (total, by booking option, by status)

**Dependencies:** Registration (5.2) and Booking Options (5.1) must be configured. Attendees appear here after registering.

**Consequences:** Attendee data feeds into Alumni records (3.6) when registration is paid.

**Interdependencies:**
- Registration answers to custom questions (Settings 1.4.2 > Registration Questions) are visible here
- Session selections made during registration appear in attendee details
- Invoice status from Invoices (5.3) determines attendee payment status

---

### 3.5 Volunteers

Manage conference volunteers and their assignments. **Requires: `volunteers` module.**

**What you can do:**
- Add volunteers with name, email, contact info, and a per-conference color for visual identification
- Link existing portal users as volunteers
- Manage volunteer availability and preferences

**Dependencies:** Volunteer Tasks must be defined in Settings (1.4.1).

#### 3.5.1 Task Assignment

Assign volunteer tasks to specific sessions using a visual program grid. Drag and drop tasks onto sessions, set required volunteer count per task.

**Dependencies:** Sessions must be scheduled in Program Design (2.2.1). Volunteer Tasks must be defined in Settings.

**Consequences:** Creates task requirements that need to be filled by volunteers in Volunteer Assignment.

#### 3.5.2 Volunteer Assignment

Assign specific volunteers to session tasks. Visual program grid shows tasks and available volunteers. Drag and drop volunteers onto task slots.

**Dependencies:** Task Assignment (3.5.1) must have tasks assigned to sessions.

**Consequences:** Volunteers see their assignments. Assignments appear in the Volunteer Schedule.

#### 3.5.3 Volunteer Schedule

View the complete volunteer schedule in an expandable list format. Shows each volunteer's assignments across all days with times and locations. Supports PDF export for printing.

**Dependencies:** Volunteer Assignment (3.5.2) must be complete.

---

### 3.6 Alumni

Track past conference attendees across all conferences. Core feature — no module required.

**What you can do:**
- View alumni with source badges: Manual (gray), Import (blue), Registration (green)
- Add alumni manually (first name, last name, email, company, notes)
- Import via CSV (up to 50,000 rows; supports German column headers like "Vorname", "Nachname")
- Export full alumni list to CSV
- Search and filter alumni
- Edit alumni records (email changes propagate to linked registration and portal records)
- Cross-conference lookup: check if an email exists in other conferences

**Automatic alumni creation:** When a registration is paid, an alumni record is automatically created from the billing profile. No admin action required.

**Alumni discount in portal registration:** If a discount code with code "ALUMNI" exists and is active, it auto-applies when returning attendees register through the authenticated portal. If no ALUMNI code exists, a warning modal shows their attendance history.

**Constraints:**
- Email must be unique per conference (case-insensitive)
- Deleting alumni does NOT delete linked registrations
- Only paid registrations create alumni records automatically

**Dependencies:** None.

**Consequences:** Alumni records enable cross-conference attendee tracking and automatic discount application during portal registration.

---

## 4. Partnerships

### 4.1 Sponsors

Manage conference sponsors and their contracts. **Requires: `sponsors` module.**

**What you can do:**
- Add sponsors with company details, logo, contact information
- Assign sponsor packages (defined in Settings 1.4.2)
- Create and manage sponsor contracts (rich text editor, DOCX upload, version history)
- Send contracts via email with PDF/DOCX attachment
- Generate invoices directly from sponsor records
- Upload sponsor logos
- Control sponsor visibility on portal

**Contract workflow:** Draft → Sent → Signed

**Email template used:** `sponsor_contract_send` — with placeholders: `[Recipient Name]`, `[Package Name]`, `[Custom Message]`, `[Contract Content]`

**Dependencies:** Sponsor Packages must be defined in Settings (1.4.2).

**Consequences:**
- Sponsor data available for Discount Code bulk generation (Booking Options 5.1)
- Sponsor logos may appear on portal pages
- Sponsor invoices appear in the Invoices tab (5.3)

---

### 4.2 Service Providers

Manage external service providers for the conference (caterers, AV companies, decorators, etc.). **Requires: `service_providers` module.**

**What you can do:**
- Add providers with company details, contacts, and service descriptions
- Upload attachments (contracts, quotes)
- Link providers to specific locations
- Track provider status and notes

**Dependencies:** Locations (1.6) for venue-level provider linking (optional).

**Consequences:** Service provider data is organizational — used for internal tracking, not displayed on the portal.

---

## 5. Registration & Finance

### 5.1 Booking Options

Configure the pricing structure for conference registration through a matrix of periods and options.

**Key concepts:**
- **Booking Periods** (columns): Time windows with specific pricing (e.g., "Early Bird: Jan-Feb", "Regular: Mar-Apr")
- **Booking Options** (rows): What attendees purchase (e.g., "Tutorial Day", "Day 1", "Full Conference")
- **Pricing Matrix**: Each cell = price for that option during that period. Empty cell = not available.
- **Packages**: Bundle multiple options into one purchasable item (price = sum of component prices)
- **Discount Codes**: Percentage or fixed-amount reductions, individually created or bulk-generated

**Auto-sync with program days:** When you first open the Booking tab, the system automatically creates booking options from your program days and links them. Option names sync bidirectionally with program day names.

**Booking Periods:**
- Each period has a name, start/end dates, and optional currency override
- Recommended sequence: Blind Bird → Early Bird → Regular → Late/On-Site
- Period dates may overlap (intentional flexibility)

**Booking Options:**
- Each option has a name, optional description, attendance type (in_person, virtual, hybrid_onsite, hybrid_online), and optional program day link
- Attendance type affects VAT calculation on invoices

**Packages:**
- Bundle multiple options; price auto-calculates as sum of component prices per period
- Changing option prices instantly recalculates package prices
- Cannot delete packages with active registrations

**Discount Codes:**
- Types: percentage or fixed amount
- Scoping: apply to all options/periods, or restrict to specific ones
- Usage limits: max uses (0 = unlimited), valid date range
- Combinability: non-combinable (default, only one per registration) or combinable (stack multiple)
- Bulk generation: create codes for Sponsors, Speakers, Committee, or custom lists using template variables (`[ConferenceSlug]`, `[FirstName]`, `[LastName]`, `[Counter]`, etc.)

**Dependencies:** Currency & Tax (Settings 1.4.5) should be configured first.

**Constraints:**
- Cannot delete options with existing registrations
- Period names must be unique per conference
- Option names must be unique per conference

**Consequences:**
- Options and prices appear in the registration form (public portal and admin)
- Selected options generate invoice line items
- Day-linked options determine which bookable sessions appear during registration
- Discount codes reduce registration prices and increment usage count on confirmation

**Interdependencies:**
- Sessions (2.3): Separately bookable sessions appear during registration if linked to an option's program day
- Registration (5.2): Uses options and active period to determine pricing
- Invoices (5.3): Line items derived from selected booking options
- Alumni (3.6): ALUMNI discount code auto-applies for returning attendees

---

### 5.2 Registration

Manage conference registrations. **Requires: `registration` module.**

**What you can do:**
- Create registrations (single attendee or group with shared billing)
- View registration list with filters (status, booking option, date range, search)
- Edit registration details: billing information, attendees, booking options, session selections
- Add or remove additional items (add-on booking options)
- Replace or cancel registrations
- Export registration data to CSV
- View registration lifecycle and status changes

**Registration modes:**
- **Single Registration**: One attendee with billing info
- **Group Registration**: Multiple attendees sharing one billing profile

**Registration statuses:** Pending Invoice → Invoiced → Paid → (optionally) Cancelled

**Session selection:** If a booking option is linked to a program day with bookable sessions, registrants choose sessions during registration. Parallel sessions in the same time slot require choosing one; non-parallel sessions allow independent choices.

**Email template used:** `registration_confirmation`

**Dependencies:**
- Booking Options (5.1) must have active periods with prices
- Registration Portal (Settings 1.4.2) must be enabled for public registration
- Policies (Settings 1.4.2) must be defined if attendee acceptance is required

**Consequences:**
- Confirmed registrations generate invoices automatically
- Paid registrations create Attendee records (3.4) and Alumni records (3.6)
- Registration answers populate Analytics > Registration Questions (7.1.1)
- Cancelling a registration (via invoice cancellation) revokes conference access but preserves user accounts

**Interdependencies:**
- Invoices (5.3): Each registration links to an invoice
- Attendees (3.4): Populated from paid registrations
- Alumni (3.6): Auto-created from paid registrations
- Booking Options (5.1): Determines pricing and available options

---

### 5.3 Invoices

Create, send, and manage invoices. **Requires: `invoices` module.**

**Invoice types:**
- **Bank Transfer**: Traditional invoice with bank details; manual payment reconciliation
- **Credit Card**: Stripe-integrated with automatic payment link and webhook-based status updates
- **Credit Note**: Negative invoice for cancellations; auto-generated, immutable

**Invoice statuses:** Draft → Sent → Paid (or: Sent → Overdue → Paid/Cancelled)

**Status rules:**
- **Draft**: Fully editable, deletable, no invoice number yet
- **Sent**: Read-only, invoice number assigned, email sent with PDF
- **Overdue**: Auto-set when due date passes (sent invoices transition automatically)
- **Paid**: Payment received (manual mark or Stripe webhook)
- **Cancelled**: Voided with credit note created; immutable

**What you can do:**
- Create invoices with recipient details, line items, due date
- Search recipients from sponsors, speakers, registrations
- Send invoices (generates number, creates payment link for credit card, emails PDF)
- **Replace Invoice**: Correct billing info on sent invoices (original cancelled with credit note, new invoice created with corrected data — all registrations stay linked)
- **Cancel Invoice**: Void with credit note; optionally cancel linked registrations and refund Stripe payments
- **Mark as Paid**: For bank transfer invoices with payment date and comment
- **Convert to Credit Card**: Change bank transfer invoice to credit card (creates Stripe payment link)
- **Reopen**: Move paid/cancelled invoice back to sent status
- Resend invoices (same number, logged as resend)
- View audit trail (Events tab: creation, sends, payments, refunds, status changes)

**VAT handling:**
- VAT automatically calculated based on: conference country, customer country, attendance type, B2B vs B2C
- **VAT number required** (red warning): Virtual/hybrid conferences with EU B2B customers (reverse charge)
- **VAT number recommended** (yellow warning): In-person conferences with EU B2B customers
- VAT number validated via 3-stage cascade: format check → regex → VIES EU registry

**Email templates used:**
- `invoice_sent` — when sending an invoice
- `invoice_cancelled` — when cancelling with credit note
- `invoice_replaced` — when replacing an invoice

**Stripe integration:**
- Credit card invoices include "Pay Online" button linking to Stripe checkout
- Webhooks auto-update status to "paid" on successful payment
- Manual sync available if webhooks fail

**ZUGFeRD/Factur-X:**
- When enabled (Settings 1.4.5), invoice PDFs include embedded XML for automated processing
- Validation endpoint checks compliance before sending

**Dependencies:**
- Company Data, Bank Accounts, Invoice Templates (Settings 1.4.5) should be configured
- Stripe Setup (Settings 1.4.5) required for credit card invoices
- Currency & Tax (Settings 1.4.5) for VAT rules

**Constraints:**
- Sent invoices cannot be edited (use Replace or Cancel + recreate)
- Invoice numbers are sequential and immutable
- Credit notes cannot be deleted
- At least one billing field must differ for Replace Invoice to work

**Consequences:**
- Invoice status drives Payment Reminders (5.4) — only sent/overdue invoices get reminders
- Paid invoices mark registrations as paid, creating Attendee and Alumni records
- Cancelled invoices with registrations can revoke conference access
- All actions logged in audit trail (Events tab)

---

### 5.4 Payment Reminders

View and manage automated payment reminders for overdue invoices. **Requires: `invoices` module.**

**How it works:**
1. Daily system check scans all conferences for overdue invoices
2. **1st Reminder** (default: 2 days after due date): Friendly payment reminder email
3. **2nd Reminder** (default: 17 days after due date): Firmer reminder email
4. After 2nd reminder: Admin notification email (if enabled)

**What you can do:**
- View reminder history with stats bar (pending, sent, failed counts)
- Filter by status (pending/sent/failed), reminder number (1st/2nd), search by invoice number or recipient
- Resend failed or previously sent reminders manually
- Click any reminder row to navigate to the linked invoice

**Email templates used:** `payment_reminder_first`, `payment_reminder_second`

**Constraints:**
- Maximum one 1st reminder and one 2nd reminder per invoice
- Only active invoices (sent or overdue status) receive reminders
- Credit notes, paid, and cancelled invoices are excluded
- Invoices without recipient email are skipped
- Invoices auto-transition from "sent" to "overdue" when past due date

**Dependencies:** Payment Reminder settings (Settings 1.4.5) must be enabled. Email templates should be configured.

**Consequences:** All reminder activity logged in the invoice audit trail (Events tab in Invoices 5.3).

**Configuration:** Settings > Finance > Payment Reminders (1.4.5) controls timing and admin notification.

---

### 5.5 Cost Management

Manage conference budgets and speaker expenses from a single hub. The Cost Management section contains three areas: **Budgets**, **Speaker Expenses** (admin view), and the **Speaker Expenses portal** (speaker view).

---

#### 5.5.1 Budget Planning & Tracking

Create and track conference budgets with detailed line items.

**How it works:**
1. Navigate to **Cost Management > Budgets**
2. Create a budget (starts in **draft** status)
3. Add line items with title, planned amount, actual amount, category, and vendor
4. Activate the budget when ready — only one budget can be active at a time (activating a new budget automatically archives the previous one)

**Budget statuses:** `draft` | `active` | `archived`

**What you can do:**
- Create budgets with descriptive titles and line items
- Assign each line item a **category** and **vendor** for organized tracking
- Track planned vs. actual spending per line item
- View summary cards: **Total Budget**, **Spent**, **Remaining**, and **% Used**
- Create and manage **categories** for organizing line items
- **Revise a budget** — creates a new version (deep copy of all line items) while archiving the current version, preserving a full revision history

**Color coding for budget utilization:**
- **Green** — under 75% spent (on track)
- **Amber** — 75%–90% spent (approaching limit)
- **Red** — over 90% spent (at or over budget)

**Constraints:**
- Only one budget can be active per conference at any time
- Archiving is automatic when a new budget is activated or a revision is created
- Draft budgets do not appear in summary calculations until activated

---

#### 5.5.2 Speaker Expense Settings

Configure speaker expenses in **Settings > Finance > Speaker Expenses**.

**Settings:**
- **Enable/Disable toggle** — When enabled, accepted speakers see the "My Expenses" tab in the portal. When disabled, the tab is hidden.
- **Expense Tiers** — Define named budget tiers (e.g., "Speaker 700 EUR", "Keynote 1500 EUR") that can be assigned to individual speakers to track their budget.

**How expense tiers work:**
1. Create tiers in settings with a name, amount, and currency
2. In the Speaker Expenses tab, expand a speaker to see the tier/budget bar
3. Use the tier dropdown to assign a tier — this automatically sets the speaker's allowance to the tier's amount
4. The budget bar shows: **Budget** (from tier), **Approved** (total approved expenses), **Remaining** (budget minus approved)

---

#### 5.5.3 Speaker Expense Management (Admin)

Review, approve, and track speaker expense claims. Located under **Cost Management > Speaker Expenses**.

**Three views available:**
1. **Expenses list** — All submitted expense claims grouped by speaker, with tier/budget info per speaker
2. **Allowances** — Per-speaker allowance summary with tier assignment, claimed, approved, and remaining amounts
3. **Allowance Defaults** — Configure maximum expense amounts per session type

**Expense workflow:** `draft` → `submitted` → `approved` / `rejected` → `paid`

**What you can do:**
- View all expense claims grouped by speaker with search and filtering by status
- **Speaker summary header** shows the approved total (approved + paid expenses) next to each speaker name, matching the "Approved" amount in the tier/budget bar
- **Send message to speaker** — Click the envelope icon next to a speaker's name to open a compose modal pre-filled with the speaker as recipient and "Regarding your speaker expenses" as subject. Uses the existing messaging system (email notification sent if configured).
- **Assign expense tiers** to speakers directly from the expenses view (expand a speaker to see the tier dropdown and budget summary)
- **Add expenses on behalf of a speaker** — Use the "Add Expense" button under a speaker's section to record costs the organizer pays directly (e.g., hotel rooms, flights). Select a category, enter the amount, date, and description.
- **Approve** submitted expenses to authorize payment
- **Reject** expenses with a reason (visible to the speaker)
- **Mark as paid** once payment is processed
- View a stats bar showing counts per status (draft, submitted, approved, rejected, paid)
- Set **Allowance Defaults** per session type (e.g., Keynote: 2,000 EUR, Workshop: 1,000 EUR) to control maximum claimable amounts
- Review **Speaker Allowances** to see each speaker's tier, total allowance, amount claimed, amount approved, and remaining balance

**Constraints:**
- Speakers can only claim up to their allowance limit
- Rejected expenses include a reason that the speaker can view in the portal
- Only submitted expenses can be approved or rejected
- Only approved expenses can be marked as paid
- Assigning a tier overrides the speaker's allowance amount; manual edits clear the tier assignment

---

#### 5.5.4 Speaker Expenses (Portal — Speaker View)

Speakers access their own expenses through the portal sidebar under **Registration > My Expenses**.

**What speakers see:**
- **Allowance summary cards** showing maximum amount, claimed, and remaining per conference
- **Progress bars** with color coding (green/amber/red matching the budget utilization thresholds)
- A list of their own expense claims with current status

**What speakers can do:**
- **Create expenses** with title, date, amount, currency, and description
- **Upload receipts** via the attachment system
- **Submit** draft expenses for admin review
- **Delete** draft expenses (submitted or later-stage expenses cannot be deleted)
- **View rejection reasons** on any rejected expenses

**Multi-currency support:** Speakers can submit expenses in any supported currency.

**Constraints:**
- Only draft expenses can be edited or deleted
- Submitted expenses are locked and await admin action
- The allowance remaining reflects approved amounts against the configured maximum

---

## 6. Communications

### 6.1 Messages

In-app messaging system for conference communications.

**What you can do:**
- Compose and send messages to individuals or groups
- Use message templates (from Settings 1.4.4)
- Bulk send to recipient lists (from Settings 1.4.4)
- Attach files to messages
- Filter messages by status (read/unread), date, sender
- Archive, flag, or export messages
- Messages can optionally trigger email notifications

**Dependencies:** Recipient Lists (Settings 1.4.4) for bulk messaging. Message Templates (Settings 1.4.4) for reusable content.

**Consequences:** Recipients receive in-app notifications. If email notifications are enabled, recipients also get email alerts.

---

### 6.2 News

Publish news articles and announcements. **Requires: `news` module.**

**What you can do:**
- Create articles with title, rich-text content, and optional attachments
- Save as draft or publish immediately
- Distribute published articles via email to recipient lists
- View articles on the public portal
- Edit or unpublish articles

**Email template used:** `news_distribution`

**Dependencies:** Recipient Lists (Settings 1.4.4) for email distribution.

**Consequences:** Published articles appear on the applicant/attendee portal. Email distribution sends the article content to selected recipient groups.

---

## 7. Insights

### 7.1 Analytics

View conference data analytics and reports. **Requires: `analytics` module.**

#### 7.1.1 Registration Questions

View aggregated responses to custom registration questions. Each question is displayed as a card with:
- **Dropdown/Radio questions** — Horizontal bar chart showing each answer option label, a colored bar proportional to the percentage, and the count with percentage (e.g., "12 (60%)"). Labels take 40% of the width for readability.
- **Text questions** — Expandable list of individual text answers with the respondent name.

**Dependencies:** Registration Questions must be configured in Settings. Registrations with answers must exist.

**Consequences:** Read-only analytics view — does not modify any data.

#### 7.1.2 Conference Statistics

*Coming soon.* This sub-tab will provide statistics and insights across conference data (registrations, revenue, attendance patterns).

---

## Appendix

### Glossary

| Term | Definition |
|------|-----------|
| **Booking Option** | A purchasable registration item (e.g., "Day 1 Pass", "Tutorial") |
| **Booking Period** | A time window with specific pricing (e.g., "Early Bird") |
| **Booking Package** | A bundle of multiple booking options at a combined price |
| **CFP** | Call for Papers — the submission and review process for academic/technical papers |
| **Credit Note** | A negative invoice issued when cancelling a sent invoice |
| **Discount Code** | A code that applies a percentage or fixed reduction to registration pricing |
| **Module** | A feature set that can be enabled/disabled per tenant (e.g., cfp, invoices, volunteers) |
| **Portal** | The public-facing website where attendees register and applicants submit papers |
| **RLS** | Row-Level Security — database-level tenant data isolation |
| **Reverse Charge** | EU VAT mechanism where the buyer (not seller) accounts for VAT on cross-border B2B services |
| **Screen Overlay** | A full-screen announcement shown to portal users on login |
| **Tenant** | An organization using SaaSConf (each tenant's data is fully isolated) |
| **VIES** | EU VAT Information Exchange System — online service for validating EU VAT numbers |
| **ZUGFeRD** | German/EU standard for hybrid invoices (PDF with embedded XML for automated processing) |

### Getting Help

- **Technical Support**: support@saasconf.com
- **VAT Questions**: Consult your tax advisor — SaaSConf provides calculation tools but not tax advice
- **Feature Requests**: Submit via platform feedback form
