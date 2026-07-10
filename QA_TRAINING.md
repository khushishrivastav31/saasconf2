# Training Module — QA

Status labels: `RETEST` — fix committed, verify it works | `FAIL` — still broken | `BLOCKED` — depends on another fix | `SKIP` — not implemented yet | `Not tested` — never run

> All scenarios below start at `Not tested`. Fill in statuses as you run them.

---

## Test Users

| Email | Password | Role |
|---|---|---|
| `admin@saasconf.com` | `changeme123` | Super Admin |
| `superuser@bjvsoft.com` | `Test1234!` | Super User (all modules) |
| `training.only@bjvsoft.com` | `Test1234!` | Trainings Admin only |
| `conf.member@bjvsoft.com` | `Test1234!` | Conferences Member (should NOT see Trainings) |

> Invite links and password-setup tokens appear in the **backend terminal** (look for `=== EMAIL ===`). MailHog also catches them at http://localhost:8025.

**Key URLs**

| What | URL |
|---|---|
| Trainings admin | `http://localhost:3000/modules/trainings` |
| Public registration portal | `http://localhost:3000/{tenant-slug}/trainings/register` |
| Attendee portal (authenticated) | `http://localhost:3000/{tenant-slug}/portal/trainings` |
| Handbook | `http://localhost:3000/handbook/trainings` |
| Backend API | `http://localhost:8000` |
| MailHog | `http://localhost:8025` |

---

## Environment setup

### Start the stack

```bash
docker compose up          # db (5432), redis, backend (8000), mailhog (8025), frontend (3000)
```

Wait for the backend to finish migrations before logging in.

### Find `{tenant-slug}`

Every portal URL needs it. It is **not** shown in the admin UI:

```bash
docker compose exec db psql -U saasconf -d saasconf -c "SELECT name, slug FROM tenants;"
```

Use the `slug` of the tenant whose Trainings module you enabled in §0.1.

### DEBUG and the rate limit — read this carefully

Public registration is rate-limited to **3 per hour per IP**, and that check runs **only when `DEBUG` is false**.

| How you run the backend | `DEBUG` | Rate limit |
|---|---|---|
| `docker compose up` | `true` (set in `docker-compose.yml`) | **skipped** — register freely |
| Native (`venv` + uvicorn) | `false` (default in `backend/app/config.py`) | **active** — 4th registration in an hour returns `429` |

So under Docker you can register repeatedly. Running natively, either add `DEBUG=true` to your `.env` (it is **not** in `.env.example` — you must add the line) or accept 3 registrations per hour. To *test* the rate limit deliberately (§4.3.4), run natively with `DEBUG=false`.

### Email

Under `docker compose`, `SMTP_HOST=mailhog` is already wired and mail lands at http://localhost:8025. Running the backend **natively**, set `SMTP_HOST=localhost` or nothing will reach MailHog.

### reCAPTCHA

Leave `RECAPTCHA_SECRET_KEY` empty (the `.env.example` default). Captcha validation then no-ops entirely and the portal stays usable. You do not need a key to run any scenario here.

### Resetting between runs

Attendees are deduplicated by `(tenant, lowered email)`, so **reusing an email silently reuses the attendee record** instead of creating one. Use a fresh address per registration (`attendee-t1@`, `attendee-t2@`, …) unless the scenario explicitly tests dedup (§4.8).

To wipe and start clean: `docker compose down -v && docker compose up`.

---

## Read this before you start

Three things will look like bugs and are not:

1. **The registration form rejects submissions made under 5 seconds** after the form loads (bot time-trap). Take your time filling it in, or you get a `400`.
2. **Portal registrations never produce a `Draft` invoice.** The invoice is created at `Sent` (bank transfer) or `Paid` (credit card). The Handbook's `Draft → Sent → Paid` diagram describes *admin-created* invoices only. Do not wait for a draft to appear.
3. **The portal returns the same 404 for six unrelated causes.** "Training not found or not available for registration" most often means *you forgot to publish the program year* (§3.4). See §4.1 for the full list.

**Order matters.** Sections 1–3 are prerequisites. You cannot register through the portal (§4) until a program year is **published** with a future, `open`/`hybrid` placement.

**Some scenarios cannot be run from the browser** — filling a hidden honeypot, submitting 101 attendees, corrupting park history. Those are marked *(see Appendix A)* and have copy-paste `curl` / SQL recipes at the foot of this document.

---

## 0. Prerequisites & Access Control

| # | Scenario | Status |
|---|----------|--------|
| 0.1 | Trainings module enabled for tenant (`My Company → Modules`) | Not tested |
| 0.2 | `training.only@bjvsoft.com` sees Trainings but NOT Conferences | Not tested |
| 0.3 | `conf.member@bjvsoft.com` does NOT see the Trainings module | Not tested |
| 0.4 | Trainings admin lands on `/modules/trainings` with the Setup / Operations / Communications / Insights sidebar groups | Not tested |

---

## 1. Settings — Finance

Every invoice depends on these. Configure before §4, or registration will succeed and invoicing will fail.

| # | Scenario | Status |
|---|----------|--------|
| 1.1 | `Settings → Currency & Tax` — set currency + VAT rates + VAT decision table | Not tested |
| 1.2 | `Settings → Numbering` — invoice number format + next number | Not tested |
| 1.3 | `Settings → Company Data` — appears on rendered PDF | Not tested |
| 1.4 | `Settings → Bank Accounts` — appears on bank-transfer invoice | Not tested |
| 1.5 | `Settings → Invoice Templates` — bank-transfer + credit-card templates exist | Not tested |
| 1.6 | `Settings → Stripe Setup` — only if testing card payment; leave disabled otherwise | Not tested |
| 1.7 | `Settings → ZUGFeRD` — enable e-invoicing without crashing | Not tested |
| 1.8 | `Settings → Payment Reminders` — reminder schedule saves | Not tested |

### 1.9 — Invoice prerequisites actually hold

1. Log in as `training.only@bjvsoft.com` / `Test1234!`.
2. Go to `http://localhost:3000/modules/trainings` → **Invoices** (Operations group).
3. Create an invoice manually. Send it.
4. **Expected:** PDF renders with company data, bank details, and a sequential invoice number matching the format from 1.2. No 500.

---

## 2. Settings — Catalog & Reference Data

| # | Scenario | Status |
|---|----------|--------|
| 2.1 | `Settings → Languages` — create a language | Not tested |
| 2.2 | `Settings → Certification Bodies` — create a body | Not tested |
| 2.3 | `Settings → Syllabus` — create a syllabus **with an exam price** | Not tested |
| 2.4 | `Settings → Training Catalog` — create a training with `regular_price`, left **active** | Not tested |
| 2.5 | `Settings → Location Types` — create a type | Not tested |
| 2.6 | `Settings → Locations` — create a location **with a country** (drives VAT) | Not tested |
| 2.7 | `Trainers` (Setup group, top level) — create a trainer | Not tested |
| 2.8 | `Settings → Holidays` — add a blocked day; §3 must refuse to schedule across it | Not tested |
| 2.9 | `Settings → Registration Questions` — add a custom question; must appear on the §4 portal form | Not tested |
| 2.10 | `Settings → Policies` — add a registration policy | Not tested |
| 2.11 | `Settings → Email Settings` — confirmation + invoice templates exist | Not tested |
| 2.12 | `Settings → Registration Portal` — enable portal, set languages, auto-guarantee threshold | Not tested |

> The **exam price on the syllabus** (2.3) is what gets added per attendee in 4.6. If exam pricing looks wrong later, check here first.

---

## 3. Training Program

| # | Scenario | Status |
|---|----------|--------|
| 3.1 | Create a Training Program Year | Not tested |
| 3.2 | Add a placement — future date, `open` or `hybrid` type | Not tested |
| 3.3 | Assign a trainer to the placement | Not tested |
| 3.4 | **Publish the program year** | Not tested |
| 3.5 | Placement appears on Final Program with trainer + date | Not tested |
| 3.6 | Holiday conflict (2.8) is refused when scheduling | Not tested |

### 3.4 — Publish the program year

1. Log in as `training.only@bjvsoft.com` / `Test1234!`.
2. Go to **Training Program** (Setup group) → your year → **Design Program**.
3. Add a placement: pick the training from 2.4, the location from 2.6, a **future** start date, and set placement type to **open**.
4. Go to **Assign Trainers** → assign the trainer from 2.7.
5. Go to **Final Program** → **Publish**.
6. **Expected:** The year's status reads `published`. The placement is listed with its trainer and date.

> **This is the single most-missed step.** An unpublished year makes every placement invisible to the public portal, and the portal returns a generic 404 that says nothing about publishing. See 4.1.

---

## 4. Public Registration Portal

Portal URL: `http://localhost:3000/{tenant-slug}/trainings/register`

### 4.1 — The ambiguous 404 (do this first)

The endpoint returns the **same** `404 "Training not found or not available for registration"` for six different causes. Trigger each and confirm the message is identical — this is the debugging table you will want later.

| # | Cause | How | Status |
|---|----------|-----|--------|
| 4.1.1 | Placement belongs to another tenant | curl with another tenant's slug *(Appendix A.2)* | Not tested |
| 4.1.2 | `placement_type` is neither `open` nor `hybrid` | set the placement to `closed` in admin | Not tested |
| 4.1.3 | Placement `start_date` is in the past | edit the placement date to yesterday | Not tested |
| 4.1.4 | Program year is not `published` | un-publish the year (§3.4) | Not tested |
| 4.1.5 | Training is not active | deactivate it in `Settings → Training Catalog` | Not tested |
| 4.1.6 | Placement id does not exist | curl a random UUID *(Appendix A.2)* | Not tested |

**Expected for all six:** `404`, body `{"detail": "Training not found or not available for registration"}`.

> This ambiguity is the point of the scenario. In production this 404 tells you nothing about which of the six went wrong — knowing the list *is* the debugging procedure.

### 4.2 — Registration window (403)

1. In `Settings → Registration Portal`, set `registration_start_date` to tomorrow.
2. Open the portal and submit.
3. **Expected:** `403`, `"Registration opens on {date}"`.
4. Now set `registration_end_date` to yesterday, clear the start date, submit.
5. **Expected:** `403`, `"Registration closed on {date}"`.

| # | Scenario | Status |
|---|----------|--------|
| 4.2.1 | Before `registration_start_date` → 403 with "opens on" | Not tested |
| 4.2.2 | After `registration_end_date` → 403 with "closed on" | Not tested |

### 4.3 — Bot protections (all return 400, not 422)

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 4.3.1 | Fill the hidden honeypot field *(Appendix A.3 — not doable in the browser)* | `400 "Invalid form submission"` | Not tested |
| 4.3.2 | Submit under 5 seconds after load *(Appendix A.4)* | `400 "Form submitted too quickly…"` | Not tested |
| 4.3.3 | Use a disposable billing email — `qa@mailinator.com` | `400 "Temporary email addresses are not allowed…"` | Not tested |
| 4.3.4 | Backend running **natively** with `DEBUG=false`: submit a 4th registration within an hour from one IP | `429` | Not tested |

> The full blocked-domain list for 4.3.3 is `DISPOSABLE_EMAIL_DOMAINS` in `backend/app/core/security/registrations.py:20` — `mailinator.com`, `yopmail.com`, `10minutemail.com`, `guerrillamail.com`, and 15 others.

### 4.4 — Input guards

The browser form will not let you do either of these. Use the recipes in **Appendix A.5**.

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 4.4.1 | Submit with zero attendees | `422 "At least one attendee is required"` | Not tested |
| 4.4.2 | Submit with 101 attendees | `422 "Maximum 100 attendees per registration"` | Not tested |

### 4.5 — Browse and filter

| # | Scenario | Status |
|---|----------|--------|
| 4.5.1 | Search + filter by date range, location (city / Online), language, syllabus, guaranteed | Not tested |
| 4.5.2 | Filter counts update as filters change | Not tested |
| 4.5.3 | Language toggle (EN/DE) switches all portal labels | Not tested |
| 4.5.4 | Guaranteed badge (green) appears once registrations hit the auto-guarantee threshold from 2.12 | Not tested |
| 4.5.5 | Custom registration question from 2.9 appears on the form | Not tested |

### 4.6 — Exam selection and VAT

| # | Scenario | Status |
|---|----------|--------|
| 4.6.1 | Per attendee: exam mode (No exam / On-site / Online), exam language, extra time | Not tested |
| 4.6.2 | Syllabus exam price is added **per attendee**, not per registration | Not tested |
| 4.6.3 | Order summary shows training price, exam fees, subtotal, VAT, total in real time | Not tested |
| 4.6.4 | VAT: in-person + B2C + domestic → domestic VAT rate | Not tested |
| 4.6.5 | VAT: virtual + B2B + EU → **no VAT charged** | Not tested |
| 4.6.6 | VAT: non-EU customer → per decision table | Not tested |

### 4.7 — Register with bank transfer (the spine)

1. Confirm `DEBUG=true` in the backend `.env` (see "Read this before you start").
2. Open `http://localhost:3000/{tenant-slug}/trainings/register`.
3. Pick the placement published in 3.4.
4. Add **one attendee** with a fresh email (e.g. `attendee-t1@bjvsoft.net`). Choose an exam mode.
5. Fill billing details. Choose **Bank transfer**.
6. Wait at least 5 seconds after the form loaded, then submit.
7. **Expected:** success screen, no error.
8. Log in as `training.only@bjvsoft.com` / `Test1234!` → **Training Registrations**.
9. **Expected:** the registration appears, grouped under its placement, with contact name, email, attendee count, payment status, and total.
10. Go to **Attendees**. **Expected:** a central attendee record exists for that email.
11. Go to **Invoices**. **Expected:** an invoice exists with status **`Sent`** — *not* `Draft`.
12. Open MailHog (http://localhost:8025). **Expected:** a confirmation email **and** an invoice email.

| # | Scenario | Status |
|---|----------|--------|
| 4.7.1 | Submission succeeds, success screen shown | Not tested |
| 4.7.2 | Registration appears in admin, grouped by placement | Not tested |
| 4.7.3 | Central attendee record created | Not tested |
| 4.7.4 | Invoice created with status `Sent` (not `Draft`) | Not tested |
| 4.7.5 | Confirmation + invoice emails land in MailHog | Not tested |

### 4.8 — Attendee deduplication

1. Register the **same email** from 4.7 against a **second** placement.
2. Go to **Attendees**.
3. **Expected:** exactly **one** central attendee record for that email, not two. The attendee's **timeline** shows both registrations.

| # | Scenario | Status |
|---|----------|--------|
| 4.8.1 | Same email across two trainings → one central attendee | Not tested |
| 4.8.2 | Timeline shows both registration events | Not tested |

### 4.9 — Register with credit card

Requires Stripe configured (1.6) with **test-mode** keys (`sk_test_…` / `pk_test_…`).

Stripe test cards — any future expiry, any CVC, any postcode:

| Card number | Behaviour |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0000 0000 0002` | declined |
| `4000 0025 0000 3155` | requires 3DS authentication |

1. Register as in 4.7, but choose **Credit card**. The Stripe card form appears inline.
2. Complete payment with `4242 4242 4242 4242`.
3. **Expected:** payment is confirmed **before** the registration is created.
4. Go to **Invoices**.
5. **Expected:** the invoice is created **already `Paid`**, carrying the Stripe payment intent. No payment link is generated (the invoice never passes through *send*).

| # | Scenario | Status |
|---|----------|--------|
| 4.9.1 | Card form appears inline when Stripe enabled | Not tested |
| 4.9.2 | Invoice created with status `Paid` directly | Not tested |
| 4.9.3 | Country-based auto-switching of payment method | Not tested |

### 4.10 — Idempotency

1. Submit the exact same registration twice.
2. **Expected:** the existing invoice is returned. **No second invoice is cut.**

| # | Scenario | Status |
|---|----------|--------|
| 4.10.1 | Duplicate submission does not create a second invoice | Not tested |

---

## 5. Registrations & Invoicing

| # | Scenario | Status |
|---|----------|--------|
| 5.1.1 | Registrations grouped by placement, sorted by date (nearest future first) | Not tested |
| 5.1.2 | Past trainings hidden until **Show past** is ticked | Not tested |
| 5.1.3 | Expand a row → attendees with exam details | Not tested |
| 5.1.4 | Edit exam mode / language / extra time per attendee | Not tested |
| 5.1.5 | Offer-origin attendees show a **purple offer badge** linking to the offer | Not tested |
| 5.2.1 | Invoice list: number, recipient, training, status, type, total | Not tested |
| 5.2.2 | Detail panel opens with Details + Line Items tabs | Not tested |
| 5.2.3 | Credit notes appear as indented sub-rows (`↳`) under their parent | Not tested |
| 5.2.4 | Filter by search, status, date range | Not tested |
| 5.5.1 | **Pending Invoicing** → Uninvoiced Registrations lists registrations with no invoice | Not tested |
| 5.5.2 | **Pending Invoicing** → Accepted Offers lists offers with attendees but no invoice | Not tested |
| 5.6.1 | **Payment Reminders** target overdue invoices | Not tested |

### 5.3 — Mark paid

1. As `training.only@bjvsoft.com`, go to **Invoices**.
2. Open the bank-transfer invoice from 4.7 (status `Sent`).
3. Click **Mark as paid**.
4. **Expected:** status flips to `Paid`. The registration's payment status follows.

| # | Scenario | Status |
|---|----------|--------|
| 5.3.1 | Sent → Paid via Mark as paid | Not tested |
| 5.3.2 | Registration payment status updates to match | Not tested |

### 5.4 — Cancel vs Replace (the refund difference)

These two look similar and behave **oppositely** on refunds. Test them back to back.

**5.4.1 — Cancel a paid Stripe invoice**

1. **Invoices** → open a card invoice in status `Paid`.
2. Click **Cancel**.
3. **Expected:** status → `Cancelled`. A **credit note** is auto-created with negated line items, shown as an indented `↳` sub-row. **A Stripe refund IS issued automatically.**

**5.4.2 — Replace a paid Stripe invoice (billing correction)**

1. **Invoices** → open another card invoice in status `Paid`.
2. Click **Replace**. Correct the billing address or VAT number.
3. **Expected:** original → `Cancelled`, a credit note is created, and a **new invoice** is generated with the corrected billing. The Stripe payment **transfers to the new invoice** — **no refund, no re-charge.**

| # | Scenario | Status |
|---|----------|--------|
| 5.4.1 | Cancel paid card invoice → credit note **+ Stripe refund** | Not tested |
| 5.4.2 | Replace paid card invoice → credit note + new invoice, **payment transfers, no refund** | Not tested |
| 5.4.3 | Credit note links back to the original in the detail panel | Not tested |
| 5.4.4 | Admin-created card invoice: sending it generates a **Stripe payment link** in the email + detail panel | Not tested |

---

## 6. Attendee Lifecycle — Parking Lot

Sidebar: **Parking Lot** (Operations group, between Attendees and Users).

### 6.1 — Park an attendee

1. As `training.only@bjvsoft.com` → **Training Registrations**.
2. Expand the registration from 4.7. Click **Park** on the attendee.
3. **Expected:** the attendee moves to **Parking Lot**, listed with their original training info.
4. Go to **Attendees** → open the attendee → **Timeline**.
5. **Expected:** a `parked` event is recorded.

| # | Scenario | Status |
|---|----------|--------|
| 6.1.1 | Park moves attendee to Parking Lot with original training info | Not tested |
| 6.1.2 | Timeline records the `parked` event | Not tested |

### 6.2 — Reassign from the parking lot

1. **Parking Lot** → select the parked attendee → choose a **second placement**.
2. **Expected**, in order:
   1. old invoice → `Cancelled`, credit note created
   2. a new registration is created on the new placement
   3. a new invoice is generated — **if the original was `Paid`, the payment transfers (no refund, no re-charge)**
   4. the old registration is cleaned up if no attendees remain
3. Open the credit note. **Expected:** it links back to the old invoice.
4. Open the new invoice. **Expected:** it carries a note explaining the transfer.

| # | Scenario | Status |
|---|----------|--------|
| 6.2.1 | Old invoice cancelled + credit note created | Not tested |
| 6.2.2 | New registration created on the new placement | Not tested |
| 6.2.3 | New invoice generated; paid original → payment transfers, no refund | Not tested |
| 6.2.4 | Old registration cleaned up when empty | Not tested |
| 6.2.5 | Credit note links to old invoice; new invoice notes the transfer | Not tested |
| 6.2.6 | Timeline records the `reassigned` event | Not tested |

### 6.3 — Reassign with missing park history (regression)

A real production failure: reassigning an attendee whose park history is unrecoverable used to `500` with a `NotNullViolationError` (2026-04-17).

1. Park an attendee (§6.1).
2. Delete their park-history row so the old registration cannot be located — **SQL, see Appendix A.6.**
3. Reassign them to a new placement from the Parking Lot.
4. **Expected:** no `500`. The new registration is created with **empty-string** street / postal code / city / country for the admin to fill in afterwards.

| # | Scenario | Status |
|---|----------|--------|
| 6.3.1 | Reassign with missing park history does not 500 | Not tested |
| 6.3.2 | Address fields fall back to empty strings | Not tested |

### 6.4 — Cancel Registration

Note the contrast with 5.4.1: **no Stripe refund here.**

1. **Parking Lot** → click **Cancel Registration** on a parked attendee.
2. **Expected:** invoice → `Cancelled`, credit note issued **and emailed** to the billing contact, registration marked cancelled, and the attendee stays **`Active`** — out of the parking lot, not tied to a training.
3. **Expected:** **no Stripe refund** is issued. Operators handle refunds out of band.

| # | Scenario | Status |
|---|----------|--------|
| 6.4.1 | Invoice cancelled, credit note issued + emailed | Not tested |
| 6.4.2 | Attendee remains `Active`, not parked | Not tested |
| 6.4.3 | No automatic Stripe refund | Not tested |
| 6.4.4 | Only offered for portal registrations with invoice `Sent`/`Overdue`/`Paid` | Not tested |
| 6.4.5 | **Multi-attendee registrations are blocked** — must cancel from the Invoices view | Not tested |
| 6.4.6 | Offer-origin attendees are excluded (they use the Offer flow) | Not tested |

### 6.5 — Reactivate

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 6.5.1 | Reactivate an `Inactive` attendee | status → `Active` | Not tested |
| 6.5.2 | Reactivate a **parked** attendee | **rejected** | Not tested |
| 6.5.3 | Parked attendee with a deactivated portal account shows as `Inactive` in list filters | Not tested |

### 6.6 — Bulk cancel ("Cancel many…")

1. **Training Registrations** → **Cancel many…** at the top.
2. **Step 1 (Filter):** narrow by date range, originating IP, billing-email pattern (e.g. `%@spam.com`), or payment status. Enter a reason of **≥ 10 characters** (required).
3. **Step 2 (Preview):** read-only summary — total count, total credit-note value, top originating IPs and billing emails, one checkbox per row, all ticked. Untick one to spare it.
4. **Step 3 (Confirm):** type the displayed count to enable the final button.
5. **Expected:** each ticked row behaves exactly like a single cancel — invoice → `Cancelled`, credit note generated and emailed, Stripe payment links deactivated, refunds initiated for paid card invoices.
6. **Re-run the same filter.**
7. **Expected:** **zero rows cancelled** (already-cancelled rows are excluded). Accidental re-clicks are safe.

| # | Scenario | Status |
|---|----------|--------|
| 6.6.1 | Reason under 10 chars is rejected | Not tested |
| 6.6.2 | Preview shows counts, credit-note value, top IPs/emails; unticking spares a row | Not tested |
| 6.6.3 | Confirm requires typing the count (reflecting only ticked rows) | Not tested |
| 6.6.4 | Each cancel produces a credit note + email; card invoices refunded | Not tested |
| 6.6.5 | Re-running the same filter cancels zero rows | Not tested |

### 6.7 — GDPR: originating IP retention

The registration IP is deleted the moment the row reaches a terminal state — `paid` or `cancelled`. There is no time-based retention.

1. Register via the portal. Confirm the IP filter in 6.6 matches the still-pending row.
2. Mark the invoice paid (5.3).
3. **Expected:** the IP is gone. The 6.6 IP filter no longer matches that row.

| # | Scenario | Status |
|---|----------|--------|
| 6.7.1 | IP present while registration is pending | Not tested |
| 6.7.2 | IP deleted on transition to `paid` | Not tested |
| 6.7.3 | IP deleted on transition to `cancelled` | Not tested |

---

## 7. Customers & Offers (B2B path)

A parallel entry into the same invoicing machinery.

| # | Scenario | Status |
|---|----------|--------|
| 7.1 | **Customers** → create a customer | Not tested |
| 7.2 | Create an offer with placements and attendees | Not tested |
| 7.3 | `Settings → Offer Templates` → generate the offer document | Not tested |
| 7.4 | **Offer Management** → send the offer | Not tested |
| 7.5 | **Accept** the offer → **all** offer attendees promoted to real attendees | Not tested |
| 7.6 | Offer invoicing → invoice generated for the accepted offer | Not tested |
| 7.7 | Offer attendees appear in Training Registrations with a purple offer badge | Not tested |
| 7.8 | Badge click navigates to the customer's offer detail | Not tested |
| 7.9 | Offer-origin attendees are excluded from Cancel Registration (see 6.4.6) | Not tested |
| 7.10 | Accepted offer with attendees but no invoice appears in **Pending Invoicing** | Not tested |

---

## 8. Communications

| # | Scenario | Status |
|---|----------|--------|
| 8.1 | **Messages** → send to a recipient list, arrives in MailHog | Not tested |
| 8.2 | Message templates render correctly | Not tested |
| 8.3 | **News** → publish an article, visible on the portal | Not tested |
| 8.4 | Unpublishing removes the article from the portal | Not tested |
| 8.5 | `Settings → Screen Overlays` → overlay displays | Not tested |
| 8.6 | Placement broadcast reaches registered attendees | Not tested |

---

## 9. Insights

| # | Scenario | Status |
|---|----------|--------|
| 9.1 | **Analytics → Revenue** reflects paid invoices from §5–§7, **net of credit notes** | Not tested |
| 9.2 | **Analytics → Trainings Statistics** loads | Not tested |

---

## 10. Users & DSGVO

| # | Scenario | Status |
|---|----------|--------|
| 10.1 | `My Company → Users` — five actions: Toggle access, Resend invite, Reset password, Impersonate, Merge with… | Not tested |
| 10.2 | Each action writes an audit log **and** a History-tab entry | Not tested |
| 10.3 | Deactivation is **blocked** while the user has a non-parked attendee on an active registration or accepted offer | Not tested |
| 10.4 | Attendee portal self-service (`/{tenant-slug}/portal/trainings`) | Not tested |
| 10.5 | Data-subject export request produces a complete export | Not tested |
| 10.6 | Data-subject deletion request | Not tested |
| 10.7 | Privacy requests queue is visible to admins | Not tested |
| 10.8 | Audit trail records attendee lifecycle events | Not tested |

---

## Appendix A — Scenarios you cannot run from the UI

The browser form validates client-side and hides the honeypot, so a few scenarios must go straight at the API. Endpoint:

```
POST http://localhost:8000/api/v1/portal/{tenant-slug}/trainings/register
```

### A.1 — Base payload

Save as `reg.json` and edit per recipe. Get `placement_id` from A.7.

```json
{
  "placement_id": "PASTE-PLACEMENT-UUID",
  "language": "en",
  "billing": {
    "company_name": "QA GmbH",
    "street": "Teststrasse 1",
    "postal_code": "10115",
    "city": "Berlin",
    "country": "DE",
    "contact_first_name": "QA",
    "contact_last_name": "Tester",
    "contact_email": "qa-billing@bjvsoft.net",
    "payment_method": "bank_transfer"
  },
  "attendees": [
    { "first_name": "Ada", "last_name": "Lovelace", "email": "attendee-t1@bjvsoft.net", "exam_mode": "none" }
  ]
}
```

Send it:

```bash
curl -i -X POST http://localhost:8000/api/v1/portal/{tenant-slug}/trainings/register \
  -H 'Content-Type: application/json' -d @reg.json
```

> Omit `form_start_timestamp` entirely and the 5-second time-trap is skipped — that is why curl can register instantly while the browser cannot.

### A.2 — The ambiguous 404 (§4.1.1, §4.1.6)

Wrong tenant: send `reg.json` to a **different** tenant's slug.
Nonexistent placement: set `"placement_id": "00000000-0000-0000-0000-000000000000"`.

Both → `404 {"detail":"Training not found or not available for registration"}`.

### A.3 — Honeypot (§4.3.1)

Add to `reg.json`: `"honeypot_field": "i-am-a-bot"` → `400 {"detail":"Invalid form submission"}`.

### A.4 — Form time-trap (§4.3.2)

Add a timestamp of *now*, which is < 5 s old:

```bash
jq --arg t "$(date +%s)" '.form_start_timestamp = ($t|tonumber)' reg.json > reg-fast.json
curl -i -X POST http://localhost:8000/api/v1/portal/{tenant-slug}/trainings/register \
  -H 'Content-Type: application/json' -d @reg-fast.json
```

→ `400 {"detail":"Form submitted too quickly. Please review your information."}`

### A.5 — Attendee-count guards (§4.4)

Zero attendees → `422 "At least one attendee is required"`:

```bash
jq '.attendees = []' reg.json > reg-zero.json
```

101 attendees → `422 "Maximum 100 attendees per registration"`:

```bash
jq '[range(101)] as $i | .attendees = ($i | map({
  first_name:"A", last_name:"B", email:("bulk-\(.)@bjvsoft.net"), exam_mode:"none"
}))' reg.json > reg-101.json
```

### A.6 — Corrupt park history (§6.3)

After parking an attendee, drop their history rows so `find_old_registration` returns `None`.

**Do not try to match on email.** `training_attendees` has no `email` column — it stores `email_encrypted` + `email_hash`, and `email` is a Python property. Match on name and status instead, both of which are plaintext:

```bash
# 1. find the parked attendee
docker compose exec db psql -U saasconf -d saasconf -c \
  "SELECT id, first_name, last_name, status FROM training_attendees WHERE status = 'parked';"

# 2. drop their history (use the name from the A.1 payload)
docker compose exec db psql -U saasconf -d saasconf -c \
  "DELETE FROM training_attendee_history
    WHERE attendee_id IN (
      SELECT id FROM training_attendees
       WHERE first_name = 'Ada' AND last_name = 'Lovelace' AND status = 'parked');"
```

Then reassign from the Parking Lot. **Expected:** no 500 (this regressed on 2026-04-17 with a `NotNullViolationError` — street / postal_code / city / country are `NOT NULL` and were being passed `None`).

### A.7 — Useful SQL

```bash
# tenant slugs
docker compose exec db psql -U saasconf -d saasconf -c "SELECT name, slug FROM tenants;"

# published placements available to the portal
docker compose exec db psql -U saasconf -d saasconf -c \
  "SELECT pyt.id, pyt.start_date, pyt.placement_type, tpy.status
     FROM program_year_trainings pyt
     JOIN training_program_years tpy ON tpy.id = pyt.program_year_id
    WHERE tpy.status = 'published' AND pyt.start_date >= CURRENT_DATE;"
```

If A.7 returns **zero rows**, the portal will 404 no matter what you send. Go back to §3.4.

---

## Appendix B — Where these behaviours live in the code

For whoever needs to confirm a claim in this document, or update it after a change.

| Behaviour | Source |
|---|---|
| Registration endpoint, `3/hour` limiter | `backend/app/api/v1/portal/training_portal/registration.py:68` |
| The six 404 conditions | `registration.py:121-142` |
| Registration-window 403 | `registration.py:106-118` |
| 0 / >100 attendee guards (422) | `registration.py:144-148` |
| Honeypot, 5 s trap, disposable email → **400** | `backend/app/core/security/registrations.py:110-128` |
| Disposable domain list | `security/registrations.py:20` |
| Rate limit skipped when `DEBUG` | `security/registrations.py:131` |
| `DEBUG` defaults to `False` | `backend/app/config.py:39` |
| **Invoice created `sent`, or `paid` for card + payment intent — never `draft`** | `backend/app/core/training_invoice_generation.py:91` |
| Invoice creation is idempotent per registration | `training_invoice_generation.py` (early return on existing) |
| Attendee dedup by `(tenant_id, lowered email)` | `backend/app/core/training_attendee_resolver.py` |
| `mark-paid` endpoint | `backend/app/api/v1/trainings/invoice_operations.py:282` |
| Cancel vs replace refund asymmetry | `backend/app/core/invoice/replacement.py`, `attendee_reassignment.py` |
| Sidebar labels used in this doc | `frontend/src/pages/Trainings/trainingSections.ts` |
| Public portal route | `frontend/src/App.tsx:487` |

Automated coverage already exists for much of §4–§7 — see `backend/tests/trainings/` and `backend/tests/invoices/test_training_invoice_no_refund.py`. The one untested seam is registration → invoice: `test_training_portal.py` drives the endpoint but never asserts on the invoice it creates.

---

## Known Handbook inaccuracies

Found while writing this doc. The **code is correct**; the Handbook wording misleads. Filed as follow-ups, not fixed here.

1. **`t-invoices` lifecycle diagram** shows `Draft → Sent → Paid`. True for admin-created invoices; portal registrations enter at `Sent` (bank transfer) or `Paid` (card) and never pass through `Draft`.
2. **`t-invoices`** says "a Stripe payment link is created when the invoice is sent." True only for admin-created card invoices — portal card registrations are `Paid` on creation and never *sent*.
3. **`t-parking-lot`** says Parking Lot sits "between Attendees and Trainers" in the sidebar. It sits between **Attendees and Users**; Trainers is in the Setup group.
