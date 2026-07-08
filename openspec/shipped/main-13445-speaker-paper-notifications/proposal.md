# MAIN-13445: Send notification to speaker on paper accept/reject

## Status
`draft` · Branch: _to be created on approval_ (`feat/speaker-paper-status-notifications`)

## Methodology
TDD — Red → Green → Refactor.

## Problem

Ticket: "Send the notification to speaker (who has a paper) on accepted paper,
and rejected papers, and the button must redirect first to the email templates
in order to custom that template if it's possible. The email is one of the
template, the speakers see directly in the portal, for each paper if that was
accepted, rejected and feedback, and add this in the notification."

### Recon findings (2026-07-02)

- Admin accept/reject action (`PUT /cfp/papers/{id}`,
  `backend/app/api/v1/cfp/papers.py:301-419`) has **no notification side
  effect today** beyond an internal `CustomerEvent` audit row
  (`CFP_ACCEPTED`/`CFP_REJECTED`/`CFP_WITHDRAWN`,
  `app/models/customer_event.py:81-83`) — no email, no portal message.
- Speaker notifications on accept/reject **do already exist**, but only inside
  the separate **program publish** flow
  (`backend/app/api/v1/program/publish.py:114-256`,
  `_get_email_template`/`_send_consolidated_notifications`/
  `_create_notification_thread`) — and even there, it creates a **portal
  message thread**, not an actual SMTP email (`_create_notification_thread`,
  line 261, writes to messaging tables via `app/core/email/` is not invoked
  there).
- The `EmailTemplate` system already fully supports this: `EmailTemplateType`
  has `PAPER_ACCEPTANCE`/`PAPER_REJECTION`
  (`app/schemas/email_template.py:75-76`), model at `app/models/settings.py:
  433-510`, CRUD router `app/api/v1/settings/email_templates.py:560-808`,
  rendering via `render_email`/`get_template`
  (`app/core/email/templates.py:60,159`).
- Admin's template editor already exists:
  `frontend/src/pages/ConferenceDetail/tabs/settings/EmailTemplatesTab.tsx:28`
  (nested under conference settings) — but has no deep-link support from the
  evaluated-papers list today.
- Speakers currently have no literal "view the email" surface — they see
  status via `PaperStatusLifeline.tsx` and messaging threads, not a rendered
  template preview.

## Proposed Change

1. **Trigger notification at the point of decision, not just at publish.**
   When `update_paper` (`papers.py:301-419`) transitions a paper's status to
   accepted or rejected, send the `PAPER_ACCEPTANCE`/`PAPER_REJECTION` template
   — reusing the existing `render_email`/template infrastructure — as a real
   email via whatever the platform's outbound-email mechanism is (confirm
   during implementation whether that's Resend/Mailgun per
   `update_mailgun_keys.yml`/`update_resend_key.yml` workflow names, or the
   existing portal-message mechanism should simply be extended to also send
   real email). **Clarify with the ticket author**: does this replace or
   duplicate the existing publish-time notification? Recommend: skip
   duplicate sends if a paper was already notified at publish time. **Confirmed
   with user (2026-07-03): immediate-on-decision, not a replacement for the
   publish-time flow** — both remain live, deduplicated via a new
   `CFPPaper.notification_sent_at` column checked/set by whichever trigger
   fires first.
2. **Deep-link "edit template" button.** Add a button on the admin
   evaluated-papers list/detail (`CFPEvaluatedPapers.tsx`) that navigates to
   `EmailTemplatesTab` pre-filtered to `paper_acceptance`/`paper_rejection`
   (route param, e.g. `?tab=settings&subtab=email-templates&type=...`).
3. **Speaker-facing template preview.** Add a "view your notification" surface
   in the speaker portal (near `PaperStatusLifeline.tsx`) showing the rendered
   template content (accepted/rejected/feedback) for their paper — reusing the
   same `render_email` output the actual email used, so what they see matches
   what was sent.
4. Feedback text (`PaperReview.speaker_feedback`,
   `app/models/review.py:180`) should be interpolated into the
   template/notification where the template supports a feedback placeholder.

## Out of Scope

- Building a new email-template system — it already exists and is reused as-is.
- Changing the program-publish notification flow itself (only clarifying
  overlap/dedup with the new per-decision trigger).
- SMS or other non-email/non-portal notification channels.

## Acceptance Criteria

- Accepting or rejecting a paper via `update_paper` triggers exactly one
  notification to the speaker (no duplicate if already notified at publish
  time).
- The notification uses the tenant's customized `PAPER_ACCEPTANCE`/
  `PAPER_REJECTION` template if one exists, falling back to the default.
- Admin can navigate directly from the evaluated-papers view to the relevant
  email template editor via a single click.
- Speaker can see, in the portal, the actual rendered content of the
  notification for each of their papers (accepted/rejected + feedback).

## Spec

See `openspec/specs/` once implementation lands.
