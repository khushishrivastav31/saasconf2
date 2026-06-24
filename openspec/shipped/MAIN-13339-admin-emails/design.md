# Design — MAIN-13339 Admin Emails

## Current Notification Flow (speaker → admin)

1. Applicant calls `POST /portal/messages` or `/portal/messages/{id}/reply`.
2. `_notify_other_participants()` in `backend/app/api/v1/cfp_portal/messaging/_helpers.py`
   iterates over all `MessageParticipant` rows for the thread where the participant is
   not the sender.
3. For each participant of type `"user"`, the function fetches the `User` row and,
   if `user.message_notifications_enabled` is `True`, calls `send_email_background()`
   with `send_new_message_notification`. Every admin gets their own email.

## Proposed Notification Flow (speaker → support email)

For conference threads (i.e. `domain == "conference"`), the loop over `"user"`-type
participants is replaced by a single consolidated email to the conference support address:

```
support_email = conference.support_email or conference.contact_email
if support_email:
    send_email_background(
        send_new_message_notification, ...,
        email=support_email,
        first_name="",      # generic greeting handled by email template
        ...
    )
```

Admin participants are **not** removed from the thread — they can still read and reply
in the admin dashboard. Only the email notification behaviour changes.

## Backend Changes

### `backend/app/api/v1/cfp_portal/messaging/_helpers.py`

`_notify_other_participants()`:
- When `domain == "conference"` and `conference_id_for_email` is set:
  - Fetch the `Conference` row using `conference_id_for_email`.
  - Derive `support_addr = conference.support_email or conference.contact_email`.
  - Skip individual per-user email sends.
  - If `support_addr` is not blank, call `send_email_background(send_new_message_notification, ...)`
    once with `email=support_addr` and `first_name=""`.
- For `"applicant"` and `"training_attendee"` participants, behaviour is unchanged.
- For `domain == "training"`, the `"user"` loop is unchanged (training module is out of scope).

The function already receives `conference_id_for_email` and `domain`; no signature change needed.
One extra `SELECT Conference` query per notification call is acceptable — this path is
low-frequency (human-generated messages, not batch).

## Frontend Changes

### Conference settings — Contact Information section

File: `frontend/src/pages/ConferenceSettings/` (whichever component renders the
Contact Information fields — Support Email, Contact Email, Phone).

Add a helper note beneath the Support Email `<input>` (or its label):

```
"Message notifications from speakers will be sent to this address."
```

Implementation: a `<p>` with `text-xs text-gray-500 dark:text-dark-text-secondary mt-1`.
This mirrors the note pattern already used in the existing "Used in email templates
and invoice placeholders" helper above the section.

## Email Template Behaviour

`send_new_message_notification` already handles a blank or generic `first_name` gracefully
(the template uses it for a salutation but falls back to an impersonal greeting).
No template change is required.

## Test Impact

| File | Change |
|------|--------|
| New: `tests/messaging/test_speaker_notification_to_support_email.py` | Assert one email to support_email when applicant sends message; assert no per-admin email; assert fallback to contact_email; assert no email when both are blank |
| Existing messaging tests | Verify no regressions in applicant notification path and training notification path |

## Rollout / Risk

- Low risk — changes a notification side-effect, not data or auth.
- Admins who relied on individual email notifications will stop receiving them;
  they should monitor the support inbox instead. The UI note makes this visible.
- If `support_email` and `contact_email` are both blank, no admin notification is sent.
  This is acceptable — same as an admin with notifications disabled.
