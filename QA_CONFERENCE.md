# Conference Module — Manual QA Checklist

Fill in each scenario as you test it:
- `OK` — works as described in the handbook
- `FAIL: <brief note>` — did not work, describe what happened

---

## 0. Prerequisites

| # | Scenario | Result |
|---|----------|--------|
| 0.1 | Log in as super admin | OK |
| 0.2 | Create a tenant | OK |
| 0.3 | Create a conference inside the tenant | OK |
| 0.4 | Conference appears in the sidebar | FAIL: What sidebar? it appears under http://localhost:3000/modules/conferences |

Comments.
Since we have enable the Conference, I'm in the admin, I shouldn't be able to see the Training module right?
and when I click in the module Training, I got this:


Welcome
Welcome back, Brandon Valle

Getting Started
Select a conference from the sidebar to manage it, or create a new one from the Conferences page. Each conference gives you access to:

•
Call for Papers — manage submissions, reviews, and decisions
•
Registration — attendee sign-up, tickets, and payments
•
Program — sessions, speakers, and schedules
•
Sponsors — contracts, logos, and invoicing
•
Volunteers — recruitment and task assignment
•
Analytics — reports and insights across your conference
--
Looks like it got redirected, the expectation is not to show the Training option in the sidebar.


---

## 0.5 Roles & Access Control

> There are **two separate role concepts** in this platform — easy to confuse:
>
> **A) Module-scoped tenant roles** — set when inviting a user to the tenant (Team page). Controls which modules they can access:
> - `Conferences Admin` — full access to all conferences in this tenant
> - `Conferences Member` — read-only access to conferences
> - `Trainings Admin / Member` — same for training module
> - `Accounting Admin / Member` — finance-only access
> - `Super User` (toggle) — grants admin access to all modules at once
>
> **B) Conference user roles** — defined in Settings → People & Roles → User Roles (section 1.4.1). These are labels for categorizing speakers/participants within a conference (e.g. Keynote, Tutorial). They do NOT control login access.

### UX Finding — Role labels are confusing

The word "role" is used in 4 different places with completely different meanings. A first-time user will not understand the distinction. Below is the current state and suggested improvements:

**Module-scoped roles (Team invite form):**

| Location | Current label | Suggested label | Why |
|---|---|---|---|
| Team invite — toggle | `Super User` | `Full Access` or `Platform Manager` | "Super User" sounds technical; "Full Access" is self-explanatory |
| Team invite — level | `Admin` | `Manager` or `Organizer` | "Admin" is generic; "Organizer" conveys responsibility |
| Team invite — level | `Member` | `Viewer` or `Staff` | "Member" implies group belonging, not a permission level |

So the invite form would read: **Conferences → Organizer / Viewer** — immediately clear what the person can do.

Note. Trying to create a new company-tenant, and using the same "slug" like another one that I know, and when I clicked on save button, nothing was done, neither success nor failure toast message, so I think we need again the toast message to show the error message.
And no matter if I change the slug, looks like the error is other thing. Looks like it's the email domain, nop, nothing.

**Settings → People & Roles:**

| Location | Current label | Suggested label | Why |
|---|---|---|---|
| Settings sub-tab | `User Roles` | `Speaker Roles` or `Participant Roles` | These are speaker/session category labels, not access control — the word "User" implies login permissions which is wrong |

**Conference tab → Team:**

| Location | Current label | Suggested label | Why |
|---|---|---|---|
| Team tab badge | `Conference Manager` | `Lead Organizer` or `Conference Chair` | Conflicts with the access-control use of "Manager" suggested above — needs a distinct name |

### 0.5.1 Module-scoped roles (Team invite)
| # | Scenario | Result |
|---|----------|--------|
| 0.5.1.1 | Invite a user as `Conferences Admin` — they can edit conference settings | OK |
| 0.5.1.2 | Invite a user as `Conferences Member` — they can view but not edit | FAIL: They can edit|
| 0.5.1.3 | User with only `Conferences` role does NOT see the Training module in the sidebar | OK, the user doesn't see but the module is in the left panel |
| 0.5.1.4 | User with only `Trainings` role does NOT see the Conferences module | Not tested yet |
| 0.5.1.5 | `Super User` toggle grants admin access to all modules | OK or FAIL: the admin tenant can't assign this. it should not be shown in the creation. |
| 0.5.1.6 | Invite form only shows role options for modules the tenant has enabled (e.g. no Trainings option if tenant has only Conferences) | FAIL: it shows everything. |
| 0.5.1.7 | A `Conferences Member` cannot access conference Settings tab | FAIL: the user as role conference member can edit everything in the conference Settings tab. |
| 0.5.1.8 | A user cannot modify their own roles | FAIL: it can modify roles. |

### 0.5.2 Conference user roles (speaker/participant labels)
| # | Scenario | Result |
|---|----------|--------|
| 0.5.2.1 | Custom user role created in Settings 1.4.1.1 appears as an option when assigning a speaker to a session | Not able to test, because creating a paper was not possible since the speaker must be created. |
| 0.5.2.2 | Deleting a user role that is assigned to a session type sets that field to null (no crash) | NOT AVAILABLE TO TEST |
| 0.5.2.3 | System roles (Keynote, Tutorial, etc.) cannot be deleted | OK |

---

## 1. Event Setup

### 1.1 Details
| # | Scenario | Result |
|---|----------|--------|
| 1.1.1 | Edit conference name, dates, city, country | FAIL: looks like the dates are not showing in the right way, for example I set the start date: Nov 20,2026 to Nov 23, 2026, but I got in the portal: Nov 19, 2016 – Nov 22, 2026, which is wrong. The other things are working fine. |
| 1.1.2 | Set venue type (in-person / virtual / hybrid) | OK |
| 1.1.3 | Upload a conference logo | OK, but in the agiletestingdays.com, we use .svg for the logo |
| 1.1.4 | Save and confirm changes persist on reload | OK |

### 1.2 Team
| # | Scenario | Result |
|---|----------|--------|
| 1.2.1 | Invite a team member by email | OK |
| 1.2.2 | Assign conference-level role to team member | OK, but with details|
| 1.2.3 | Remove a team member | OK |

Notes.
- I added a team member by here: http://localhost:3000/modules/conferences/d67edc90-267d-4027-8b17-c758a4302a3f?tab=team, which only add the team member and to add a member by email, I need to add AGAIN the data (maybe a suggestion is to add a click or something user-friendly about that)
- As tenant admin for only conference, and adding a new team member, I'm able to give roles likes SUPER USER, Conferences (Admin, Member), Training (Admin, Member), Accounting (Admin, Member)
- Scenario, I create a team member (with credentials) and I assigned only for conferences, and assigned the role member (Conferences Member), but I see that I can see that I'm assigned as Tenant Admin.

### 1.3 Social Media
| # | Scenario | Result |
|---|----------|--------|
| 1.3.1 | Add social media links (Twitter, LinkedIn, etc.) | OK |
| 1.3.2 | Save and confirm links persist | OK |

Note, both scenarios work, however the final user did not notice on saving, maybe adding a toast telling the user that has been saved.

### 1.4 Settings

Big note, does a conference member can edit the settings for the conference?

#### 1.4.1 People & Roles
| # | Scenario | Result |
|---|----------|--------|
| 1.4.1.1 | Create a custom user role | OK -> With Edition |
| 1.4.1.2 | Six system roles (Keynote, Tutorial, Social Event, Bonus Session, Active Session, Sponsor Talk) are predefined and visible | OK and are able to edit the description and inactive|
| 1.4.1.3 | Create a volunteer task type | OK |
| 1.4.1.4 | Create a committee role | OK |

Note, I see the same regarding the toast, other than that, it's working.

#### 1.4.2 Conference Setup
| # | Scenario | Result |
|---|----------|--------|
| 1.4.2.1 | Create a location type | OK |
| 1.4.2.2 | Create a session type | OK -> Note. I was able to create, and when I tried to delete the user role for the session type, I deleted the user role and the session type got nothing, it's like it sets the null for the foreign key. |
| 1.4.2.3 | Create a sponsor package | OK |
| 1.4.2.4 | Enable public registration portal and set dates | FAIL: I enable the checkbox, and when I open this link that is offered in the same page, this is the page for settings: http://localhost:3000/modules/conferences/d67edc90-267d-4027-8b17-c758a4302a3f?tab=settings (registration portal), and when I go to this: http://localhost:3000/trendig/register/atd2026, and I got this: Something went wrong
An unexpected error occurred. Please try refreshing the page.Try again |
| 1.4.2.5 | Add a registration policy (terms attendees must accept) | Not available since the registration portal is not working.  |
| 1.4.2.6 | Add a custom registration question | Note. by adding a question there is three fields, there are only two labels, we need the Question label. Another one, that we need the Textarea. |

Notes, the logs are not good enough, maybe the logs can be improved , this is the current:
```
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
18:31:41 INFO     sqlalchemy.engine.Engine [req=a7ac6ef8-ff63-416e-b629-4025a7007380]  SELECT message_threads.conference_id, count(*) AS unread_count
FROM (SELECT message_participants.thread_id AS thread_id, message_participants.last_read_at AS last_read_at
FROM message_participants
WHERE message_participants.participant_type = $1::VARCHAR AND message_participants.participant_id = $2::UUID) AS anon_1 JOIN message_threads ON message_threads.id = anon_1.thread_id AND message_threads.tenant_id = $3::UUID AND message_threads.archived_at IS NULL AND message_threads.domain = $4::VARCHAR JOIN (SELECT messages.thread_id AS thread_id, max(messages.created_at) AS last_at
FROM messages GROUP BY messages.thread_id) AS anon_2 ON anon_2.thread_id = anon_1.thread_id
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
2026-05-05 18:31:41,060 INFO sqlalchemy.engine.Engine [cached since 1.399e+04s ago] ('user', UUID('443d0b90-3199-4f0a-84d8-70129111f36e'), UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'), 'conference')
18:31:41 INFO     sqlalchemy.engine.Engine [req=a7ac6ef8-ff63-416e-b629-4025a7007380]  [cached since 1.399e+04s ago] ('user', UUID('443d0b90-3199-4f0a-84d8-70129111f36e'), UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'), 'conference')
2026-05-05 18:31:41,064 INFO sqlalchemy.engine.Engine ROLLBACK
18:31:41 INFO     sqlalchemy.engine.Engine [req=a7ac6ef8-ff63-416e-b629-4025a7007380]  ROLLBACK
2026-05-05 18:32:11,077 INFO sqlalchemy.engine.Engine BEGIN (implicit)
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  BEGIN (implicit)
2026-05-05 18:32:11,078 INFO sqlalchemy.engine.Engine SELECT tenants.id, tenants.name, tenants.slug, tenants.is_active, tenants.settings, tenants.address, tenants.postal_code, tenants.city, tenants.country, tenants.phone, tenants.vat_number, tenants.website, tenants.logo_url, tenants.email_domain, tenants.accounting_email, tenants.resend_api_key, tenants.resend_from_email, tenants.resend_from_name, tenants.contact_persons, tenants.comments, tenants.super_user_id, tenants.created_at, tenants.updated_at
FROM tenants
WHERE tenants.id = $1::UUID
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  SELECT tenants.id, tenants.name, tenants.slug, tenants.is_active, tenants.settings, tenants.address, tenants.postal_code, tenants.city, tenants.country, tenants.phone, tenants.vat_number, tenants.website, tenants.logo_url, tenants.email_domain, tenants.accounting_email, tenants.resend_api_key, tenants.resend_from_email, tenants.resend_from_name, tenants.contact_persons, tenants.comments, tenants.super_user_id, tenants.created_at, tenants.updated_at
FROM tenants
WHERE tenants.id = $1::UUID
2026-05-05 18:32:11,078 INFO sqlalchemy.engine.Engine [cached since 1.413e+04s ago] (UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'),)
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  [cached since 1.413e+04s ago] (UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'),)
2026-05-05 18:32:11,079 INFO sqlalchemy.engine.Engine SELECT set_config('app.current_tenant_id', $1, true)
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  SELECT set_config('app.current_tenant_id', $1, true)
2026-05-05 18:32:11,080 INFO sqlalchemy.engine.Engine [cached since 1.402e+04s ago] ('2240a46f-6501-45f7-913a-3d92b994d1c1',)
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  [cached since 1.402e+04s ago] ('2240a46f-6501-45f7-913a-3d92b994d1c1',)
2026-05-05 18:32:11,080 INFO sqlalchemy.engine.Engine SELECT set_config('app.is_super_admin', $1, true)
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  SELECT set_config('app.is_super_admin', $1, true)
2026-05-05 18:32:11,080 INFO sqlalchemy.engine.Engine [cached since 1.424e+04s ago] ('false',)
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  [cached since 1.424e+04s ago] ('false',)
2026-05-05 18:32:11,083 INFO sqlalchemy.engine.Engine SELECT message_threads.conference_id, count(*) AS unread_count
FROM (SELECT message_participants.thread_id AS thread_id, message_participants.last_read_at AS last_read_at
FROM message_participants
WHERE message_participants.participant_type = $1::VARCHAR AND message_participants.participant_id = $2::UUID) AS anon_1 JOIN message_threads ON message_threads.id = anon_1.thread_id AND message_threads.tenant_id = $3::UUID AND message_threads.archived_at IS NULL AND message_threads.domain = $4::VARCHAR JOIN (SELECT messages.thread_id AS thread_id, max(messages.created_at) AS last_at
FROM messages GROUP BY messages.thread_id) AS anon_2 ON anon_2.thread_id = anon_1.thread_id
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  SELECT message_threads.conference_id, count(*) AS unread_count
FROM (SELECT message_participants.thread_id AS thread_id, message_participants.last_read_at AS last_read_at
FROM message_participants
WHERE message_participants.participant_type = $1::VARCHAR AND message_participants.participant_id = $2::UUID) AS anon_1 JOIN message_threads ON message_threads.id = anon_1.thread_id AND message_threads.tenant_id = $3::UUID AND message_threads.archived_at IS NULL AND message_threads.domain = $4::VARCHAR JOIN (SELECT messages.thread_id AS thread_id, max(messages.created_at) AS last_at
FROM messages GROUP BY messages.thread_id) AS anon_2 ON anon_2.thread_id = anon_1.thread_id
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
2026-05-05 18:32:11,083 INFO sqlalchemy.engine.Engine [cached since 1.402e+04s ago] ('user', UUID('443d0b90-3199-4f0a-84d8-70129111f36e'), UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'), 'conference')
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  [cached since 1.402e+04s ago] ('user', UUID('443d0b90-3199-4f0a-84d8-70129111f36e'), UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'), 'conference')
2026-05-05 18:32:11,085 INFO sqlalchemy.engine.Engine ROLLBACK
18:32:11 INFO     sqlalchemy.engine.Engine [req=dcb757c0-c136-486b-9e84-012a5b486b3d]  ROLLBACK
2026-05-05 18:32:41,119 INFO sqlalchemy.engine.Engine BEGIN (implicit)
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  BEGIN (implicit)
2026-05-05 18:32:41,121 INFO sqlalchemy.engine.Engine SELECT tenants.id, tenants.name, tenants.slug, tenants.is_active, tenants.settings, tenants.address, tenants.postal_code, tenants.city, tenants.country, tenants.phone, tenants.vat_number, tenants.website, tenants.logo_url, tenants.email_domain, tenants.accounting_email, tenants.resend_api_key, tenants.resend_from_email, tenants.resend_from_name, tenants.contact_persons, tenants.comments, tenants.super_user_id, tenants.created_at, tenants.updated_at
FROM tenants
WHERE tenants.id = $1::UUID
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  SELECT tenants.id, tenants.name, tenants.slug, tenants.is_active, tenants.settings, tenants.address, tenants.postal_code, tenants.city, tenants.country, tenants.phone, tenants.vat_number, tenants.website, tenants.logo_url, tenants.email_domain, tenants.accounting_email, tenants.resend_api_key, tenants.resend_from_email, tenants.resend_from_name, tenants.contact_persons, tenants.comments, tenants.super_user_id, tenants.created_at, tenants.updated_at
FROM tenants
WHERE tenants.id = $1::UUID
2026-05-05 18:32:41,122 INFO sqlalchemy.engine.Engine [cached since 1.416e+04s ago] (UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'),)
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  [cached since 1.416e+04s ago] (UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'),)
2026-05-05 18:32:41,126 INFO sqlalchemy.engine.Engine SELECT set_config('app.current_tenant_id', $1, true)
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  SELECT set_config('app.current_tenant_id', $1, true)
2026-05-05 18:32:41,126 INFO sqlalchemy.engine.Engine [cached since 1.405e+04s ago] ('2240a46f-6501-45f7-913a-3d92b994d1c1',)
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  [cached since 1.405e+04s ago] ('2240a46f-6501-45f7-913a-3d92b994d1c1',)
2026-05-05 18:32:41,127 INFO sqlalchemy.engine.Engine SELECT set_config('app.is_super_admin', $1, true)
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  SELECT set_config('app.is_super_admin', $1, true)
2026-05-05 18:32:41,127 INFO sqlalchemy.engine.Engine [cached since 1.427e+04s ago] ('false',)
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  [cached since 1.427e+04s ago] ('false',)
2026-05-05 18:32:41,130 INFO sqlalchemy.engine.Engine SELECT message_threads.conference_id, count(*) AS unread_count
FROM (SELECT message_participants.thread_id AS thread_id, message_participants.last_read_at AS last_read_at
FROM message_participants
WHERE message_participants.participant_type = $1::VARCHAR AND message_participants.participant_id = $2::UUID) AS anon_1 JOIN message_threads ON message_threads.id = anon_1.thread_id AND message_threads.tenant_id = $3::UUID AND message_threads.archived_at IS NULL AND message_threads.domain = $4::VARCHAR JOIN (SELECT messages.thread_id AS thread_id, max(messages.created_at) AS last_at
FROM messages GROUP BY messages.thread_id) AS anon_2 ON anon_2.thread_id = anon_1.thread_id
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  SELECT message_threads.conference_id, count(*) AS unread_count
FROM (SELECT message_participants.thread_id AS thread_id, message_participants.last_read_at AS last_read_at
FROM message_participants
WHERE message_participants.participant_type = $1::VARCHAR AND message_participants.participant_id = $2::UUID) AS anon_1 JOIN message_threads ON message_threads.id = anon_1.thread_id AND message_threads.tenant_id = $3::UUID AND message_threads.archived_at IS NULL AND message_threads.domain = $4::VARCHAR JOIN (SELECT messages.thread_id AS thread_id, max(messages.created_at) AS last_at
FROM messages GROUP BY messages.thread_id) AS anon_2 ON anon_2.thread_id = anon_1.thread_id
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
2026-05-05 18:32:41,131 INFO sqlalchemy.engine.Engine [cached since 1.405e+04s ago] ('user', UUID('443d0b90-3199-4f0a-84d8-70129111f36e'), UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'), 'conference')
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  [cached since 1.405e+04s ago] ('user', UUID('443d0b90-3199-4f0a-84d8-70129111f36e'), UUID('2240a46f-6501-45f7-913a-3d92b994d1c1'), 'conference')
2026-05-05 18:32:41,132 INFO sqlalchemy.engine.Engine ROLLBACK
18:32:41 INFO     sqlalchemy.engine.Engine [req=a93dabb9-a0a4-4b7f-887d-98266c33c2b8]  ROLLBACK
```

#### 1.4.3 CFP & Reviews
| # | Scenario | Result |
|---|----------|--------|
| 1.4.3.1 | Edit the paper form using the drag-and-drop field editor | OK but with some failures on the UX: String should match pattern '^[a-z][a-z0-9_]*$', for example we got that error, and we did not know where the error comes. |
| 1.4.3.2 | Add a role-specific paper form variant | OK |
| 1.4.3.3 | Define a reviewer score scale | OK |
| 1.4.3.4 | Add review criteria | OK |

#### 1.4.4 Communication
| # | Scenario | Result |
|---|----------|--------|
| 1.4.4.1 | Enable / disable conference emails | OK. I have found two things: 1. the toast for notifications  like success saving is there, and appears at right bottom place (it should be right-top) so maybe it should add in the whole system. 2. The email header/footer doesn't appear in email for the user invitation. |
| 1.4.4.2 | Edit a system email template (12 types available) | OK. Looks good, but the modal for the edition needs a padding left and right, the fields don't have that space, this is in order to have the same style in the whole platform. |
| 1.4.4.3 | Resend a verification email via Pending Verifications | No tested yet. Need speakers |
| 1.4.4.4 | Configure messaging settings | No tested yet. Need speakers |
| 1.4.4.5 | Create a message template | OK. |
| 1.4.4.6 | Create a recipient list | Need applicants, for this.   |
| 1.4.4.7 | Create a screen overlay (full-screen announcement for portal users) | OK |

#### 1.4.5 Finance
| # | Scenario | Result |
|---|----------|--------|
| 1.4.5.1 | Set default currency and EU VAT rules | OK |
| 1.4.5.2 | Configure invoice number format (prefix, sequence) | OK |
| 1.4.5.3 | Enter company data (name, address for invoice headers) | OK |
| 1.4.5.4 | Add a bank account (IBAN/BIC for bank transfer invoices) | OK |
| 1.4.5.5 | Edit an invoice template using the WYSIWYG editor | OK |
| 1.4.5.6 | Design a badge template (per role, DIN A5) | I don't know where to see this. I couldn't find it. |
| 1.4.5.7 | Configure Stripe for credit card payments | It's okay, however, I see this: `Webhook URL: http://localhost:3000/api/v1/stripe/webhook`, my question is if this is for all tenants, for all conferences?  |
| 1.4.5.8 | Configure automated payment reminders for overdue invoices | No available yet |

ZUGFeRD/Factur-X E-Invoicing -> Try to enable but I got an error, we don't know why.
Again the logs don't show the right error message:
```
2026-05-08 15:47:01,580 INFO sqlalchemy.engine.Engine [cached since 3902s ago] (UUID('e12fb802-1a42-4456-97d7-38f645b29b1a'),)
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  [cached since 3902s ago] (UUID('e12fb802-1a42-4456-97d7-38f645b29b1a'),)
2026-05-08 15:47:01,582 INFO sqlalchemy.engine.Engine SELECT set_config('app.current_tenant_id', $1, true)
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  SELECT set_config('app.current_tenant_id', $1, true)
2026-05-08 15:47:01,582 INFO sqlalchemy.engine.Engine [cached since 3902s ago] ('e12fb802-1a42-4456-97d7-38f645b29b1a',)
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  [cached since 3902s ago] ('e12fb802-1a42-4456-97d7-38f645b29b1a',)
2026-05-08 15:47:01,584 INFO sqlalchemy.engine.Engine SELECT set_config('app.is_super_admin', $1, true)
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  SELECT set_config('app.is_super_admin', $1, true)
2026-05-08 15:47:01,585 INFO sqlalchemy.engine.Engine [cached since 3902s ago] ('false',)
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  [cached since 3902s ago] ('false',)
2026-05-08 15:47:01,591 INFO sqlalchemy.engine.Engine SELECT message_threads.conference_id, count(*) AS unread_count
FROM (SELECT message_participants.thread_id AS thread_id, message_participants.last_read_at AS last_read_at
FROM message_participants
WHERE message_participants.participant_type = $1::VARCHAR AND message_participants.participant_id = $2::UUID) AS anon_1 JOIN message_threads ON message_threads.id = anon_1.thread_id AND message_threads.tenant_id = $3::UUID AND message_threads.archived_at IS NULL AND message_threads.domain = $4::VARCHAR JOIN (SELECT messages.thread_id AS thread_id, max(messages.created_at) AS last_at
FROM messages GROUP BY messages.thread_id) AS anon_2 ON anon_2.thread_id = anon_1.thread_id
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  SELECT message_threads.conference_id, count(*) AS unread_count
FROM (SELECT message_participants.thread_id AS thread_id, message_participants.last_read_at AS last_read_at
FROM message_participants
WHERE message_participants.participant_type = $1::VARCHAR AND message_participants.participant_id = $2::UUID) AS anon_1 JOIN message_threads ON message_threads.id = anon_1.thread_id AND message_threads.tenant_id = $3::UUID AND message_threads.archived_at IS NULL AND message_threads.domain = $4::VARCHAR JOIN (SELECT messages.thread_id AS thread_id, max(messages.created_at) AS last_at
FROM messages GROUP BY messages.thread_id) AS anon_2 ON anon_2.thread_id = anon_1.thread_id
WHERE anon_1.last_read_at IS NULL OR anon_1.last_read_at < anon_2.last_at GROUP BY message_threads.conference_id
2026-05-08 15:47:01,592 INFO sqlalchemy.engine.Engine [cached since 3902s ago] ('user', UUID('b3a7e2d1-35f5-4223-b699-446783b0b80e'), UUID('e12fb802-1a42-4456-97d7-38f645b29b1a'), 'conference')
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  [cached since 3902s ago] ('user', UUID('b3a7e2d1-35f5-4223-b699-446783b0b80e'), UUID('e12fb802-1a42-4456-97d7-38f645b29b1a'), 'conference')
2026-05-08 15:47:01,594 INFO sqlalchemy.engine.Engine ROLLBACK
15:47:01 INFO     sqlalchemy.engine.Engine [req=9e7f049c-1d16-4044-9096-970d15c99d3b]  ROLLBACK
```

For the whole Finance, I need to test this later in invoicing, but I know that the logic should be working.

- We don't have the Speaker Expenses in the lists.

### 1.5 Deadlines
| # | Scenario | Result |
|---|----------|--------|
| 1.5.1 | Create a deadline (e.g. CFP submission close) | OK. However the text-fields don't have the same css style like the other ones.  |
| 1.5.2 | Edit a deadline | OK |
| 1.5.3 | Delete a deadline | OK |

Notes. For this we need the tooltip for the icons (there's an icon that we don't know what it means), and the same like the other parts of the platform, the success/fail messages.

### 1.6 Locations
| # | Scenario | Result |
|---|----------|--------|
| 1.6.1 | Create a venue / room | OK, however I see that in the location list, for example, I have created `Hotel` and then I see the `main_hall` which doesn't have to be shown. |
| 1.6.2 | Edit location details | OK |
| 1.6.3 | Delete a location | OK |

Note. The same about the success/fail messages for toast is missing.

---

## 2. Content

### 2.1 Call for Papers
| # | Scenario | Result |
|---|----------|--------|
| 2.1.1 | Enable CFP and set submission window dates | OK |
| 2.1.2 | Add CFP topics | OK |
| 2.1.3 | Add a committee member and assign topics | Not available to test, did not find how to. |
| 2.1.4 | Submit a paper via the public CFP portal | Couldn't do it, since I was not able to logged into. |
| 2.1.5 | Assign a paper to a reviewer | Not available for 2.1.4 |
| 2.1.6 | Submit a review with scores | Not available for 2.1.4 |
| 2.1.7 | Accept a paper | Not available for 2.1.4 |
| 2.1.8 | Reject a paper | Not available for 2.1.4 |

On this:
http://localhost:3000/modules/conferences/6d7b93f3-e8b6-4aae-8665-33be779b5d2a?tab=cfp-applicants
I created a user but then I tried to login and nothing was able to run.

and in this:
http://localhost:3000/bjvsoft/portal/user/login?cfp=atd2026
I tried to login with two users, one created from system and other from this http://localhost:3000/bjvsoft/portal/user/register?cfp=atd2026, but it did not work.

Add a paper via admin system: I was not able to create a paper, I created a CFP for a conference but when tried to create a paper I got this error: Please select a main speaker. and the session type was empty.[fixed], because I was able to create users, and I was able to select the speakers.

### 2.2 Program
| # | Scenario | Result |
|---|----------|--------|
| 2.2.1 | Create conference days and tracks | OK |
| 2.2.2 | Add sessions to the program grid | OK |
| 2.2.3 | Assign a speaker to a session | OK |
| 2.2.4 | Publish the program | OK |
| 2.2.5 | Program is visible on the public portal | Couldn't find the public portal. |

### 2.3 Session Types
| # | Scenario | Result |
|---|----------|--------|
| 2.3.1 | Create a session type (e.g. Talk, Workshop) | |
| 2.3.2 | Set max attendees on a session type | |

NOTE. Check that this is not in the program, we need to check that again.
---

## 3. People

### 3.1 Program Committee
| # | Scenario | Result |
|---|----------|--------|
| 3.1.1 | View committee member list | Nothing to see. |
| 3.1.2 | Add / remove a committee member | FAIL: Trying creating a program committe, we get this error: `MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here. Was IO attempted in an unexpected place? (Background on this error at: https://sqlalche.me/e/20/xd2s)` |

### 3.2 Speakers
| # | Scenario | Result |
|---|----------|--------|
| 3.2.1 | Speaker auto-appears after paper is accepted | OK |
| 3.2.2 | Edit speaker profile | I was not able to edit the speaker profile. |

### 3.3 CFP Portal Users
| # | Scenario | Result |
|---|----------|--------|
| 3.3.1 | Register a new user via CFP portal | OK, however I was not able to login.  |
| 3.3.2 | View user profile in admin (unified layout) | OK |
| 3.3.3 | User address fields save correctly | Tried to update the address in the user/speaker, the address was not saved.  |

### 3.4 Attendees
| # | Scenario | Result |
|---|----------|--------|
| 3.4.1 | Attendee appears after completing registration | |
| 3.4.2 | View attendee details | |

Since, the registration is not available, I was not able to validate this.
Then in this http://localhost:3000/modules/conferences/6d7b93f3-e8b6-4aae-8665-33be779b5d2a?tab=attendees, the fields:
- Searching
- Status
- Booking options
Those fields don't have the same field style

After attendees -> we have the badge design, we need to add in the handbook.

### 3.5 Volunteers
| # | Scenario | Result |
|---|----------|--------|
| 3.5.1 | Create a volunteer task and assign to a user | Note, the volunteer is not available to be created, it's assigned by selecting existing users (for the conference.) |
| 3.5.2 | Assign a volunteer to a role | Maybe it's what is the 3.5.1 note. |
| 3.5.3 | View volunteer schedule | OK. Nice. |

### 3.6 Alumni
| # | Scenario | Result |
|---|----------|--------|
| 3.6.1 | View alumni list (speakers from past conferences) | Not available from the past conferences. |

---

## 4. Partnerships

### 4.1 Sponsors
| # | Scenario | Result |
|---|----------|--------|
| 4.1.1 | Create a sponsor tier (e.g. Gold, Silver) | OK |
| 4.1.2 | Add a sponsor and assign to a tier | Doesn't understand how to assing to a tier. |
| 4.1.3 | Upload sponsor logo | OK |
| 4.1.4 | Create a sponsor package | FAIL: this is in the ssettings |
| 4.1.5 | Generate a sponsor invoice | I was able to generate in the invoice section, and when I Tried to send, I got this error: Set Accounting Email on My Company before sending invoices or credit notes. NOTE. the invoice generator doesn't have the percentage discount which is required. |

### 4.2 Service Providers
| # | Scenario | Result |
|---|----------|--------|
| 4.2.1 | Add a service provider | OK |
| 4.2.2 | Edit and delete a service provider | OK. Good point in the alert when it's about to delete the service provider. |

---

## 5. Registration & Finance

### 5.1 Booking Options
| # | Scenario | Result |
|---|----------|--------|
| 5.1.1 | Create a booking option with price and dates | OK |
| 5.1.2 | Apply a discount code to a booking option | OK |
| 5.1.3 | Set attendance type (in-person / virtual) | OK |

### 5.2 Registration
| # | Scenario | Result |
|---|----------|--------|
| 5.2.1 | Complete a registration via the public portal | Not available, I tried to create an account it did not worked, and I check that the invitation (email) from teams section was sent succesfully but when I tried to create an account via: http://localhost:3000/bjvsoft/portal/user/register?cfp=atd2026, I haven't received anything.   |
| 5.2.2 | Registration appears in admin panel | can't because of 5.2.1 |
| 5.2.3 | Replace a registration (attendee swap) | can't because of 5.2.1 |

Notes. I'm able to register here: http://localhost:3000/bjvsoft/portal/user/register, and since we are in develop mode, the user is active, and when I tried to login with the same credentials I got this: Invalid email or password

### 5.3 Invoices
| # | Scenario | Result |
|---|----------|--------|
| 5.3.1 | Invoice is auto-generated after registration | can't because of 5.2.1 |
| 5.3.2 | Send invoice to attendee | can't because of 5.2.1 |
| 5.3.3 | Mark invoice as paid | can't because: Set Accounting Email on My Company before sending invoices or credit notes. |
| 5.3.4 | Cancel invoice and generate credit note | cant' because 5.3.4 |
| 5.3.5 | Replace invoice (billing correction) | cant' because 5.3.4 |

### 5.4 Payment Reminders
| # | Scenario | Result |
|---|----------|--------|
| 5.4.1 | Send a manual payment reminder | Can't test it due to: No payment reminders yet
Reminders are automatically sent for overdue invoices based on your Settings > Payment Reminders configuration. 1st: 2 days, 2nd: 17 days after due date.|
| 5.4.2 | Configure automated reminders | can't do it due to 5.4.1 |

### 5.5 Cost Management
| # | Scenario | Result |
|---|----------|--------|
| 5.5.1 | Create a budget | Budget Planning: OK |
| 5.5.2 | Add a speaker expense / allowance | Can't test it because there's no any speaker here. |

---

## 6. Communications

### 6.1 Messages
| # | Scenario | Result |
|---|----------|--------|
| 6.1.1 | Send a message to a recipient list | FAIL: I did not recieve any email in the mailhog |
| 6.1.2 | Reply to a message thread | can't test it |
| 6.1.3 | Use an email template for bulk send | OK, but the mailhog did not receive anything |
| 6.1.4 | Archive a message thread | can't test it |

### 6.2 News
In the list, the icon eye should have tool tip, in order to know which function has.

| # | Scenario | Result |
|---|----------|--------|
| 6.2.1 | Create and publish a news article | Ok to create and publish but I don't know how to see the new in the portail. I was able to see the new in the email, and this what we have, the HTML is printed over there. :
Email Header bjvSoft

Hi Blanca,

You have received a message regarding Agile Testing Days from Brandon VAlle:

<p>article 1</p>
This message was sent via email. Please reply directly to this email if needed.

Email Footer bjvSoft

|
| 6.2.2 | Article is visible on the public portal | Can't see in the portal. |
| 6.2.3 | Unpublish / delete an article | Don't know if the unpublishing works. The deletion works.  |

---

## 7. Insights

### 7.1 Analytics
| # | Scenario | Result |
|---|----------|--------|
| 7.1.1 | View registration question answers breakdown | Able to see |
| 7.1.2 | View conference statistics (attendance, sessions) | Able to see |
| 7.1.3 | View revenue tracking dashboard | Able to see |
| 7.1.4 | Export financial report | OK. |

---

## Notes

Use this section for anything that needs follow-up or further investigation:

-
