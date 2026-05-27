# QA — Committee Member Add + Topic Assignment UI

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| New committee member | `reviewer@bjvsoft.net` | (set via invite) | See "Create a committee member" below |

### Create a committee member

A committee member is a person added to the CFP Program Committee to review
paper submissions. They do not need to be a portal user — they are invited
via admin UI.

1. Log in as **Conferences Admin**.
2. Open a conference → CFP → **Program Committee**.
3. Click **Add member** (or **Invite member**).
4. Enter email: `reviewer@bjvsoft.net` and assign a committee role (e.g. "Reviewer").
5. Click Send.
6. Open MailHog at http://localhost:8025.
7. Find the invitation/verification email sent to `reviewer@bjvsoft.net`.
8. Click the link to complete account setup (set a password).

---

## Pre-conditions

- Conference has CFP enabled.
- At least one CFP topic/track exists (needed for Scenario C).
  - Create topics in: conference → Settings → Review Criteria tab (or CFP Topics, depending on navigation).

---

## Scenario A — "Program Committee" is findable in the navigation

**Role:** Conferences Admin

1. Open a conference.
2. Look at the CFP section in the tab/sidebar navigation.
3. **Expected:** A clearly labelled link **"Program Committee"** is visible within the CFP section.
4. Click it.
5. **Expected:** A committee member list page/panel loads — it is NOT a settings tab for roles.

**PASS:** "Program Committee" link visible and navigates to the member list.
**FAIL:** No link visible, or the link leads to the roles/permissions settings instead.

---

## Scenario B — Add a committee member

**Role:** Conferences Admin

1. On the Program Committee page, click **Add member** (or **Invite member**).
2. **Expected:** A modal or form appears with an email field and a role/position selector.
3. Enter email: `newreviewer@example.com` and a role.
4. Submit.
5. **Expected:** A success toast appears.
6. **Expected:** `newreviewer@example.com` appears in the committee member list.
7. Open MailHog → confirm an invitation email was sent to `newreviewer@example.com`.

**PASS:** Member appears in list; invitation email sent.
**FAIL:** Form doesn't appear, submission fails silently, or no email sent.

---

## Scenario C — Assign topics to a committee member

**Role:** Conferences Admin

> Pre-condition: at least one CFP topic exists (e.g. "Machine Learning", "Security").

1. On the Program Committee page, find an existing member.
2. **Expected:** A topic assignment field (multi-select, chips, or dropdown) is visible next to or beneath the member row.
3. Select the topic **"Machine Learning"** for this member.
4. Save the assignment.
5. **Expected:** Success feedback (toast or inline confirmation).
6. Reload the page.
7. **Expected:** The selected topic is still shown for that member.

**PASS:** Topic assignment persists after reload.
**FAIL:** Topic selector not visible, or selection not saved after reload.

---

## Scenario D — Committee member can log in and see their assigned papers

**Role:** Committee member (`reviewer@bjvsoft.net`)

1. Log in to the CFP portal at `http://localhost:3000/{tenant-slug}/portal`.
2. **Expected:** The member can access the review queue or assigned papers view.
3. Papers assigned to topics that match the member's assigned topics should be visible.

**PASS:** Member can access their review queue.
**FAIL:** Login fails or member sees an empty/error page.

---

## Scenario E — Add member button is visually prominent

**Role:** Conferences Admin (visual / accessibility check)

1. Open Program Committee.
2. **Expected:** The "Add member" button has a primary style (solid colour fill, not just a ghost/text link) so it is immediately actionable at a glance.
3. Tab to the button using keyboard only.
4. **Expected:** The button receives a visible focus ring.

**PASS:** Button is prominent and keyboard accessible.
**FAIL:** Button is styled as a small link and easy to miss.
