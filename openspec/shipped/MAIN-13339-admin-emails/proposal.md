# MAIN-13339 — Admin Emails: Route Speaker Messages to Support Email

## Status
`done` · Jira: MAIN-13339 · Branch: `fix/MAIN-13339-admin-emails`

## Methodology
TDD — Red → Green → Refactor. Tests written first; no implementation before a failing test.

## Problem

When a speaker (CFP applicant) sends a message through the portal messaging module,
every tenant admin who is a thread participant receives an individual email notification.
For organizations with many admins, this is noisy and disruptive.

The conference already has a dedicated **Support Email** field (and a fallback **Contact Email**)
in its settings. These are the right addresses for inbound support-style communication from speakers.

There is also no hint in the UI that tells admins which address receives message notifications,
making it impossible to reason about the current behavior without reading code.

## Proposed Change

### Backend

When a speaker (applicant) sends a message in a conference thread, instead of emailing
every admin participant individually, send **one notification to the conference's
`support_email`** (falling back to `contact_email` if `support_email` is blank).
If neither is set, no admin notification is sent (same behavior as an admin with
`message_notifications_enabled = False`).

Admin-to-applicant notifications are not changed — applicants still receive portal
link emails when an admin replies to them.

Admin-to-admin notifications (admins notifying each other in reply threads) are also
unchanged — those go through `_notify_participants` in the admin messaging path.

### Frontend

Add a descriptive note beneath the **Support Email** field in the conference settings
Contact Information section:

> "Message notifications from speakers will be sent to this address."

This scopes the note to the feature and avoids generic documentation clutter.

## Out of Scope

- Training module messaging (unrelated notification flow).
- Admin-initiated message threads (admin → applicant direction is unchanged).
- Changing the participant model — admins remain thread participants so they can
  still read and reply via the admin dashboard.
- Per-admin opt-out granularity for the consolidated support email.
