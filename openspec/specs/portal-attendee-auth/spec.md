# portal-attendee-auth Specification

## Purpose

Manages the full authentication lifecycle for conference attendees who register
through the public registration portal. Covers account creation at registration
time, first-time password setup via welcome email, and subsequent portal login.

Attendees are distinct from admin users: they authenticate against `portal_users`,
not `users`. This capability ensures every step of the attendee journey lands in
the correct table and uses the correct UI surface.

---

## Requirements

### Requirement: Attendee account lives in portal_users

When a conference registration is completed through the public portal, the system
SHALL create a `PortalUser` record (not a `User` / admin record) for each attendee
email address.

#### Scenario: New attendee registers via portal
- GIVEN a conference with `public_registration_portal.enabled = true`
- WHEN a visitor submits the registration form with attendee email `jane@example.com`
- THEN a `PortalUser` row is inserted for `jane@example.com` linked to the tenant
- AND no `User` (admin) row is created for `jane@example.com`

#### Scenario: Existing portal user registers again
- GIVEN `jane@example.com` already has a `PortalUser` row
- WHEN she registers for a second conference on the same tenant
- THEN no duplicate `PortalUser` row is created
- AND a fresh setup token is NOT re-sent (she already has a password)

---

### Requirement: Setup token committed before session close

The `PortalUser` and its associated setup token SHALL be committed to the database
within the same transaction as the rest of the registration, before the ASGI session
closes.

#### Scenario: Token survives request session lifecycle
- GIVEN a portal registration request is processed
- WHEN FastAPI closes the dependency-injected `AsyncSession` at request end
- THEN the `PortalUser` row and setup token row are already committed
- AND a fresh independent DB session can retrieve both rows

---

### Requirement: Welcome email links to portal setup-password page

The welcome email sent after registration SHALL contain a URL that routes the
attendee to the conference portal's set-password page, NOT the admin reset-password
page.

#### Scenario: Attendee clicks welcome email link
- GIVEN the attendee received a welcome email with a setup link
- WHEN she clicks the link
- THEN she lands on `/:tenantSlug/portal/set-password?token=<token>`
- AND the page is branded as "Set your password" (first-time setup, not "reset")
- AND no admin navigation is visible

---

### Requirement: Setup token valid for 7 days

The initial password-setup token SHALL have a 7-day validity window so that
attendees who miss the welcome email have reasonable time to set their password.

#### Scenario: Attendee sets password within 7 days
- GIVEN a setup token was issued at registration time
- WHEN the attendee submits the set-password form within 7 days
- THEN the password is accepted and the token is marked used

#### Scenario: Attendee attempts setup after 7 days
- GIVEN a setup token was issued at registration time
- WHEN the attendee submits the set-password form after 7 days
- THEN the system returns a 400 / token-expired error
- AND the attendee is shown a "Request a new link" option

---

### Requirement: Portal login works after password setup

After completing password setup, the attendee SHALL be able to log in via the
conference portal login page (`/:tenantSlug/portal/user/login`) using her email
and chosen password.

#### Scenario: Attendee logs in after setup
- GIVEN the attendee completed the set-password flow
- WHEN she submits the portal login form
- THEN the system authenticates against `portal_users`
- AND returns a portal access token
- AND the attendee lands on the portal dashboard

---

### Requirement: "Go to login" navigates to portal login

After password setup completes, the confirmation page SHALL show a "Go to login"
link that points to the **portal** login (`/:tenantSlug/portal/user/login`), not
the admin login (`/login`).

#### Scenario: Attendee clicks "Go to login" after setup
- GIVEN the attendee just set her password successfully
- WHEN she clicks "Go to login"
- THEN she is navigated to `/:tenantSlug/portal/user/login`
