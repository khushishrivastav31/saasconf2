# portal-attendee-profile Specification

## Purpose

Conference attendees who register via the public portal have a `PortalUser`
account but no `CFPApplicant` record. The current `ProfilePage` reads and
writes exclusively through the `CFPApplicant` model (`/portal/me`), so
attendees see a blank page and cannot edit their profile.

This spec covers read + edit access to the attendee's own profile data stored
on `PortalUser`.

---

## Requirements

### Requirement: Attendee can view their profile

A logged-in conference attendee SHALL be able to navigate to the portal
profile page and see their name, email, phone, pronouns, title, company,
address, and bio.

#### Scenario: Attendee opens profile page
- GIVEN a portal user who is a conference attendee (no CFP applicant)
- WHEN they navigate to `/:tenantSlug/portal/user/profile`
- THEN their name, email, and other profile fields are displayed
- AND no error or blank page is shown

---

### Requirement: Attendee can edit their profile

A logged-in conference attendee SHALL be able to update their profile fields
via the portal profile page. Changes SHALL be persisted to the `portal_users`
table.

#### Scenario: Attendee updates their name
- GIVEN the attendee is on the profile page
- WHEN they change their first or last name and save
- THEN the change is persisted to `PortalUser`
- AND subsequent page loads show the updated name

---

### Requirement: Profile endpoint accepts all standard fields

`PATCH /portal/unified/me` SHALL accept the full set of profile fields
(first_name, last_name, phone, pronouns, title, company, bio,
address_line_1, address_line_2, city, postal_code, country) in addition to
the existing `theme_preference`.

#### Scenario: Attendee updates phone number
- GIVEN the attendee submits a PATCH with a new phone number
- WHEN the backend processes the request
- THEN `PortalUser.phone_encrypted` and `PortalUser.phone_hash` are updated
- AND the response reflects the new phone number

---

### Requirement: CFP applicant profile flow is unchanged

The existing `/portal/me` (CFP applicant) update flow SHALL continue to work
for speakers and committee members. `ProfilePage` SHALL use the CFP flow when
an `applicant` record exists, and the portal-user flow only when it does not.
