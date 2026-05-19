# QA — Sponsor Tier Assignment Flow

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| Conferences Member | `conf.member@bjvsoft.com` | `Test1234!` | Pre-seeded |

---

## Pre-conditions — create sponsor packages (tiers)

> Tiers must exist before you can assign one to a sponsor.

1. Log in as **Conferences Admin**.
2. Open a conference → **Settings** → find the **Sponsor Packages** tab.
3. Create three packages:
   - Name: `Gold` | Price: `5000` | Color: `#f59e0b`
   - Name: `Silver` | Price: `2500` | Color: `#9ca3af`
   - Name: `Bronze` | Price: `1000` | Color: `#92400e`
4. Save each package.

---

## Scenario A — Tier label is clear in the sponsor form

**Role:** Conferences Admin

1. Open a conference → **Sponsors** tab.
2. Click **Add Sponsor** (or equivalent).
3. In the create form, look for the field that lets you assign a tier/package.
4. **Expected:** The field is labelled **"Sponsorship Tier (Package)"** or similar — the word "Tier" is visible.
5. **Expected:** A helper text below the field reads something like:
   _"Tiers are managed in Settings → Sponsor Packages."_

**PASS:** "Tier" label and helper text visible.
**FAIL:** Field only says "Package" with no context.

---

## Scenario B — Assign a tier when creating a sponsor

**Role:** Conferences Admin

1. In the Add Sponsor form:
   - Company name: `ACME Corp`
   - Select tier: `Gold`
2. Submit the form.
3. **Expected:** Success toast. `ACME Corp` appears in the sponsor list.
4. In the sponsor list row for `ACME Corp`:
5. **Expected:** A coloured badge showing **"Gold"** is visible (amber/gold colour).

**PASS:** Badge shown in list row.
**FAIL:** Tier/package name shown as plain small text or not shown at all.

---

## Scenario C — Sponsor without a tier shows a placeholder

**Role:** Conferences Admin

1. Add another sponsor: `No-Tier Corp` — leave the tier/package field blank.
2. Submit.
3. In the sponsor list, find `No-Tier Corp`.
4. **Expected:** The tier column shows a placeholder such as _"No tier"_ (greyed out).

**PASS:** Placeholder shown.
**FAIL:** Column blank / nothing shown / "-" character.

---

## Scenario D — Empty-state package list links to Settings

**Role:** Conferences Admin on a conference with NO packages created yet.

> Use a brand-new conference for this scenario, or temporarily delete all packages.

1. Open the Add Sponsor form on a conference with no packages.
2. Look at the tier/package dropdown area.
3. **Expected:** A message like _"No tiers yet."_ is shown, and the words
   **"Settings → Sponsor Packages"** are a clickable link.
4. Click the link.
5. **Expected:** Navigates directly to the Sponsor Packages settings tab.

**PASS:** Clickable link navigates to the correct settings tab.
**FAIL:** Message is plain text with no link; user must navigate manually.

---

## Scenario E — Member cannot create sponsors but can see tier badges

**Role:** Conferences Member (`conf.member@bjvsoft.com`)

1. Open a conference → Sponsors tab.
2. **Expected:** The "Add Sponsor" button is hidden or disabled.
3. **Expected:** Existing sponsors in the list show their tier badges.

**PASS:** Read-only for member; badges still visible.
**FAIL:** Badges missing for member role, or member can add sponsors.
