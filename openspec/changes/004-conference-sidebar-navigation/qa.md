# QA — Conference Sidebar Navigation

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Super Admin | `admin@saasconf.com` | `changeme123` | Pre-seeded |
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| Conferences Member | `conf.member@bjvsoft.com` | `Test1234!` | Pre-seeded; or: log in as Conferences Admin → My Company → Members → Invite → assign "Conferences Member" role |

> **Invite links and tokens** appear in the backend terminal (`=== EMAIL ===`) and at
> http://localhost:8025 (MailHog).

---

## Pre-conditions

- At least one conference exists for the `bjvsoft` tenant.
- If none exist: log in as Conferences Admin → Conferences → New Conference → fill in name and dates → Save.

---

## Scenario A — Sidebar shows conference when inside conference detail

**Role:** Conferences Admin (`admin@bjvsoft.net`)

1. Log in at `http://localhost:3000`.
2. Navigate to **Conferences** in the left sidebar → click the list link → open any conference.
3. **Expected:** The left sidebar now shows the conference name as a section heading, with sub-links: Overview, CFP, Registration, Program, Sponsors, Communications, Insights, Settings.
4. **Expected:** The currently-active sub-section is visually highlighted.
5. Click each sub-link in turn.
6. **Expected:** The URL changes to the correct `?section=` param and the active highlight updates.

**PASS:** Conference name + sub-links visible and functional.
**FAIL:** Only the generic "Conferences" list link is shown with no conference-specific nav.

---

## Scenario B — Sidebar does NOT show sub-links on the conferences list page

**Role:** Conferences Admin

1. Navigate to `/modules/conferences` (the conference list).
2. **Expected:** The sidebar shows only the generic "Conferences" list link. No conference-specific sub-nav is rendered.

**PASS:** No sub-nav section on the list page.
**FAIL:** A conference sub-nav appears even though no conference is open.

---

## Scenario C — "Recent" conference entry when no conference route is active

**Role:** Conferences Admin (at least one conference must exist)

1. Navigate to any page that is NOT a conference detail (e.g. Dashboard).
2. **Expected:** A collapsed "recent conference" entry is visible in the sidebar beneath the "Conferences" list link, showing the name of the most recently updated conference.
3. Click the entry.
4. **Expected:** Navigates directly to that conference's detail page.

**PASS:** Collapsed entry present and clickable.
**FAIL:** No entry shown, or entry navigates to wrong conference.

---

## Scenario D — Conferences Member can see sidebar nav (read-only)

**Role:** Conferences Member (`conf.member@bjvsoft.com`)

1. Log in → open a conference.
2. **Expected:** Sidebar shows the same conference sub-links as admin.
3. Click "Settings" sub-link.
4. **Expected:** Settings tab loads (read-only access).

**PASS:** Nav renders for member role.
**FAIL:** Nav missing or crashes for member role.

---

## Scenario E — Dark mode

1. Toggle dark mode (top-right theme switcher or system preference).
2. Open a conference.
3. **Expected:** Sidebar conference name and sub-links use dark-mode colour variants — no white text on white background, no invisible highlights.

**PASS:** Sidebar is readable in dark mode.
**FAIL:** Colours broken or invisible.
