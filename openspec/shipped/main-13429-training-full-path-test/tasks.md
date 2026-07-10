# MAIN-13429: Tasks

> Docs-only change. The deliverable is `QA_TRAINING.md` at the repo root, mirroring
> `QA_CONFERENCE.md`. No app code, no test code, no API surface touched: no OpenAPI
> drift, no migration, no Handbook edit.

## Write

- [x] Read `QA_CONFERENCE.md` and adopt its conventions: status labels, test-user
      table, numbered scenario tables, step-by-step walkthroughs with **Expected:**.
- [x] Read the Training Handbook tree (`frontend/src/pages/Handbook/sections/`)
      and inventory all nine categories.
- [x] Ground navigation against `frontend/src/pages/Trainings/trainingSections.ts`
      (real sidebar labels) and `frontend/src/App.tsx` (real routes).
- [x] Ground behaviour against the implementation — registration endpoint gates,
      bot protections, invoice status on creation, mark-paid, attendee dedup,
      cancel-vs-replace refund asymmetry.
- [x] `QA_TRAINING.md`: sections 0–10, prerequisite-ordered, every scenario at
      `Not tested`.
- [x] Record the Handbook inaccuracies found while grounding, at the foot of the doc.
- [x] **Make the doc standalone** — it must work on a fresh machine, for a tester
      or agent with zero session context:
      - `Environment setup`: `docker compose up`, service ports, how to find
        `{tenant-slug}` (SQL — it is not shown in the admin UI), MailHog wiring,
        reCAPTCHA no-op, how to reset between runs.
      - The `DEBUG` / rate-limit interaction, split by run mode: Docker already
        sets `DEBUG=true` (rate limit skipped); native runs default to `false`
        (rate limit active, and `DEBUG` is **not** in `.env.example`).
      - `Appendix A`: copy-paste `curl` + SQL for the scenarios the browser
        cannot express — honeypot, 5-second trap, 0/101 attendees, wrong-tenant
        and nonexistent-placement 404s, corrupting park history.
      - `Appendix B`: file:line index of every behavioural claim, so a future
        reader can re-verify or update the doc after a change.
      - Stripe test card numbers; the real disposable-domain blocklist.

## Verify

- [x] Every sidebar name used in a navigation step exists in `trainingSections.ts`.
- [x] Public portal route `:tenantSlug/trainings/register/*` and admin route
      `/modules/trainings` confirmed in `App.tsx`.
- [x] Every behavioural claim traced to a file:line in the backend (Appendix B).
- [x] No scenario carries a fabricated pass/fail result.
- [x] No step depends on a step that comes after it.
- [x] Every `Appendix A.N` cross-reference in the body resolves to a real section.
- [x] Appendix A SQL uses columns that exist: `training_attendees` has **no
      `email` column** (it stores `email_encrypted` + `email_hash`), so the
      park-history recipe matches on `first_name` / `last_name` / `status`.
- [ ] **Not done:** Appendix A `curl` / SQL recipes are verified against the
      models, not executed against a live database. Worth one run-through the
      first time someone uses the doc.

No lint, type-check, test suite, or `pnpm gen:api` run applies — this change adds
one root markdown file and rewrites `openspec/` docs.

## Ship

- [ ] Move this spec folder to `openspec/shipped/`. `QA_TRAINING.md` stays at the
      root, alongside `QA_CONFERENCE.md`.
- [ ] Conventional commit: `docs(trainings): add QA_TRAINING.md full test path
      (MAIN-13429)`. PR per workflow, `--auto --squash` once green.

## Follow-ups — separate tickets, not this one

- [ ] Handbook copy (`t-invoices`): clarify that the `Draft → Sent → Paid`
      lifecycle describes admin-created invoices, and that portal registrations
      enter at `sent` / `paid`. Same section: qualify the Stripe payment-link
      sentence as applying to admin-created card invoices.
- [ ] Handbook copy (`t-parking-lot`): sidebar position is between **Attendees and
      Users**, not "between Attendees and Trainers".
- [ ] Remove the unreachable honeypot branch at
      `app/api/v1/portal/training_portal/registration.py:151` (dead since
      `validate_registration_security` rejects with 400 first).
- [ ] Automate the registration→invoice seam (see `design.md`): assert that
      `POST /portal/{slug}/trainings/register` produces the registration,
      attendee, and invoice that park/reassign later consumes.
- [ ] Env-gated Playwright spec + `training.page.ts` extension, if a seeded target
      becomes available.
