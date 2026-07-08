# MAIN-13445: Design

## Notification timing — confirmed with user (2026-07-03)

**Immediate on accept/reject decision**, as proposed. There are two
existing/possible notification points:
1. `update_paper` status change (immediate, per-paper) — doesn't exist today,
   this change adds it.
2. Program publish (`program/publish.py`) — exists today, batched, sent when
   the whole program is published, creates a portal message thread (not
   email).

Both remain live, so the dedup mechanism below (`notification_sent_at`) is
required to prevent a speaker being emailed twice for the same decision (once
immediately, once again at publish time).

## Notification flow (immediate on decision)

```
update_paper() status → accepted/rejected
  ├─ already notified? (check CustomerEvent for a prior notification event,
  │  or add a new notified_at column) → skip if yes
  ├─ render_email(template_type, context={paper, speaker, feedback})
  ├─ send via existing outbound mechanism (confirm Resend/Mailgun wiring —
  │  check app/core/email/ for how other transactional emails are sent, e.g.
  │  registration confirmation, to match the existing pattern rather than
  │  invent a new send path)
  └─ record CustomerEvent (or new notified_at) so publish-time flow can skip
     re-notifying the same paper
```

## Deep-link button

`CFPEvaluatedPapers.tsx`'s existing accept/reject controls
(lines 131-170) get a small "Edit template" link/icon next to them, navigating
to the settings tab with query params `EmailTemplatesTab.tsx` reads on mount to
pre-select the relevant template type. If `EmailTemplatesTab` doesn't currently
support being pre-filtered via URL param, that's a small addition to the tab
component, not a new page.

## Speaker portal preview

Add a small block near `PaperStatusLifeline.tsx` (or as a modal triggered from
it) that calls a new/existing endpoint to fetch the rendered
`PAPER_ACCEPTANCE`/`PAPER_REJECTION` content for the speaker's own paper —
reuse `render_email`'s output rather than re-implementing template
interpolation on the frontend, so what's displayed is guaranteed identical to
what was actually sent.

## Dedup mechanism concretely

Simplest: a new nullable `CFPPaper.notification_sent_at: datetime | None`
column (small migration). Both the `update_paper` trigger and the publish flow
check-and-set this field, whichever fires first wins, the other is a no-op.
