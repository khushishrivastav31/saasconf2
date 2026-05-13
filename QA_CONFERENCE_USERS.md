# Conference Module — Test User Reference

Use these accounts when running the QA checklist. Create them in order — each
persona maps to a specific section of `QA_CONFERENCE.md`.

> **Email in dev:** no MailHog. The project uses Resend. When `RESEND_API_KEY`
> is empty (default local setup), every outgoing email is printed to the backend
> terminal as `=== EMAIL ===`. Watch that output to grab verification links,
> invite tokens, and password-reset URLs.

---

## System account (pre-created by seed)

| Email | Password | Role |
|---|---|---|
| `admin@saasconf.com` | `changeme123` | Super Admin — full platform access |

---

## Tenant-scoped accounts (create via Admin → Team)

These users are invited through the tenant **Team** page. Their role controls
which modules they can see and edit.

| Email | Suggested password | Module role | Covers QA scenario |
|---|---|---|---|
| `admin@bjvsoft.net` | `Test1234!` | Conferences → Admin | 0.5.1.1, 0.5.1.3, 1.2.x |
| `conf.member@bjvsoft.com` | `Test1234!` | Conferences → Member | 0.5.1.2, 0.5.1.7 |
| `superuser@bjvsoft.com` | `Test1234!` | Super User toggle ON | 0.5.1.5 |
| `training.only@bjvsoft.com` | `Test1234!` | Trainings → Admin (no Conferences) | 0.5.1.4 |
| `accounting.only@bjvsoft.com` | `Test1234!` | Accounting → Admin (no Conferences) | general isolation check |

> All `@bjvsoft.com` addresses are fake — no actual email will be sent. You still
> need to copy the setup-password link from the backend terminal to activate
> each account.

---

## Conference-level team members (create via Conference → Team tab)

These are added inside a specific conference, not at the tenant level.

| Email | Suggested password | Conference role | Covers QA scenario |
|---|---|---|---|
| `conf.manager@test.local` | `Test1234!` | Conference Manager | 1.2.1, 1.2.2 |

---

## Portal / external users (self-register or invited via CFP)

These users go through the **public portal** — they are NOT tenant team members.

| Email | Suggested password | Portal role | Covers QA scenario |
|---|---|---|---|
| `speaker-external@bjvsoft.net` | `Speaker1234!` | CFP submitter → Speaker | 2.1.4, 2.1.7, 3.2.x |
| `cospeaker-external@bjvsoft.net` | `Speaker1234!` | Co-speaker (invited) | 2.1.4 (add co-author) |
| `reviewer-external@bjvsoft.net` | `Reviewer1234!` | Committee member | 2.1.3, 2.1.5, 2.1.6, 3.1.x |
| `attendee-external@bjvsoft.net` | `Attend1234!` | Public registration | 3.3.1, 3.4.x, 5.2.x |
| `volunteer-external@bjvsoft.net` | `Volunteer1234!` | Volunteer | 3.5.x |

> Portal users self-register at `http://localhost:3000/<tenant-slug>/portal`.
> Their email-verification link will appear in the **backend terminal** — copy
> it and open it in the browser to complete signup.

---

## Quick setup order

1. Log in as `admin@saasconf.com`.
2. Create a tenant (e.g. slug `trendig`).
3. Create a conference inside that tenant (e.g. `atd2026`).
4. Invite tenant-scoped users from the tenant **Team** page.
5. Add `conf.manager@test.local` from the **Conference → Team** tab.
6. Use `speaker@external.test` / `attendee@external.test` through the public
   portal to test CFP and registration flows.

---

## Password rules (local dev)

Passwords need at least 8 characters. The suggestions above (`Test1234!`) meet
any standard strength check. Change them to whatever is convenient — the
checklist only cares about the **role**, not the password value.
