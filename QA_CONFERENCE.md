# Conference Module — QA

Status labels: `RETEST` — fix committed, verify it works | `FAIL` — still broken | `BLOCKED` — depends on another fix | `SKIP` — not implemented yet

---

## Test Users

| Email | Password | Role |
|---|---|---|
| `admin@saasconf.com` | `changeme123` | Super Admin |
| `admin@bjvsoft.net` | `Test1234!` | Conferences Admin |
| `conf.member@bjvsoft.com` | `Test1234!` | Conferences Member |
| `superuser@bjvsoft.com` | `Test1234!` | Super User (all modules) |
| `training.only@bjvsoft.com` | `Test1234!` | Trainings Admin only |
| `speaker-external@bjvsoft.net` | `Speaker1234!` | CFP portal — speaker |
| `attendee-external@bjvsoft.net` | `Attend1234!` | Public registration |

> Invite links and password-setup tokens appear in the **backend terminal** (look for `=== EMAIL ===`). MailHog also catches them at http://localhost:8025.

---

## 0. Prerequisites

| # | Scenario | Status |
|---|----------|--------|
| 0.4 | Conference appears in sidebar after creation | FAIL: appears under `/modules/conferences`, not in a sidebar |

---

## 0.5 Roles & Access Control

| # | Scenario | Status |
|---|----------|--------|
| 0.5.1.2 | `Conferences Member` can view but not edit | OK |
| 0.5.1.4 | User with only `Trainings` role does NOT see Conferences module | Not tested |
| 0.5.1.5 | `Super User` toggle hidden from non-privileged editors | OK |
| 0.5.1.6 | Invite form only shows roles for enabled modules | OK |
| 0.5.1.7 | `Conferences Member` cannot access Settings tab | OK — read-only |
| 0.5.1.8 | A user cannot modify their own roles | FAIL |

**Notes:**
- Training module still appears in left panel for Conferences-only users (0.5.1.3 — partially fixed, sidebar filters but module link remains)
- Invite form shows Super User + all module roles even for tenant-only admins — related to 0.5.1.6

---

## 1. Event Setup

| # | Scenario | Status |
|---|----------|--------|
| 1.1.1 | Conference dates display correctly on public portal | OK |
| 1.3.1–1.3.2 | Social media links — save confirmation toast | FAIL: no toast feedback |
| 1.4.2.4 | Public registration portal loads without error | OK — shows "Registration not open yet" when no booking options configured |
| 1.4.2.4b | Registration portal shows form when booking options + active period are set | OK |
| 1.4.2.5 | Add a registration policy | OK |
| 1.4.2.6 | Custom registration question — "Question" label + Textarea type | RETEST (fix: f29d83b) |
| 1.4.3.1 | CFP field ID validation shows friendly error | RETEST (fix: f29d83b) |
| 1.4.4.1 | Toast notifications appear top-right | RETEST (fix: f29d83b) |
| 1.4.4.1 | Email header/footer included in invitation emails | FAIL |
| 1.4.4.2 | Email template editor — missing padding left/right | FAIL (cosmetic) |
| 1.4.4.3 | Resend verification email via Pending Verifications | BLOCKED — needs speakers |
| 1.4.4.6 | Create a recipient list | BLOCKED — needs applicants |
| 1.4.5.6 | Badge designer is findable in Settings | RETEST (fix: df02df9) |
| 1.4.5.8 | Automated payment reminders | SKIP — not implemented |
| 1.5.1 | Deadline fields have consistent CSS style | FAIL (cosmetic) |
| 1.5 | Deadline icons missing tooltips + no save toast | FAIL |
| 1.6.1 | Location list shows only venues, not child rooms | FAIL: `main_hall` shows in parent list |
| 1.6 | Locations — no save/fail toast | FAIL |
| ZUGFeRD | Enable e-invoicing without crashing | RETEST (fix: d1ad98e + dae75e6) |

---

## 2. Content

| # | Scenario | Status |
|---|----------|--------|
| 2.1.3 | Add committee member and assign topics | FAIL: UI not findable |
| 2.1.4 | Submit paper via public CFP portal | RETEST (fix: 8438653) |
| 2.1.5–2.1.8 | Review / accept / reject papers | BLOCKED by 2.1.4 |
| 2.2.5 | Published program visible on public portal | RETEST (fix: 70929f4) |
| 2.3.1–2.3.2 | Session types | Not tested |

---

## 3. People

| # | Scenario | Status |
|---|----------|--------|
| 3.1.2 | Add committee member without MissingGreenlet error | RETEST (fix: d1ad98e) |
| 3.2.2 | Edit speaker profile | FAIL: changes don't save |
| 3.3.1 | Register via CFP portal then log in | RETEST (fix: 8438653) |
| 3.3.3 | User address fields save correctly | FAIL |
| 3.4.1–3.4.2 | Attendee appears after registration | BLOCKED by 5.2.1 |
| 3.6.1 | Alumni list | BLOCKED — needs past conferences |

---

## 4. Partnerships

| # | Scenario | Status |
|---|----------|--------|
| 4.1.2 | Assign sponsor to a tier from the sponsor form | FAIL: flow unclear |
| 4.1.4 | Sponsor package creation discoverable from Sponsors tab | RETEST (fix: ab60cab) |
| 4.1.5 | Sponsor invoice — accounting email warning shown upfront | RETEST (fix: dae75e6) |

---

## 5. Registration & Finance

| # | Scenario | Status |
|---|----------|--------|
| 5.2.1 | Complete registration via public portal | OK — invoice email delivered to MailHog |
| 5.2.2–5.2.3 | Registration in admin / attendee swap | RETEST |
| 5.3.1–5.3.5 | Invoicing flows | RETEST |
| 5.4.1–5.4.2 | Payment reminders | RETEST |
| 5.5.2 | Speaker expense / allowance | BLOCKED — needs speakers |

---

## 6. Communications

| # | Scenario | Status |
|---|----------|--------|
| 6.1.1 | Send message to recipient list — arrives in MailHog | RETEST (fix: SMTP_HOST=localhost) |
| 6.1.3 | Bulk send via email template — arrives in MailHog | RETEST (fix: SMTP_HOST=localhost) |
| 6.2.1 | News article email renders HTML correctly | RETEST (fix: 12d036a) |
| 6.2.2 | Published news article visible on public portal | RETEST (fix: 70929f4) |
| 6.2.3 | Unpublishing removes article from portal | FAIL: behaviour unconfirmed |

---

## 7. Insights

All analytics views loaded OK in previous session — skip unless a regression is suspected.
